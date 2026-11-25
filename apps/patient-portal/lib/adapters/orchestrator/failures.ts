import { failure, type Failure } from "@/lib/domain/errors";
import type { OrchestratorFailure } from "./client";

/**
 * Única traducción de los códigos HTTP del orquestador a errores del portal.
 *
 * - Sin respuesta útil o con `5xx`, el resultado de una escritura es incierto: `unavailable`.
 * - `401` y `403` hablan de la clave del canal, no del paciente. Su sesión sigue siendo válida,
 *   así que se traducen a `unavailable` y nunca a `session`.
 * - `404` cubre por igual el trámite inexistente y el permiso ausente, vencido, revocado o ajeno.
 *   El adaptador solo llama por trámites que el registro atribuye al paciente, así que lo trata
 *   como permiso sin vigencia: `access-expired`.
 * - `409` cubre la versión obsoleta, la transición inválida y el identificador de evento reutilizado
 *   con otro contenido. El contrato no los distingue: todos son `conflict`.
 */
export function toFailure({ status, retryAfter }: OrchestratorFailure): Failure {
  if (status === null || status >= 500) return failure("unavailable");

  switch (status) {
    case 400:
      return failure("invalid");
    case 401:
    case 403:
      return failure("unavailable");
    case 404:
      return failure("access-expired");
    case 409:
      return failure("conflict");
    case 429:
      return failure("rate-limited", retryAfter);
    default:
      return failure("rejected");
  }
}

/**
 * Al crear un trámite, `401`, `403` y `404` son rechazos seguros: no se creó nada.
 * Se traducen a `rejected`, no a `unavailable`, para que nadie los tome por un resultado incierto.
 */
export function toCreationFailure(result: OrchestratorFailure): Failure {
  const { status } = result;
  return status === 401 || status === 403 || status === 404 ? failure("rejected") : toFailure(result);
}

/**
 * Al canjear un código no hay trámite ni permiso previos: el `404` cubre el código desconocido,
 * vencido, ya usado o emitido por este mismo canal. Es `not-found`.
 */
export function toRedeemFailure(result: OrchestratorFailure): Failure {
  return result.status === 404 ? failure("not-found") : toFailure(result);
}

/**
 * Llamadas que llevan la acreditación del paciente (`POST /journeys` identificado y `GET /journeys`):
 * el `404` significa que el orquestador no la aceptó. Es `identity-unavailable`; `401` y `403`, que hablan
 * de la clave del canal, siguen como en el resto.
 */
export function toIdentifiedFailure(result: OrchestratorFailure, creation: boolean): Failure {
  if (result.status === 404) return failure("identity-unavailable");
  return creation ? toCreationFailure(result) : toFailure(result);
}

/** Sin respuesta útil o con `5xx` no se sabe si la operación llegó a aplicarse. */
export function isUncertain(result: OrchestratorFailure): boolean {
  return result.status === null || result.status >= 500;
}
