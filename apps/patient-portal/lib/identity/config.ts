import "server-only";
import { Secret } from "@/lib/secret";

/**
 * `PATIENT_IDENTITY_MODE`: cómo se identifica al paciente ante el orquestador.
 * - `none`, por defecto: sin acreditación. El portal recuerda los trámites en su registro del canal Web.
 * - `assertion`: cada trámite nuevo y cada consulta llevan la acreditación institucional del paciente.
 *   Si no se obtiene, no se crea ni se lee nada: nunca se recurre a la creación anónima.
 */
export type IdentityMode = "none" | "assertion";

export function readIdentityMode(value = process.env.PATIENT_IDENTITY_MODE): IdentityMode {
  if (value === undefined || value === "" || value === "none") return "none";
  if (value === "assertion") return "assertion";
  throw new Error("PATIENT_IDENTITY_MODE debe ser none o assertion.");
}

/**
 * `PATIENT_ASSERTION_PROVIDER`: de dónde salen las acreditaciones en modo `assertion`.
 * - `pending`, por defecto: el emisor de la API central aún no tiene contrato definitivo.
 *   Toda petición de acreditación falla con `identity-unavailable`.
 * - `simulator`: solo para pruebas con servicios locales. Se niega a arrancar con servicios remotos.
 */
export type AssertionProviderName = "pending" | "simulator";

export function readAssertionProvider(value = process.env.PATIENT_ASSERTION_PROVIDER): AssertionProviderName {
  if (value === undefined || value === "" || value === "pending") return "pending";
  if (value === "simulator") return "simulator";
  throw new Error("PATIENT_ASSERTION_PROVIDER debe ser pending o simulator.");
}

/** Clave del simulador: 32 bytes en base64url. Los mensajes de error omiten su valor. */
export function readSimulatorKey(value = process.env.PATIENT_ASSERTION_SIMULATOR_KEY): Secret {
  if (!value || !/^[\w-]{43}$/.test(value) || Buffer.from(value, "base64url").length !== 32) {
    throw new Error("PATIENT_ASSERTION_SIMULATOR_KEY debe tener 32 bytes en base64url, sin relleno.");
  }
  return new Secret(value);
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * El simulador solo puede arrancar si todos los servicios son locales. Así no puede llegar a producción:
 * una acreditación de simulación ante un servicio desplegado haría pasar por paciente a cualquiera.
 */
export function assertSimulatorIsLocal(serviceUrls: string[]): void {
  for (const value of serviceUrls) {
    let host = "";
    try {
      host = new URL(value).hostname;
    } catch {
      // La validación de cada URL la hace su adaptador.
    }
    if (!LOOPBACK.has(host)) {
      throw new Error("El proveedor de acreditaciones de simulación solo arranca con servicios en localhost o 127.0.0.1.");
    }
  }
}
