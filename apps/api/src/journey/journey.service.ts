import { Injectable, NotFoundException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { requireAssistance } from '../call-center/assistance-access';
import type { Prisma } from '../generated/prisma/client';
import { Channel, ServiceRequestStatus } from '../generated/prisma/enums';
import { PrismaService } from '../persistence/prisma.service';
import { RequestStep } from '../requests/request-workflow';
import { JOURNEY_TYPES, type JourneyEntryDto } from './journey.dto';

const INTERACTION_TYPES = ['REQUEST_PAUSED', 'REQUEST_RESUMED'];
const LEGACY_ACTIVITY_WINDOW_MS = 1000;
const entryFields = {
  id: true, type: true, createdAt: true, channel: true, actorUserId: true,
  actor: { select: { role: true } },
} satisfies Prisma.DomainEventSelect;

function safePayload(type: string, value: Prisma.JsonValue): JourneyEntryDto['payload'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const safe: JourneyEntryDto['payload'] = {};

  if (value.simulated === true) safe.simulated = true;
  if (typeof value.version === 'number' && Number.isSafeInteger(value.version) && value.version > 0) {
    safe.version = value.version;
  }
  if (type === 'REQUEST_CONTEXT_UPDATED' && typeof value.currentStep === 'string' &&
      Object.values<string>(RequestStep).includes(value.currentStep)) {
    safe.currentStep = value.currentStep;
  }
  if (type === 'APPOINTMENT_CONFIRMED' && typeof value.appointmentId === 'string' && isUUID(value.appointmentId)) {
    safe.appointmentId = value.appointmentId;
  }
  if (type === 'REQUEST_STATUS_CHANGED' || type === 'CHANNEL_SWITCHED' || INTERACTION_TYPES.includes(type)) {
    const allowed = type === 'REQUEST_STATUS_CHANGED' ? Object.values(ServiceRequestStatus) : Object.values(Channel);
    for (const key of ['from', 'to'] as const) {
      const item = value[key];
      if (typeof item === 'string' && (allowed as string[]).includes(item)) safe[key] = item;
    }
  }
  return safe;
}

function interactionKey(row: Pick<Prisma.DomainEventGetPayload<{ select: typeof entryFields }>,
  'type' | 'channel' | 'actorUserId'>): string {
  return [row.type, row.channel, row.actorUserId].join(':');
}

@Injectable()
export class JourneyService {
  constructor(private readonly prisma: PrismaService) {}

  forPatient(requestId: string, patientId: string): Promise<JourneyEntryDto[]> {
    return this.prisma.client.$transaction(async (tx) => {
      const request = await tx.serviceRequest.findUnique({ where: { id: requestId, patientId }, select: { id: true } });
      if (!request) throw new NotFoundException('Solicitud no encontrada.');
      return this.timeline(tx, requestId);
    }, { isolationLevel: 'RepeatableRead' });
  }

  forAdvisor(requestId: string, advisorId: string): Promise<JourneyEntryDto[]> {
    return this.prisma.client.$transaction(async (tx) => {
      await requireAssistance(tx, advisorId, requestId);
      return this.timeline(tx, requestId);
    }, { isolationLevel: 'RepeatableRead' });
  }

  async timeline(tx: Prisma.TransactionClient, requestId: string, limit?: number): Promise<JourneyEntryDto[]> {
    const orderBy = [{ createdAt: 'desc' }, { id: 'desc' }] as const;
    const events = await tx.domainEvent.findMany({
      where: { requestId, type: { in: JOURNEY_TYPES } },
      orderBy: [...orderBy], select: { ...entryFields, payload: true },
    });
    const interactions = await tx.interaction.findMany({
      where: { requestId, type: { in: INTERACTION_TYPES } },
      orderBy: [...orderBy], select: entryFields,
    });

    const recorded = new Map<string, number[]>();
    for (const event of events) {
      if (!INTERACTION_TYPES.includes(event.type)) continue;
      const key = interactionKey(event);
      const dates = recorded.get(key) ?? [];
      dates.push(event.createdAt.getTime());
      recorded.set(key, dates);
    }
    const additional = interactions.filter((interaction) => {
      const candidates = recorded.get(interactionKey(interaction));
      if (!candidates) return true;

      const timestamp = interaction.createdAt.getTime();
      const exact = candidates.indexOf(timestamp);
      // Las escrituras anteriores podían fechar el evento y la interacción por separado.
      const match = exact >= 0 ? exact : candidates.findIndex((date) =>
        timestamp >= date && timestamp - date <= LEGACY_ACTIVITY_WINDOW_MS,
      );
      if (match < 0) return true;
      candidates.splice(match, 1);
      return false;
    });
    const rows = [...events, ...additional.map((interaction) => ({ ...interaction, payload: {} }))];
    return rows
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))
      .slice(0, limit ?? rows.length)
      .reverse()
      .map(({ id, type, createdAt, channel, actor, payload }) => ({
        id, type, createdAt, channel, actorRole: actor?.role ?? null, payload: safePayload(type, payload),
      }));
  }
}
