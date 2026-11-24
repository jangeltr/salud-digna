import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { JourneyStatus } from '../generated/prisma/enums';

const uuid = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/;
const journeyStatuses = new Set<string>(Object.values(JourneyStatus));
const readableSteps = new Set(['SELECT_STUDY', 'SELECT_CLINIC', 'SELECT_DATETIME', 'REVIEW', 'CONFIRMED']);

interface HistoryPosition {
  occurredAt: Date;
  id: string;
}

export function readHistoryLimit(value: unknown): number {
  if (value === undefined) return 20;
  if (typeof value === 'string' && value.length <= 3) {
    const limit = Number(value);
    if (Number.isInteger(limit) && limit >= 1 && limit <= 100 && String(limit) === value) return limit;
  }
  throw new BadRequestException();
}

export function readHistoryCursor(journeyId: string, value: unknown): HistoryPosition | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^[\w-]{1,200}$/.test(value)) throw new BadRequestException();

  const decoded = Buffer.from(value, 'base64url');
  if (decoded.toString('base64url') !== value) throw new BadRequestException();

  let tuple: unknown;
  try {
    tuple = JSON.parse(decoded.toString('utf8'));
  } catch {
    throw new BadRequestException();
  }
  if (!Array.isArray(tuple) || tuple.length !== 3) throw new BadRequestException();
  const [cursorJourneyId, timestamp, id] = tuple;
  if (cursorJourneyId !== journeyId || typeof timestamp !== 'string' ||
      typeof id !== 'string' || id.length !== 36 || !uuid.test(id)) throw new BadRequestException();

  const occurredAt = new Date(timestamp);
  if (Number.isNaN(occurredAt.getTime()) || occurredAt.toISOString() !== timestamp) throw new BadRequestException();
  return { occurredAt, id };
}

export function createHistoryCursor(journeyId: string, { occurredAt, id }: HistoryPosition): string {
  return Buffer.from(JSON.stringify([journeyId, occurredAt.toISOString(), id])).toString('base64url');
}

export function projectEventData(type: string, schemaVersion: number, payload: Prisma.JsonValue) {
  const data: { version?: number; currentStep?: string; from?: string; to?: string } = {};
  if (schemaVersion !== 1 || !payload || typeof payload !== 'object' || Array.isArray(payload)) return data;

  switch (type) {
    case 'JOURNEY_CONTEXT_UPDATED':
      if (typeof payload.currentStep === 'string' && readableSteps.has(payload.currentStep)) {
        data.currentStep = payload.currentStep;
      }
      break;
    case 'JOURNEY_STATUS_CHANGED':
      for (const key of ['from', 'to'] as const) {
        const status = payload[key];
        if (typeof status === 'string' && journeyStatuses.has(status)) data[key] = status;
      }
      break;
    case 'JOURNEY_CREATED':
    case 'APPOINTMENT_CONFIRMED':
      break;
    default:
      return data;
  }

  if (typeof payload.version === 'number' && Number.isSafeInteger(payload.version) && payload.version > 0) {
    data.version = payload.version;
  }
  return data;
}
