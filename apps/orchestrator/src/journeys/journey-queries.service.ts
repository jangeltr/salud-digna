import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { Prisma } from '../generated/prisma/client';
import { AccessAuditAction, AccessAuditOutcome, JourneyGrantOperation, type JourneyStatus } from '../generated/prisma/enums';
import { PrismaService } from '../persistence/prisma.service';
import { createHistoryCursor, projectEventData, readHistoryCursor, readHistoryLimit } from './journey-history';
import type { ResolvedPatient } from './patient-identity';

export interface JourneyReadAccess {
  journeyId: string;
  channelId: string;
  actorRef: string;
}

const appointmentReferenceKeys = ['appointmentId', 'clinicId', 'studyId'] as const;
const referenceUuid = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
const activeStatuses: JourneyStatus[] = ['DRAFT', 'IN_PROGRESS', 'PENDING_CONFIRMATION'];

export function projectExternalRefs(journeyType: string, value: Prisma.JsonValue) {
  const references: Partial<Record<typeof appointmentReferenceKeys[number], string>> = {};
  if (journeyType !== 'APPOINTMENT' || !value || typeof value !== 'object' || Array.isArray(value)) {
    return references;
  }

  for (const key of appointmentReferenceKeys) {
    if (!Object.hasOwn(value, key)) continue;
    const reference = value[key];
    if (typeof reference === 'string' && reference.length === 36 && referenceUuid.test(reference)) {
      references[key] = reference.toLowerCase();
    }
  }
  return references;
}

@Injectable()
export class JourneyQueriesService {
  constructor(private readonly prisma: PrismaService) {}

  listPatientJourneys(channelId: string, patient: ResolvedPatient, activeOnly = false) {
    return this.prisma.client.$transaction(async (tx) => {
      if (patient.expiresAt && patient.expiresAt <= new Date()) throw new NotFoundException();
      const items = await tx.journey.findMany({
        where: { patientSubjectId: patient.patientSubjectId, ...(activeOnly && { status: { in: activeStatuses } }) },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: 100,
        select: { id: true, type: true, status: true, createdAt: true, updatedAt: true },
      });
      await tx.accessAudit.create({
        data: {
          channelId, patientSubjectId: patient.patientSubjectId, actorRef: patient.actorRef,
          action: 'READ_CONTEXT', outcome: 'ALLOWED', reasonCode: 'PATIENT_JOURNEYS',
        },
        select: { id: true },
      });
      return { items };
    });
  }

  issuePatientGrant(channelId: string, journeyId: string, patient: ResolvedPatient & { expiresAt: Date }, canPublish: boolean) {
    return this.prisma.client.$transaction(async (tx) => {
      const journey = await tx.journey.findUnique({
        where: { id: journeyId, patientSubjectId: patient.patientSubjectId, status: { in: activeStatuses } },
        select: { id: true },
      });
      const now = new Date();
      if (!journey || patient.expiresAt <= now) throw new NotFoundException();

      const secret = randomBytes(32);
      await tx.journeyAccessGrant.create({
        data: {
          channelId, journeyId, actorRef: patient.actorRef, createdAt: now, expiresAt: patient.expiresAt,
          digest: Uint8Array.from(createHash('sha256').update(secret).digest()),
          operations: [
            JourneyGrantOperation.READ_JOURNEY,
            ...(canPublish ? [JourneyGrantOperation.PUBLISH_EVENT] : []),
          ],
        },
        select: { id: true },
      });
      await tx.accessAudit.create({
        data: {
          channelId, journeyId, actorRef: patient.actorRef, patientSubjectId: patient.patientSubjectId,
          action: 'READ_CONTEXT', outcome: 'ALLOWED', reasonCode: 'INSTITUTIONAL_CONTINUATION',
        },
        select: { id: true },
      });
      return { journeyId, grant: secret.toString('base64url'), grantExpiresAt: patient.expiresAt };
    });
  }

  getJourney(access: JourneyReadAccess) {
    return this.readAndAudit(access, 'JOURNEY_SUMMARY', async (tx) => {
      const journey = await tx.journey.findUnique({
        where: { id: access.journeyId },
        select: { id: true, type: true, status: true, createdAt: true, updatedAt: true },
      });
      if (!journey) throw new NotFoundException();
      const { id, type, status, createdAt, updatedAt } = journey;
      return { id, type, status, createdAt, updatedAt };
    });
  }

  getContext(access: JourneyReadAccess) {
    return this.readAndAudit(access, 'JOURNEY_CONTEXT', async (tx) => {
      const context = await tx.journeyContext.findUnique({
        where: { journeyId: access.journeyId },
        select: {
          journeyId: true,
          currentStep: true,
          version: true,
          externalRefs: true,
          updatedAt: true,
          journey: { select: { type: true } },
        },
      });
      if (!context) throw new NotFoundException();
      const { journeyId, currentStep, version, updatedAt } = context;
      return { journeyId, currentStep, version, externalRefs: projectExternalRefs(context.journey.type, context.externalRefs), updatedAt };
    });
  }

  getHistory(access: JourneyReadAccess, rawLimit: unknown, rawCursor: unknown) {
    const limit = readHistoryLimit(rawLimit);
    const cursor = readHistoryCursor(access.journeyId, rawCursor);
    return this.readAndAudit(access, 'JOURNEY_HISTORY', async (tx) => {
      const journey = await tx.journey.findUnique({
        where: { id: access.journeyId },
        select: { id: true },
      });
      if (!journey) throw new NotFoundException();

      const events = await tx.journeyEvent.findMany({
        where: {
          journeyId: access.journeyId,
          ...(cursor && {
            occurredAt: { gte: cursor.occurredAt },
            OR: [
              { occurredAt: { gt: cursor.occurredAt } },
              { occurredAt: cursor.occurredAt, id: { gt: cursor.id } },
            ],
          }),
        },
        orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
        take: limit + 1,
        select: {
          id: true, type: true, occurredAt: true, receivedAt: true, schemaVersion: true, payload: true,
          producer: { select: { code: true } },
        },
      });
      const items = events.slice(0, limit).map(({ id, type, occurredAt, receivedAt, schemaVersion, payload, producer }) => ({
        id, type, producerCode: producer.code, occurredAt, receivedAt, schemaVersion,
        data: projectEventData(type, schemaVersion, payload),
      }));
      if (events.length > limit) {
        return { items, nextCursor: createHistoryCursor(access.journeyId, events[limit - 1]) };
      }
      return { items };
    });
  }

  private readAndAudit<T>(
    access: JourneyReadAccess,
    reasonCode: 'JOURNEY_SUMMARY' | 'JOURNEY_CONTEXT' | 'JOURNEY_HISTORY',
    read: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.client.$transaction(async (tx) => {
      const result = await read(tx);
      await tx.accessAudit.create({
        data: {
          journeyId: access.journeyId,
          channelId: access.channelId,
          actorRef: access.actorRef,
          action: reasonCode === 'JOURNEY_HISTORY' ? AccessAuditAction.READ_TIMELINE : AccessAuditAction.READ_CONTEXT,
          outcome: AccessAuditOutcome.ALLOWED,
          reasonCode,
        },
        select: { id: true },
      });
      return result;
    });
  }
}
