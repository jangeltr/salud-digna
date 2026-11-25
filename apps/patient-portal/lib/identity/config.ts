import "server-only";
import { Secret } from "@/lib/secret";

/**
 * `PATIENT_IDENTITY_MODE`: cómo se identifica al paciente ante el orquestador.
 * - `none`, por defecto: sin acreditación. El portal recuerda los trámites en su registro del canal Web.
 * - `assertion`: cada trámite nuevo y cada consulta llevan la acreditación institucional del paciente, que emite
 *   la API central. Si no se obtiene, no se crea ni se lee nada: nunca se recurre a la creación anónima.
 */
export type IdentityMode = "none" | "assertion";

export function readIdentityMode(value = process.env.PATIENT_IDENTITY_MODE): IdentityMode {
  if (value === undefined || value === "" || value === "none") return "none";
  if (value === "assertion") return "assertion";
  throw new Error("PATIENT_IDENTITY_MODE debe ser none o assertion.");
}

/**
 * `PATIENT_ASSERTION_CHANNEL_KEY`: credencial del backend del canal Web ante el emisor de acreditaciones de la API
 * central, distinta de la clave del orquestador. El contrato (`docs/api-patient-assertions.md`) la define como
 * 32 bytes aleatorios en base64url sin relleno. Obligatoria en modo `assertion`. Los mensajes de error omiten su valor.
 */
export function readAssertionChannelKey(value = process.env.PATIENT_ASSERTION_CHANNEL_KEY): Secret {
  if (!value || !/^[\w-]{43}$/.test(value) || Buffer.from(value, "base64url").length !== 32) {
    throw new Error("PATIENT_ASSERTION_CHANNEL_KEY debe tener 32 bytes en base64url, sin relleno.");
  }
  return new Secret(value);
}

let assertionChannelKey: Secret | undefined;

export function getAssertionChannelKey(): Secret {
  assertionChannelKey ??= readAssertionChannelKey();
  return assertionChannelKey;
}
