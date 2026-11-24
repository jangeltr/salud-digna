import type { RequestCapabilities } from "@/lib/domain/ports";

/**
 * Lo que soportan las operaciones `/requests` de la API actual.
 * El contrato no ofrece cancelar un trámite ni códigos de continuidad, y este adaptador no lee el historial.
 */
export const legacyCapabilities: RequestCapabilities = {
  slot: true,
  note: true,
  pause: true,
  advisorHelp: true,
  patientConfirmation: true,
  cancellation: false,
  history: false,
  continuityCodes: false,
  patientListing: true,
};
