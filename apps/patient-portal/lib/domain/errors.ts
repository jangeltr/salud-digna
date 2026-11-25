/**
 * Errores propios del portal. Los adaptadores traducen a estos valores lo que responda cada servicio:
 * fuera de `lib/adapters` nadie interpreta códigos HTTP.
 *
 * - `not-found`: el recurso no existe o no pertenece al paciente.
 * - `conflict`: el recurso cambió desde la última lectura, o ya existe.
 * - `session`: no hay sesión o ya no es válida.
 * - `rate-limited`: límite de intentos excedido.
 * - `invalid`: el servicio rechazó los datos enviados.
 * - `unavailable`: no hubo respuesta útil. En una escritura, el resultado es incierto.
 * - `rejected`: el servicio respondió y rechazó la operación por un motivo que el portal no distingue,
 *   o el adaptador activo no la soporta.
 * - `access-expired`: el trámite es del paciente, pero el portal no tiene un permiso vigente para
 *   consultarlo ni modificarlo.
 * - `identity-unavailable`: no se pudo obtener o acreditar la identidad institucional del paciente.
 *   Con este error no se crea ni se lee ningún trámite.
 */
export type ErrorKind =
  | "not-found"
  | "conflict"
  | "session"
  | "rate-limited"
  | "invalid"
  | "unavailable"
  | "rejected"
  | "access-expired"
  | "identity-unavailable";

export type PortalError = {
  kind: ErrorKind;
  /** Solo con `rate-limited`: segundos de espera, si el servicio los indica. */
  retryAfterSeconds?: number;
};

export type Success<Data> = { ok: true; data: Data };
export type Failure = { ok: false; error: PortalError };
export type Result<Data> = Success<Data> | Failure;

export function success<Data>(data: Data): Success<Data> {
  return { ok: true, data };
}

export function failure(kind: ErrorKind, retryAfterSeconds?: number): Failure {
  return { ok: false, error: retryAfterSeconds === undefined ? { kind } : { kind, retryAfterSeconds } };
}
