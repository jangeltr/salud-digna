import "server-only";
import { readFlag } from "./flags";

/**
 * Ajustes del portal que no pertenecen a ningún servicio. Los lee solo el servidor.
 */

/**
 * `REGISTRATION_ENABLED` decide si el portal ofrece crear cuentas.
 * Sin valor, el registro está apagado en producción y encendido en desarrollo.
 */
export function readRegistrationEnabled(value = process.env.REGISTRATION_ENABLED): boolean {
  return readFlag("REGISTRATION_ENABLED", value, process.env.NODE_ENV !== "production");
}

let registrationEnabled: boolean | undefined;

export function isRegistrationEnabled(): boolean {
  registrationEnabled ??= readRegistrationEnabled();
  return registrationEnabled;
}

/** Se ejecuta al arrancar. Detiene el servidor si un ajuste tiene un valor inválido. */
export function checkSettings(): void {
  isRegistrationEnabled();
}
