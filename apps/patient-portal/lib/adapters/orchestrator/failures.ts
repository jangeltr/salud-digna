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

/** Al crear un trámite no hay permiso que pueda faltar: un `404` es un rechazo que el portal no distingue. */
export function toCreationFailure(result: OrchestratorFailure): Failure {
  return result.status === 404 ? failure("rejected") : toFailure(result);
}
