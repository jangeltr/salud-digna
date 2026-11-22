import { createHash } from 'node:crypto';
import { isUUID } from 'class-validator';
import { SelectionAction, type ConversationMessageDto } from '../conversations/conversation.dto';

export type QueuedInput =
  | { kind: 'link'; linkId: string; digest: string }
  | { kind: 'invalid_link' }
  | { kind: 'message'; message: string };

export function asObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function queueInput(text: string): QueuedInput {
  const [command, linkId, code, ...rest] = text.split(/\s+/);
  if (command.toLowerCase() !== 'vincular') return { kind: 'message', message: text };
  if (!linkId || !isUUID(linkId) || !code || rest.length) return { kind: 'invalid_link' };
  return { kind: 'link', linkId, digest: createHash('sha256').update(code).digest('hex') };
}

const selectionTypes: Record<string, SelectionAction> = {
  estudio: SelectionAction.SELECT_STUDY, clinica: SelectionAction.SELECT_CLINIC, fecha: SelectionAction.SELECT_DATETIME,
};

export function conversationInput(text: string): ConversationMessageDto | undefined {
  const [command, ...args] = text.split(/\s+/);
  switch (command.toLowerCase()) {
    case 'solicitud': {
      const [requestId, ...message] = args;
      if (!requestId || !isUUID(requestId)) return undefined;
      return { requestId, message: message.join(' ') || 'Continuar mi solicitud' };
    }
    case 'seleccionar': {
      const [field, requestId, rawVersion, value] = args;
      if (args.length !== 4 || !Object.hasOwn(selectionTypes, field) || !isUUID(requestId) ||
          !/^\d+$/.test(rawVersion) || Number(rawVersion) < 1 || Number(rawVersion) > 2147483647 ||
          !value || value.length > 100) return undefined;
      return { message: 'Guardar selección', requestId, version: Number(rawVersion), action: { type: selectionTypes[field], value } };
    }
    default: return { message: text };
  }
}
