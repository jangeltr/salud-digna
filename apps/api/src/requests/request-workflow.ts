import { BadRequestException } from '@nestjs/common';
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
    const timestamp = Date.parse(patch.scheduledAt);
    if (!Number.isFinite(timestamp) || timestamp <= Date.now()) {
      throw new BadRequestException('scheduledAt debe indicar una fecha y hora futuras.');
    }
    context.scheduledAt = new Date(timestamp).toISOString();
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
