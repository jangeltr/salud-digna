import type { Appointment, BookingRequest, Channel, RequestStatus, RequestStep } from "@/lib/domain/model";
import type { components } from "../general-api/schema";

type Schemas = components["schemas"];

export type Snapshot = Schemas["RequestSnapshotDto"];
export type AppointmentDto = Schemas["AppointmentDto"];

const STATUS: Record<Snapshot["status"], RequestStatus> = {
  DRAFT: "draft",
  IN_PROGRESS: "in-progress",
  PENDING_CONFIRMATION: "pending-confirmation",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

const STEP: Record<Snapshot["currentStep"], RequestStep> = {
  SELECT_STUDY: "study",
  SELECT_CLINIC: "clinic",
  SELECT_DATETIME: "datetime",
  REVIEW: "review",
  CONFIRMED: "confirmed",
};

// Canales que el portal sabe nombrar. Cualquier otro valor del contrato pasa a ser `other`.
const CHANNEL: Partial<Record<Snapshot["lastChannel"], Channel>> = {
  WEB: "web",
  WHATSAPP: "whatsapp",
  CALL_CENTER: "call-center",
};

const APPOINTMENT_STATUS: Record<AppointmentDto["status"], Appointment["status"]> = {
  PENDING: "pending",
  CONFIRMED: "confirmed",
  CANCELLED: "cancelled",
};

/**
 * Un estado o un paso fuera del contrato se trata como trámite cerrado,
 * igual que hacía la pantalla al no reconocer el valor.
 */
export function toBookingRequest(dto: Snapshot): BookingRequest {
  const { studyId, clinicId, scheduledAt, notes } = dto.context;

  return {
    id: dto.id,
    status: STATUS[dto.status] ?? "cancelled",
    step: STEP[dto.currentStep] ?? "confirmed",
    selections: { studyId, clinicId, scheduledAt, notes },
    lastChannel: CHANNEL[dto.lastChannel] ?? "other",
    lastActivityAt: dto.updatedAt,
    createdAt: dto.createdAt,
    version: dto.version,
  };
}

export function toAppointment(dto: AppointmentDto): Appointment {
  return {
    id: dto.id,
    requestId: dto.requestId,
    scheduledAt: dto.scheduledAt,
    status: APPOINTMENT_STATUS[dto.status] ?? "pending",
  };
}
