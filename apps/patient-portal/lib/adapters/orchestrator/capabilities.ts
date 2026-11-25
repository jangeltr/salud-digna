import type { RequestCapabilities } from "@/lib/domain/ports";

/**
 * Lo que soporta hoy el contrato del orquestador (`journey-writes.md`, `journey-queries.md`,
 * `continuity-codes.md` y, en modo `assertion`, `docs/contratos/continuidad-identificada.md`).
 * Su contexto solo admite estudio y clínica, no tiene estado de pausa ni código de asistencia
 * y ningún evento lleva el trámite a completado.
 *
 * `patientListing` sigue apagado también en modo `assertion`: la lista identificada solo trae resúmenes,
 * así que tras una creación incierta se usa la clave de idempotencia y no la lista.
 */
export function orchestratorCapabilities(identityMode: "none" | "assertion"): RequestCapabilities {
  return {
    slot: false,
    note: false,
    pause: false,
    advisorHelp: false,
    patientConfirmation: false,
    cancellation: true,
    history: true,
    continuityCodes: true,
    patientListing: false,
    identifiedContinuity: identityMode === "assertion",
  };
}
