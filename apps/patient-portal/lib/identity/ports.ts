import type { Result } from "@/lib/domain/errors";
import type { Secret } from "@/lib/secret";

/**
 * Acreditación institucional del paciente de la sesión actual: la prueba de identidad que el portal
 * presenta al orquestador en `X-Patient-Assertion`. Es un secreto opaco para el portal: no la decodifica.
 * Contrato: `docs/contratos/continuidad-identificada.md`.
 */
export type IssuedAssertion = {
  assertion: Secret;
  /** Vencimiento en milisegundos desde 1970, si el emisor lo informa. La caché nunca pasa de cinco minutos. */
  expiresAt?: number;
};

/**
 * Emisor de acreditaciones. Obtiene la del paciente de la sesión actual, que el servidor ya validó.
 * No recibe ningún dato del navegador: ni identificadores de paciente ni de cuenta.
 * Errores: `session` si no hay sesión, `identity-unavailable` si no se pudo obtener.
 */
export interface AssertionIssuer {
  issue(): Promise<Result<IssuedAssertion>>;
}

/** Acreditación vigente para el adaptador del orquestador. `fresh` indica que se acaba de emitir. */
export type CurrentAssertion = { assertion: Secret; fresh: boolean };

/** Acreditación de la sesión actual, guardada en memoria y renovada antes de vencer. */
export interface AssertionSource {
  current(): Promise<Result<CurrentAssertion>>;
  /** Descarta la guardada y pide otra. Se usa cuando el orquestador rechaza la anterior. */
  renew(): Promise<Result<CurrentAssertion>>;
  /** Al cerrar sesión. */
  forget(): Promise<void>;
}
