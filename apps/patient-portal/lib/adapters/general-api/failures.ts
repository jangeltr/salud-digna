import { failure, success, type Failure, type Result } from "@/lib/domain/errors";
import type { ApiFailure, ApiResult } from "./client";

/**
 * Única traducción de códigos HTTP a errores del portal.
 * Sin respuesta útil o con `5xx` el resultado de una escritura es incierto: `unavailable`.
 * Cualquier otro código no previsto, como `403`, es un rechazo seguro: `rejected`.
 */
export function toFailure({ status, retryAfter }: ApiFailure): Failure {
  if (status === null || status >= 500) return failure("unavailable");

  switch (status) {
    case 400:
      return failure("invalid");
    case 401:
      return failure("session");
    case 404:
      return failure("not-found");
    case 409:
      return failure("conflict");
    case 429:
      return failure("rate-limited", retryAfter);
    default:
      return failure("rejected");
  }
}

/** Convierte una respuesta de la API al modelo del portal. */
export function toResult<Data, Model>(result: ApiResult<Data>, toModel: (data: Data) => Model): Result<Model> {
  return result.ok ? success(toModel(result.data)) : toFailure(result);
}
