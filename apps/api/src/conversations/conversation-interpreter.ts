import { Injectable } from '@nestjs/common';
import type { ServiceRequestStatus } from '../generated/prisma/enums';
import type { RequestStep } from '../requests/request-workflow';
import { ConversationIntent, type SelectionAction } from './conversation.dto';

export const CONVERSATION_INTERPRETER = Symbol('CONVERSATION_INTERPRETER');

export interface InterpretationContext {
  status: ServiceRequestStatus | null;
  step: RequestStep | null;
  selected: { study: boolean; clinic: boolean; datetime: boolean };
  availableActions: SelectionAction[];
}

export interface ConversationInterpretation {
  intent: ConversationIntent;
  confidence?: number;
  parameters?: {
    studyName: string | null;
    clinicName: string | null;
    scheduledAt: string | null;
    needsClarification: boolean;
  };
  replySuggestion?: string | null;
}

export interface ConversationInterpreter {
  interpret(
    message: string, getContext: () => Promise<InterpretationContext>,
  ): ConversationInterpretation | Promise<ConversationInterpretation>;
}

export function normalizeSpanish(message: string): string {
  return message.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

const rules: [RegExp, ConversationIntent][] = [
  [/\b(asesor|asesora|operador|operadora|persona|call center|atencion humana)\b/, ConversationIntent.TALK_TO_ADVISOR],
  [/\b(cita|citas)\b/, ConversationIntent.APPOINTMENT_STATUS],
  [/\b(continuar|reanudar|retomar|seguir)\b/, ConversationIntent.RESUME_REQUEST],
  [/\b(estado|estatus|avance|progreso|como va)\b/, ConversationIntent.REQUEST_STATUS],
  [/\b(estudio|estudios|analisis)\b/, ConversationIntent.SELECT_STUDY],
  [/\b(clinica|clinicas|sede|sedes|sucursal)\b/, ConversationIntent.SELECT_CLINIC],
  [/\b(fecha|hora|horario|horarios)\b/, ConversationIntent.SELECT_DATETIME],
  [/\b(ayuda|opciones|menu|comandos)\b/, ConversationIntent.HELP],
  [/\b(hola|buen dia|buenos dias|buenas tardes|buenas noches)\b/, ConversationIntent.GREETING],
];

@Injectable()
export class SpanishConversationInterpreter implements ConversationInterpreter {
  interpret(message: string): ConversationInterpretation {
    const normalized = normalizeSpanish(message);
    return { intent: rules.find(([pattern]) => pattern.test(normalized))?.[1] ?? ConversationIntent.UNKNOWN };
  }
}
