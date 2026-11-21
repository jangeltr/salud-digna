import { BadRequestException, ConflictException } from '@nestjs/common';
import { isISO8601 } from 'class-validator';
import type { Prisma } from '../generated/prisma/client';
import { ServiceRequestStatus } from '../generated/prisma/enums';

export enum RequestStep {
  SELECT_STUDY = 'SELECT_STUDY',
  SELECT_CLINIC = 'SELECT_CLINIC',
  SELECT_DATETIME = 'SELECT_DATETIME',
  REVIEW = 'REVIEW',
  CONFIRMED = 'CONFIRMED',
}

export const OPEN_REQUEST_STATUSES: ServiceRequestStatus[] = [
  ServiceRequestStatus.DRAFT,
  ServiceRequestStatus.IN_PROGRESS,
  ServiceRequestStatus.PENDING_CONFIRMATION,
];

export interface RequestContextData {
  studyId?: string;
  clinicId?: string;
  scheduledAt?: string;
  notes?: string;
}

export const SCHEDULE_WITH_TIME_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;

export function parseSchedule(value: string): Date | undefined {
  if (!SCHEDULE_WITH_TIME_ZONE.test(value) || !isISO8601(value, { strict: true, strictSeparator: true })) {
    return undefined;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp) : undefined;
}

export function readRequestContext(data: Prisma.JsonValue | undefined): RequestContextData {
  const context: RequestContextData = {};
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    for (const key of ['studyId', 'clinicId', 'scheduledAt', 'notes'] as const) {
      if (typeof data[key] === 'string') context[key] = data[key];
    }
  }
  return context;
}

export async function requireActiveSelections(
  tx: Prisma.TransactionClient,
  { studyId, clinicId }: Pick<RequestContextData, 'studyId' | 'clinicId'>,
): Promise<void> {
  if (studyId && !await tx.study.findFirst({
    where: { id: studyId, isActive: true }, select: { id: true },
  })) {
    throw new BadRequestException('Selecciona un estudio activo.');
  }

  if (clinicId && !await tx.clinic.findFirst({
    where: { id: clinicId, isActive: true }, select: { id: true },
  })) {
    throw new BadRequestException('Selecciona una clínica activa.');
  }
}

export function versionConflict(): ConflictException {
  return new ConflictException('La versión cambió. Recupera el estado actualizado de la solicitud.');
}

export function advanceWorkflow(
  previous: RequestContextData,
  patch: Omit<RequestContextData, 'scheduledAt' | 'notes'> & {
    scheduledAt?: string | null;
    notes?: string | null;
  },
) {
  const context = { ...previous };
  if (patch.studyId !== undefined && patch.studyId !== context.studyId) {
    context.studyId = patch.studyId;
    delete context.clinicId;
    delete context.scheduledAt;
  }

  if (patch.clinicId !== undefined && patch.clinicId !== context.clinicId) {
    context.clinicId = patch.clinicId;
    delete context.scheduledAt;
  }

  if (patch.scheduledAt === null) {
    delete context.scheduledAt;
  } else if (patch.scheduledAt !== undefined) {
    const date = parseSchedule(patch.scheduledAt);
    if (!date || date.getTime() <= Date.now()) {
      throw new BadRequestException('scheduledAt debe indicar una fecha y hora futuras.');
    }
    context.scheduledAt = date.toISOString();
  }

  if (patch.notes === null) delete context.notes;
  else if (patch.notes !== undefined) context.notes = patch.notes;

  if (context.clinicId && !context.studyId) {
    throw new BadRequestException('Selecciona un estudio antes de indicar la clínica.');
  }
  if (context.scheduledAt && !context.clinicId) {
    throw new BadRequestException('Selecciona una clínica antes de indicar la fecha.');
  }

  if (!context.studyId) {
    return { context, status: ServiceRequestStatus.DRAFT, currentStep: RequestStep.SELECT_STUDY };
  }
  if (!context.clinicId) {
    return { context, status: ServiceRequestStatus.IN_PROGRESS, currentStep: RequestStep.SELECT_CLINIC };
  }
  if (!context.scheduledAt) {
    return { context, status: ServiceRequestStatus.IN_PROGRESS, currentStep: RequestStep.SELECT_DATETIME };
  }
  return { context, status: ServiceRequestStatus.PENDING_CONFIRMATION, currentStep: RequestStep.REVIEW };
}
