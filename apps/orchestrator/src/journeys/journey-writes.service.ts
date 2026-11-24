import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { Prisma } from '../generated/prisma/client';
import { AccessAuditAction, JourneyGrantOperation, JourneyStatus } from '../generated/prisma/enums';
import { PrismaService } from '../persistence/prisma.service';
import { projectExternalRefs, type JourneyReadAccess } from './journey-queries.service';
import type { JourneyEventInput } from './journey-write-input';
import type { ResolvedPatient } from './patient-identity';

class ConcurrentCreation extends Error {}

function nextAppointmentState(
  event: JourneyEventInput, currentStatus: JourneyStatus, currentStep: string, storedRefs: Prisma.JsonValue,
) {
  if (currentStatus === 'CANCELLED' || currentStatus === 'COMPLETED') throw new ConflictException();
  const refs = projectExternalRefs('APPOINTMENT', storedRefs);
  if (event.type === 'JOURNEY_STATUS_CHANGED') {
    const { to } = event.payload;
    if (to === 'PENDING_CONFIRMATION' &&
        (currentStatus !== 'IN_PROGRESS' || !refs.studyId || !refs.clinicId)) throw new ConflictException();
    return { status: to, currentStep, refs };
  }

  const { studyId, clinicId } = event.payload;
  if (studyId && studyId !== refs.studyId) {
    refs.studyId = studyId;
    delete refs.clinicId;
  }
  if (clinicId) refs.clinicId = clinicId;
  if (!refs.studyId) throw new ConflictException();
  return { status: JourneyStatus.IN_PROGRESS, currentStep: refs.clinicId ? 'REVIEW' : 'SELECT_CLINIC', refs };
}

@Injectable()
export class JourneyWritesService {
  constructor(private readonly prisma: PrismaService) {}

  async createAppointment(
    channelId: string, keyDigest: Uint8Array<ArrayBuffer>, requestDigest: Uint8Array<ArrayBuffer> | undefined,
    patient?: ResolvedPatient,
  ) {
    const resolve = (canCreate: boolean) => this.prisma.client.$transaction(async (tx) => {
      const existing = await tx.journeyCreationRequest.findUnique({
        where: { channelId_keyDigest: { channelId, keyDigest } },
        select: {
          requestDigest: true, initialStatus: true,
          initialGrant: { select: {
            channelId: true, journeyId: true, actorRef: true, expiresAt: true, revokedAt: true, operations: true,
          } },
        },
      });
      if (existing) {
        const initial = existing.initialGrant;
        if (!requestDigest || !Buffer.from(existing.requestDigest).equals(requestDigest) || initial.channelId !== channelId) {
          throw new ConflictException();
        }
        const result = { id: initial.journeyId, status: existing.initialStatus };
        const now = new Date();
        if (initial.revokedAt || initial.expiresAt <= now || !initial.operations.length) return result;

        const { token } = await this.issueCreationGrant(tx, initial, now);
        return { ...result, grant: token, grantExpiresAt: initial.expiresAt };
      }
      if (!canCreate) throw new ServiceUnavailableException();
      if (!requestDigest) throw new BadRequestException();

      const journey = await tx.journey.create({
        data: {
          type: 'APPOINTMENT',
          patientSubject: patient ? { connect: { id: patient.patientSubjectId } } : { create: {} },
          context: { create: { currentStep: 'SELECT_STUDY' } },
        },
        select: { id: true, status: true },
      });
      const actorRef = patient?.actorRef ?? `journey-bootstrap:${randomUUID()}`;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 5 * 60_000);
      const { id: initialGrantId, token } = await this.issueCreationGrant(tx, {
        channelId, journeyId: journey.id, actorRef, expiresAt,
        operations: [JourneyGrantOperation.READ_JOURNEY, JourneyGrantOperation.PUBLISH_EVENT],
      }, now);
      const claimed = await tx.journeyCreationRequest.createMany({
        data: { channelId, keyDigest, requestDigest, initialGrantId, initialStatus: journey.status },
        skipDuplicates: true,
      });
      if (!claimed.count) throw new ConcurrentCreation();

      await tx.journeyEvent.create({
        data: {
          journeyId: journey.id, producerId: channelId, externalEventId: `system:created:${journey.id}`,
          type: 'JOURNEY_CREATED', schemaVersion: 1, occurredAt: now, payload: { version: 1 },
        },
        select: { id: true },
      });
      await tx.accessAudit.create({
        data: {
          actorRef, channelId, journeyId: journey.id, action: AccessAuditAction.CHANGE_JOURNEY_STATUS,
          outcome: 'ALLOWED', reasonCode: 'JOURNEY_CREATED',
        },
        select: { id: true },
      });
      return { ...journey, grant: token, grantExpiresAt: expiresAt };
    });

    try {
      return await resolve(true);
    } catch (error) {
      if (!(error instanceof ConcurrentCreation)) throw error;
      return resolve(false);
    }
  }

  private async issueCreationGrant(tx: Prisma.TransactionClient, grant: {
    channelId: string;
    journeyId: string;
    actorRef: string;
    expiresAt: Date;
    operations: JourneyGrantOperation[];
  }, createdAt: Date) {
    const secret = randomBytes(32);
    const digest = Uint8Array.from(createHash('sha256').update(secret).digest());
    const { channelId, journeyId, actorRef, expiresAt, operations } = grant;
    const { id } = await tx.journeyAccessGrant.create({
      data: { channelId, journeyId, actorRef, expiresAt, operations, createdAt, digest },
      select: { id: true },
    });
    return { id, token: secret.toString('base64url') };
  }

  publish(access: JourneyReadAccess, event: JourneyEventInput) {
    if (event.journeyId !== access.journeyId) throw new NotFoundException();
    const producerId = access.channelId;
    return this.prisma.client.$transaction(async (tx) => {
      const id = randomUUID();
      const inserted = await tx.journeyEvent.createMany({
        data: { id, producerId, ...event },
        skipDuplicates: true,
      });
      if (!inserted.count) return this.replay(tx, producerId, event);

      const context = await tx.journeyContext.findUnique({
        where: { journeyId: event.journeyId },
        select: { version: true, currentStep: true, externalRefs: true, journey: { select: { type: true, status: true } } },
      });
      if (!context) throw new NotFoundException();
      if (context.journey.type !== 'APPOINTMENT' || context.version !== event.payload.expectedVersion ||
          context.version === 2_147_483_647) throw new ConflictException();
      const next = nextAppointmentState(event, context.journey.status, context.currentStep, context.externalRefs);
      const version = context.version + 1;
      const changed = await tx.journeyContext.updateMany({
        where: { journeyId: event.journeyId, version: context.version },
        data: { version, currentStep: next.currentStep, externalRefs: next.refs },
      });
      if (!changed.count) throw new ConflictException();

      await tx.journey.update({
        where: { id: event.journeyId },
        data: { status: next.status, ...(next.status === 'CANCELLED' && { closedAt: new Date() }) },
        select: { id: true },
      });
      await tx.journeyEvent.update({
        where: { id },
        data: { payload: {
          ...event.payload, version,
          ...(event.type === 'JOURNEY_STATUS_CHANGED'
            ? { from: context.journey.status } : { currentStep: next.currentStep }),
        } },
        select: { id: true },
      });
      await tx.accessAudit.create({
        data: {
          journeyId: event.journeyId, channelId: producerId, actorRef: access.actorRef,
          action: event.type === 'JOURNEY_STATUS_CHANGED' ? 'CHANGE_JOURNEY_STATUS' : 'UPDATE_CONTEXT',
          outcome: 'ALLOWED',
        },
        select: { id: true },
      });
      return { id, journeyId: event.journeyId };
    }, { isolationLevel: 'ReadCommitted' });
  }

  private async replay(tx: Prisma.TransactionClient, producerId: string, event: JourneyEventInput) {
    const existing = await tx.journeyEvent.findUnique({
      where: { producerId_externalEventId: { producerId, externalEventId: event.externalEventId } },
      select: { id: true, journeyId: true, type: true, schemaVersion: true, occurredAt: true, payload: true },
    });
    if (!existing || existing.journeyId !== event.journeyId || existing.type !== event.type ||
        existing.schemaVersion !== event.schemaVersion || existing.occurredAt.getTime() !== event.occurredAt.getTime() ||
        !existing.payload || typeof existing.payload !== 'object' || Array.isArray(existing.payload)) {
      throw new ConflictException();
    }
    const { version: _version, currentStep: _step, from: _from, ...submitted } = existing.payload;
    if (!isDeepStrictEqual(submitted, event.payload)) throw new ConflictException();
    return { id: existing.id, journeyId: existing.journeyId };
  }
}
