import { parseSchedule } from '../requests/request-workflow';
import { ConversationIntent } from './conversation.dto';
import { normalizeSpanish, type ConversationInterpretation } from './conversation-interpreter';

const textOrNull = { type: ['string', 'null'] };
const intents: readonly string[] = Object.values(ConversationIntent);

export const interpretationFormat = {
  type: 'json_schema',
  name: 'appointment_conversation',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['intent', 'confidence', 'parameters', 'replySuggestion'],
    properties: {
      intent: { type: 'string', enum: intents },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['studyName', 'clinicName', 'scheduledAt', 'needsClarification'],
        properties: {
          studyName: textOrNull,
          clinicName: textOrNull,
          scheduledAt: textOrNull,
          needsClarification: { type: 'boolean' },
        },
      },
      replySuggestion: textOrNull,
    },
  },
} as const;

export function asObject(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function optionalText(value: unknown, max: number): value is string | null {
  return value === null || (typeof value === 'string' && value.trim().length > 0 && value.length <= max);
}

export function parseInterpretation(
  text: string, message: { text: string; explicitScheduledAt: string | null },
): ConversationInterpretation | undefined {
  const output = asObject(JSON.parse(text));
  if (!output || Object.keys(output).length !== 4) return undefined;
  const { intent, confidence, parameters, replySuggestion } = output;
  const params = asObject(parameters);
  if (typeof intent !== 'string' || !intents.includes(intent) || !Number.isFinite(confidence) ||
      typeof confidence !== 'number' || confidence < 0 || confidence > 1 ||
      !params || Object.keys(params).length !== 4 || !optionalText(params.studyName, 120) ||
      !optionalText(params.clinicName, 120) || !optionalText(params.scheduledAt, 40) ||
      typeof params.needsClarification !== 'boolean' || !optionalText(replySuggestion, 240)) {
    return undefined;
  }

  const nameFromMessage = (name: string | null) => {
    const normalized = name ? normalizeSpanish(name.trim()) : '';
    return normalized && ` ${message.text} `.includes(` ${normalized} `) ? normalized : null;
  };
  const date = params.scheduledAt ? parseSchedule(params.scheduledAt)?.toISOString() : null;
  const scheduledAt = date && date === message.explicitScheduledAt ? date : null;
  return {
    intent: intent as ConversationIntent,
    confidence,
    parameters: {
      studyName: intent === ConversationIntent.SELECT_STUDY ? nameFromMessage(params.studyName) : null,
      clinicName: intent === ConversationIntent.SELECT_CLINIC ? nameFromMessage(params.clinicName) : null,
      scheduledAt: intent === ConversationIntent.SELECT_DATETIME ? scheduledAt : null,
      needsClarification: params.needsClarification || (intent === ConversationIntent.SELECT_DATETIME && !scheduledAt),
    },
    replySuggestion,
  };
}
