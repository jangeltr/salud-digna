import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { ResolvedPatient } from './patient-identity';

function objectWithKeys(input: unknown, keys: string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((key) => !keys.includes(key))) {
    throw new BadRequestException();
  }
  return input as Record<string, unknown>;
}

const uuid = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;

function readUuid(value: unknown): string {
  if (typeof value !== 'string' || value.length !== 36 || !uuid.test(value)) throw new BadRequestException();
  return value.toLowerCase();
}

export function readCreationKey(value: string | string[] | undefined): Uint8Array<ArrayBuffer> {
  if (typeof value !== 'string' || !/^[\w-]{43}$/.test(value)) throw new BadRequestException();
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.length !== 32 || bytes.toString('base64url') !== value) throw new BadRequestException();
  return Uint8Array.from(createHash('sha256').update(bytes).digest());
}

export function creationRequestDigest(input: unknown, patient?: ResolvedPatient): Uint8Array<ArrayBuffer> | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 1 ||
      !Object.hasOwn(input, 'type') || (input as { type: unknown }).type !== 'APPOINTMENT') return undefined;
  const canonical = patient
    ? JSON.stringify(['APPOINTMENT', patient.patientSubjectId, patient.actorRef])
    : '{"type":"APPOINTMENT"}';
  return Uint8Array.from(createHash('sha256').update(canonical).digest());
}

interface EventBase {
  journeyId: string;
  externalEventId: string;
  occurredAt: Date;
  schemaVersion: 1;
}

export type JourneyEventInput = EventBase & (
  | { type: 'JOURNEY_CONTEXT_UPDATED'; payload: { expectedVersion: number; studyId?: string; clinicId?: string } }
  | { type: 'JOURNEY_STATUS_CHANGED'; payload: { expectedVersion: number; to: 'PENDING_CONFIRMATION' | 'CANCELLED' } }
);

export function readJourneyEvent(input: unknown): JourneyEventInput {
  const { journeyId, externalEventId, occurredAt, schemaVersion, type, payload } = objectWithKeys(
    input, ['journeyId', 'externalEventId', 'occurredAt', 'schemaVersion', 'type', 'payload'],
  );
  if (typeof externalEventId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(externalEventId) ||
      externalEventId.trim() !== externalEventId || externalEventId.startsWith('system:') || schemaVersion !== 1 ||
      typeof occurredAt !== 'string' || occurredAt.length !== 24) throw new BadRequestException();
  const date = new Date(occurredAt);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== occurredAt) throw new BadRequestException();

  if (type !== 'JOURNEY_CONTEXT_UPDATED' && type !== 'JOURNEY_STATUS_CHANGED') throw new BadRequestException();
  const data = objectWithKeys(payload, type === 'JOURNEY_CONTEXT_UPDATED'
    ? ['expectedVersion', 'studyId', 'clinicId'] : ['expectedVersion', 'to']);
  const { expectedVersion } = data;
  if (typeof expectedVersion !== 'number' || !Number.isInteger(expectedVersion) ||
      expectedVersion < 1 || expectedVersion > 2_147_483_647) throw new BadRequestException();

  const base: EventBase = { journeyId: readUuid(journeyId), externalEventId, occurredAt: date, schemaVersion };
  if (type === 'JOURNEY_CONTEXT_UPDATED') {
    const studyId = data.studyId === undefined ? undefined : readUuid(data.studyId);
    const clinicId = data.clinicId === undefined ? undefined : readUuid(data.clinicId);
    if (!studyId && !clinicId) throw new BadRequestException();
    return { ...base, type, payload: { expectedVersion, ...(studyId && { studyId }), ...(clinicId && { clinicId }) } };
  }
  if (data.to !== 'PENDING_CONFIRMATION' && data.to !== 'CANCELLED') throw new BadRequestException();
  return { ...base, type, payload: { expectedVersion, to: data.to } };
}
