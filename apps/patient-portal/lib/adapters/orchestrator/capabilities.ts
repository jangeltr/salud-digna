import type { RequestCapabilities } from "@/lib/domain/ports";

/**
 * Lo que soporta hoy el contrato del orquestador (`journey-writes.md`, `journey-queries.md`
 * y `continuity-codes.md`).
 * Su contexto solo admite estudio y clínica, no tiene estado de pausa ni código de asistencia,
 * ningún evento lleva el trámite a completado y no ofrece consultar los trámites de un paciente.
 */
export const orchestratorCapabilities: RequestCapabilities = {
  slot: false,
  note: false,
  pause: false,
  advisorHelp: false,
  patientConfirmation: false,
  cancellation: true,
  history: true,
  continuityCodes: true,
  patientListing: false,
};
