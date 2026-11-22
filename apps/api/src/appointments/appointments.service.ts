import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { activeAssistance, requireAssistance } from '../call-center/assistance-access';
import { isUUID } from 'class-validator';
import { Prisma } from '../generated/prisma/client';
import { AppointmentStatus, Channel, ServiceRequestStatus, ServiceRequestType } from '../generated/prisma/enums';
import { PrismaService } from '../persistence/prisma.service';
import type { WebRequestOrigin } from '../requests/request-origin';
import {
  OPEN_REQUEST_STATUSES, parseSchedule, readRequestContext, RequestStep, requireActiveSelections, versionConflict,
} from '../requests/request-workflow';
import type { RequestPaginationDto } from '../requests/requests.dto';
import type { AppointmentDto, AppointmentPageDto } from './appointments.dto';

type ConfirmationActor = WebRequestOrigin | { channel: typeof Channel.CALL_CENTER; actorUserId: string };

const appointmentFields = {
  id: true,
  requestId: true,
  study: { select: { id: true, name: true } },
  clinic: { select: { id: true, name: true } },
  scheduledAt: true,
  status: true,
  createdAt: true,
} satisfies Prisma.AppointmentSelect;

const requestFields = {
  type: true, status: true, currentStep: true, version: true, lastChannel: true,
} satisfies Prisma.ServiceRequestSelect;
type ConfirmableRequest = Prisma.ServiceRequestGetPayload<{ select: typeof requestFields }>;

function appointmentConflict(): ConflictException {
  return new ConflictException('La cita existente no coincide con la confirmación de la solicitud.');
}

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async confirm(actor: ConfirmationActor, requestId: string, version: number): Promise<AppointmentDto> {
    const { actorUserId, channel } = actor;

    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const patientId = channel === Channel.CALL_CENTER
          ? await requireAssistance(tx, actorUserId, requestId)
          : actor.patientId;
        const request = await this.findRequest(tx, patientId, requestId);
        if (request.status === ServiceRequestStatus.COMPLETED) {
          return this.confirmedAppointment(tx, patientId, requestId, request);
        }
        if (!OPEN_REQUEST_STATUSES.includes(request.status)) {
          throw new ConflictException('La solicitud está cerrada.');
        }
        if (request.version !== version) throw versionConflict();
        if (request.type !== ServiceRequestType.APPOINTMENT ||
            request.status !== ServiceRequestStatus.PENDING_CONFIRMATION ||
            request.currentStep !== RequestStep.REVIEW) {
          throw new BadRequestException('La solicitud debe estar lista para confirmar.');
        }

        const completedAt = new Date();
        const changed = await tx.serviceRequest.updateMany({
          where: {
            id: requestId, patientId, version,
            status: ServiceRequestStatus.PENDING_CONFIRMATION,
            currentStep: RequestStep.REVIEW,
            ...(channel === Channel.CALL_CENTER && {
              assistanceAuthorizations: { some: activeAssistance(actorUserId) },
            }),
          },
          data: {
            status: ServiceRequestStatus.COMPLETED, currentStep: RequestStep.CONFIRMED,
            completedAt, lastChannel: channel, version: { increment: 1 },
          },
        });

        if (!changed.count) {
          if (channel === Channel.CALL_CENTER) await requireAssistance(tx, actorUserId, requestId);
          const latest = await this.findRequest(tx, patientId, requestId);
          if (latest.status === ServiceRequestStatus.COMPLETED) {
            return this.confirmedAppointment(tx, patientId, requestId, latest);
          }
          throw versionConflict();
        }

        const selection = await this.readSelection(tx, requestId);
        if (!selection || selection.scheduledAt.getTime() <= Date.now()) {
          throw new BadRequestException('Selecciona estudio, clínica y una fecha y hora futuras.');
        }
        await requireActiveSelections(tx, selection);

        const appointment = await tx.appointment.create({
          data: {
            requestId, patientId, ...selection, status: AppointmentStatus.CONFIRMED,
          },
          select: appointmentFields,
        });
        const event = { patientId, actorUserId, channel, requestId, createdAt: completedAt };
        const nextVersion = version + 1;
        await tx.domainEvent.createMany({
          data: [
            {
              ...event,
              type: 'APPOINTMENT_CONFIRMED',
              payload: { appointmentId: appointment.id, version: nextVersion },
            },
            {
              ...event,
              type: 'REQUEST_STATUS_CHANGED',
              payload: { from: request.status, to: ServiceRequestStatus.COMPLETED, version: nextVersion },
            },
            ...(request.lastChannel === channel ? [] : [{
              ...event,
              type: 'CHANNEL_SWITCHED',
              payload: { from: request.lastChannel, to: channel, version: nextVersion },
            }]),
          ],
        });

        return appointment;
      }, { isolationLevel: 'ReadCommitted' });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw appointmentConflict();
      }
      throw error;
    }
  }

  async list(
    patientId: string, { page, limit }: RequestPaginationDto, upcoming = false,
  ): Promise<AppointmentPageDto> {
    const items = await this.prisma.client.appointment.findMany({
      where: {
        patientId,
        ...(upcoming && { status: AppointmentStatus.CONFIRMED, scheduledAt: { gt: new Date() } }),
      },
      orderBy: [{ scheduledAt: upcoming ? 'asc' : 'desc' }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit + 1,
      select: appointmentFields,
    });
    return { items: items.slice(0, limit), page, limit, hasMore: items.length > limit };
  }

  async get(patientId: string, id: string): Promise<AppointmentDto> {
    const appointment = await this.prisma.client.appointment.findUnique({
      where: { id, patientId }, select: appointmentFields,
    });
    if (!appointment) throw new NotFoundException('Cita no encontrada.');
    return appointment;
  }

  findForRequest(patientId: string, requestId: string): Promise<AppointmentDto | null> {
    return this.prisma.client.appointment.findUnique({
      where: { requestId, patientId }, select: appointmentFields,
    });
  }

  private async findRequest(tx: Prisma.TransactionClient, patientId: string, id: string) {
    const request = await tx.serviceRequest.findUnique({
      where: { id, patientId }, select: requestFields,
    });
    if (!request) throw new NotFoundException('Solicitud no encontrada.');
    return request;
  }

  private async readSelection(tx: Prisma.TransactionClient, requestId: string) {
    const row = await tx.requestContext.findUnique({ where: { requestId }, select: { data: true } });
    const { studyId, clinicId, scheduledAt } = readRequestContext(row?.data);
    if (!studyId || !clinicId || !scheduledAt || !isUUID(studyId) || !isUUID(clinicId)) return undefined;
    const date = parseSchedule(scheduledAt);
    return date ? { studyId: studyId.toLowerCase(), clinicId: clinicId.toLowerCase(), scheduledAt: date } : undefined;
  }

  private async confirmedAppointment(
    tx: Prisma.TransactionClient, patientId: string, requestId: string, request: ConfirmableRequest,
  ): Promise<AppointmentDto> {
    if (request.type !== ServiceRequestType.APPOINTMENT || request.currentStep !== RequestStep.CONFIRMED) {
      throw appointmentConflict();
    }
    const appointment = await tx.appointment.findUnique({
      where: { requestId, patientId }, select: appointmentFields,
    });
    const selection = await this.readSelection(tx, requestId);
    if (!appointment || appointment.status !== AppointmentStatus.CONFIRMED || !selection ||
        appointment.study.id !== selection.studyId || appointment.clinic.id !== selection.clinicId ||
        appointment.scheduledAt.getTime() !== selection.scheduledAt.getTime()) {
      throw appointmentConflict();
    }
    return appointment;
  }
}
