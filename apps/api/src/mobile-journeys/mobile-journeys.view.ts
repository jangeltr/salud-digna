import { BadGatewayException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { cursorFormat, journeyStatuses, journeySteps, type MobileJourneyContextDto, type MobileJourneyHistoryDto } from './mobile-journeys.dto';

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadGatewayException();
  return value as Record<string, unknown>;
}

export function uuid(value: unknown): string {
  if (typeof value !== 'string' || !isUUID(value)) throw new BadGatewayException();
  return value.toLowerCase();
}

function label(value: unknown, max = 64): string {
  if (typeof value !== 'string' || value.length > max || !/^[\w.:-]+(?![\s\S])/.test(value)) {
    throw new BadGatewayException();
  }
  return value;
}

function timestamp(value: unknown): string {
  if (typeof value !== 'string' || value.length !== 24) throw new BadGatewayException();
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) throw new BadGatewayException();
  return value;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isOneOf(value: unknown, values: readonly string[]): value is string {
  return typeof value === 'string' && values.includes(value);
}

export function createdView(input: unknown) {
  const value = record(input);
  if (!isOneOf(value.status, journeyStatuses)) throw new BadGatewayException();
  return { id: uuid(value.id), status: value.status };
}

export function summaryView(input: unknown, expectedId?: string) {
  const value = record(input);
  const summary = createdView(value);
  if (expectedId && summary.id !== expectedId) throw new BadGatewayException();
  return { ...summary, type: label(value.type), createdAt: timestamp(value.createdAt), updatedAt: timestamp(value.updatedAt) };
}

export function listView(input: unknown) {
  const { items } = record(input);
  if (!Array.isArray(items) || items.length > 100) throw new BadGatewayException();
  return { items: items.map((item) => summaryView(item)) };
}

export function contextView(input: unknown, journeyId: string): MobileJourneyContextDto {
  const value = record(input);
  if (uuid(value.journeyId) !== journeyId || !positiveInteger(value.version)) throw new BadGatewayException();
  const refs = record(value.externalRefs);
  const externalRefs: MobileJourneyContextDto['externalRefs'] = {};
  for (const name of ['appointmentId', 'clinicId', 'studyId'] as const) {
    if (typeof refs[name] === 'string' && isUUID(refs[name])) externalRefs[name] = refs[name].toLowerCase();
  }
  return { journeyId, currentStep: label(value.currentStep), version: value.version, externalRefs, updatedAt: timestamp(value.updatedAt) };
}

export function historyView(input: unknown, limit: number): MobileJourneyHistoryDto {
  const { items, nextCursor } = record(input);
  if (!Array.isArray(items) || items.length > limit ||
      (nextCursor !== undefined && (typeof nextCursor !== 'string' ||
        !cursorFormat.test(nextCursor) || nextCursor.trim() !== nextCursor))) throw new BadGatewayException();
  return {
    items: items.map((item) => {
      const { id, type, producerCode, occurredAt, receivedAt, schemaVersion, data } = record(item);
      if (!positiveInteger(schemaVersion)) throw new BadGatewayException();
      const { version, currentStep, from, to } = record(data);
      return {
        id: uuid(id), type: label(type), producerCode: label(producerCode), schemaVersion,
        occurredAt: timestamp(occurredAt), receivedAt: timestamp(receivedAt),
        data: {
          ...(positiveInteger(version) && { version }),
          ...(isOneOf(currentStep, journeySteps) && { currentStep }),
          ...(isOneOf(from, journeyStatuses) && { from }),
          ...(isOneOf(to, journeyStatuses) && { to }),
        },
      };
    }),
    ...(nextCursor !== undefined && { nextCursor }),
  };
}
