import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AppointmentsService } from '../appointments/appointments.service';
import { ClinicsService } from '../clinics/clinics.service';
import { AppointmentStatus, ServiceRequestStatus } from '../generated/prisma/enums';
import { PrismaService } from '../persistence/prisma.service';
import type { WhatsAppRequestOrigin } from '../requests/request-origin';
import { OPEN_REQUEST_STATUSES, RequestStep } from '../requests/request-workflow';
import { UpdateRequestContextDto, type RequestSnapshotDto } from '../requests/requests.dto';
import { RequestsService } from '../requests/requests.service';
import { StudiesService } from '../studies/studies.service';
import {
  ConversationIntent, SelectionAction,
  type ConversationMessageDto, type ConversationReplyDto, type SuggestedActionDto,
} from './conversation.dto';
import { CONVERSATION_INTERPRETER, type ConversationInterpreter } from './conversation-interpreter';

const selectionFields = {
  SELECT_STUDY: 'studyId', SELECT_CLINIC: 'clinicId', SELECT_DATETIME: 'scheduledAt',
} as const;
const selectionIntents = {
  SELECT_STUDY: ConversationIntent.SELECT_STUDY,
  SELECT_CLINIC: ConversationIntent.SELECT_CLINIC,
  SELECT_DATETIME: ConversationIntent.SELECT_DATETIME,
};
const statusLabels: Record<ServiceRequestStatus, string> = {
  DRAFT: 'en borrador', IN_PROGRESS: 'en curso', PENDING_CONFIRMATION: 'pendiente de confirmación',
  COMPLETED: 'completada', CANCELLED: 'cancelada',
};
const appointmentLabels: Record<AppointmentStatus, string> = {
  PENDING: 'pendiente', CONFIRMED: 'confirmada', CANCELLED: 'cancelada',
};

function response(
  intent: ConversationIntent, reply: string, request?: RequestSnapshotDto, suggestedActions?: SuggestedActionDto[],
): ConversationReplyDto {
  return {
    reply, intent, requestId: request?.id ?? null, currentStep: request?.currentStep ?? null,
    requestStatus: request?.status ?? null, version: request?.version ?? null,
    ...(suggestedActions?.length ? { suggestedActions } : {}),
  };
}

function nextSelection(request: RequestSnapshotDto): SelectionAction | undefined {
  if (request.currentStep === RequestStep.SELECT_STUDY) return SelectionAction.SELECT_STUDY;
  if (request.currentStep === RequestStep.SELECT_CLINIC) return SelectionAction.SELECT_CLINIC;
  if (request.currentStep === RequestStep.SELECT_DATETIME) return SelectionAction.SELECT_DATETIME;
  return undefined;
}

function stepMessage(request: RequestSnapshotDto): string {
  if (request.status === ServiceRequestStatus.COMPLETED) return 'La solicitud ya está completada.';
  if (request.status === ServiceRequestStatus.CANCELLED) return 'La solicitud está cancelada.';

  switch (request.currentStep) {
    case RequestStep.SELECT_STUDY: return 'El siguiente paso es elegir un estudio.';
    case RequestStep.SELECT_CLINIC: return 'El estudio ya está guardado. Elige una clínica.';
    case RequestStep.SELECT_DATETIME: return 'Ya tenemos el estudio y la clínica. Indica la fecha y hora que prefieres.';
    default: return 'Tus selecciones están guardadas para revisión. Confirma desde la aplicación o pide apoyo a un asesor.';
  }
}

function interactionType(origin: WhatsAppRequestOrigin, intent: ConversationIntent, result: 'REPLIED' | 'UPDATED') {
  return `CONVERSATION_${origin.simulated ? 'SIMULATED' : 'WHATSAPP'}_${intent}_${result}`;
}

@Injectable()
export class ConversationService {
  constructor(
    @Inject(CONVERSATION_INTERPRETER) private readonly interpreter: ConversationInterpreter,
    private readonly requests: RequestsService,
    private readonly studies: StudiesService,
    private readonly clinics: ClinicsService,
    private readonly appointments: AppointmentsService,
    private readonly prisma: PrismaService,
  ) {}

  async respond(origin: WhatsAppRequestOrigin, input: ConversationMessageDto): Promise<ConversationReplyDto> {
    const actor = await this.requests.resolveActor(origin);
    const intent = input.action ? selectionIntents[input.action.type] : await this.interpreter.interpret(input.message);

    if (input.action) {
      if (!input.requestId || input.version === undefined) {
        throw new BadRequestException('Indica la solicitud y su versión para guardar una selección.');
      }
      const patch = plainToInstance(UpdateRequestContextDto, {
        version: input.version, [selectionFields[input.action.type]]: input.action.value,
      });
      if ((await validate(patch)).length) {
        throw new BadRequestException('La selección requiere un UUID válido o una fecha ISO 8601 con zona horaria.');
      }
      const updated = await this.requests.updateContext(
        origin, input.requestId, patch, interactionType(origin, intent, 'UPDATED'),
      );
      return response(intent, `Guardé tu selección. ${stepMessage(updated)}`, updated);
    }

    const result = input.requestId
      ? await this.replyToRequest(intent, await this.requests.get(origin, input.requestId), actor.patientId)
      : await this.findConversationRequest(origin, intent, actor.patientId);

    if (result.requestId) {
      await this.prisma.client.interaction.create({
        data: {
          requestId: result.requestId, patientId: actor.patientId, actorUserId: actor.actorUserId,
          channel: actor.channel, type: interactionType(origin, intent, 'REPLIED'),
        },
      });
    }
    return result;
  }

  private async findConversationRequest(origin: WhatsAppRequestOrigin, intent: ConversationIntent, patientId: string) {
    if (intent === ConversationIntent.APPOINTMENT_STATUS) {
      const page = await this.appointments.list(patientId, { page: 1, limit: 5 });
      if (!page.items.length) return response(intent, 'Todavía no tienes citas registradas.');
      if (page.items.length === 1 && !page.hasMore) {
        return this.replyToRequest(intent, await this.requests.get(origin, page.items[0].requestId), patientId);
      }
      return response(intent, 'Tienes varias citas. Elige la solicitud que quieres consultar.', undefined,
        page.items.map((appointment) => ({
          type: 'SELECT_REQUEST', requestId: appointment.requestId,
          label: `${appointment.study.name} · ${appointment.scheduledAt.toISOString()}`,
        })));
    }

    const page = await this.requests.list(origin, { page: 1, limit: 5 }, undefined, true);
    if (!page.items.length) {
      const greeting = intent === ConversationIntent.GREETING ? 'Hola. ' : '';
      return response(intent, `${greeting}No tienes solicitudes abiertas. Puedes iniciar una desde la aplicación.`);
    }
    if (page.items.length === 1 && !page.hasMore) {
      return this.replyToRequest(intent, page.items[0], patientId);
    }

    const actions: SuggestedActionDto[] = page.items.map((request) => ({
      type: 'SELECT_REQUEST', requestId: request.id, label: `Solicitud ${statusLabels[request.status]}`,
    }));
    if (page.hasMore) actions.push({ type: 'LIST_REQUESTS', label: 'Ver todas las solicitudes en la aplicación' });
    return response(intent, 'Tienes varias solicitudes abiertas. Elige cuál quieres continuar.', undefined, actions);
  }

  private async replyToRequest(intent: ConversationIntent, request: RequestSnapshotDto, patientId: string) {
    if (intent === ConversationIntent.APPOINTMENT_STATUS) {
      const appointment = await this.appointments.findForRequest(patientId, request.id);
      const reply = appointment
        ? `Tu cita está ${appointmentLabels[appointment.status]}. Horario registrado: ${appointment.scheduledAt.toISOString()} (UTC).`
        : `Esta solicitud todavía no tiene una cita registrada. ${stepMessage(request)}`;
      return response(intent, reply, request);
    }

    if (intent === ConversationIntent.TALK_TO_ADVISOR && OPEN_REQUEST_STATUSES.includes(request.status)) {
      return response(intent, 'Puedes generar una referencia temporal en la aplicación para que un asesor atienda esta solicitud.',
        request, [{ type: 'REQUEST_ASSISTANCE', label: 'Solicitar referencia de atención', requestId: request.id }]);
    }

    const replies: Partial<Record<ConversationIntent, string>> = {
      [ConversationIntent.GREETING]: 'Hola. ',
      [ConversationIntent.RESUME_REQUEST]: 'Recuperé el avance de tu solicitud. ',
      [ConversationIntent.REQUEST_STATUS]: `Tu solicitud está ${statusLabels[request.status]}. `,
      [ConversationIntent.HELP]: 'Puedo mostrar el avance, las opciones del siguiente paso o el estado de tu cita. ',
      [ConversationIntent.UNKNOWN]: 'No entendí el mensaje. Puedes pedir ayuda o continuar tu solicitud. ',
    };
    const lead = replies[intent] ?? '';

    let selection = nextSelection(request);
    if (OPEN_REQUEST_STATUSES.includes(request.status)) {
      if (intent === ConversationIntent.SELECT_STUDY) selection = SelectionAction.SELECT_STUDY;
      if (intent === ConversationIntent.SELECT_CLINIC && request.context.studyId) selection = SelectionAction.SELECT_CLINIC;
      if (intent === ConversationIntent.SELECT_DATETIME && request.context.clinicId) selection = SelectionAction.SELECT_DATETIME;
    } else {
      selection = undefined;
    }
    const options = await this.selectionOptions(selection, request.id);
    return response(intent, lead + stepMessage(request), request, options);
  }

  private async selectionOptions(selection: SelectionAction | undefined, requestId: string): Promise<SuggestedActionDto[]> {
    if (selection === SelectionAction.SELECT_DATETIME) {
      return [{ type: selection, label: 'Indicar fecha y hora preferidas', requestId }];
    }
    if (!selection) return [];

    const catalog = selection === SelectionAction.SELECT_STUDY ? this.studies : this.clinics;
    const { items } = await catalog.list({ page: 1, limit: 5 });
    return items.map((item) => ({ type: selection, label: item.name, value: item.id, requestId }));
  }
}
