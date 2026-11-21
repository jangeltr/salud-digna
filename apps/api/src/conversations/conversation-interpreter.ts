import { Injectable } from '@nestjs/common';
import { ConversationIntent } from './conversation.dto';

export const CONVERSATION_INTERPRETER = Symbol('CONVERSATION_INTERPRETER');

export interface ConversationInterpreter {
  interpret(message: string): ConversationIntent | Promise<ConversationIntent>;
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
  interpret(message: string): ConversationIntent {
    const normalized = message.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    return rules.find(([pattern]) => pattern.test(normalized))?.[1] ?? ConversationIntent.UNKNOWN;
  }
}
