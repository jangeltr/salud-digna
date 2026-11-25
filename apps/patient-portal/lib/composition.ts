import "server-only";
import { cache } from "react";
import { checkGeneralApiConfiguration, generalApiData } from "./adapters/general-api/general-data";
import { useSessionCache } from "./adapters/general-api/session";
import { centralAssertionIssuer } from "./adapters/general-api/assertions";
import { forwardsClientIp } from "./adapters/general-api/config";
import { channelKeyId, getDataDir } from "./adapters/orchestrator/config";
import { legacyCapabilities } from "./adapters/legacy-requests/capabilities";
import { legacyRequestNotifier } from "./adapters/legacy-requests/notifier";
import { legacyRequestQuery } from "./adapters/legacy-requests/query";
import { checkOrchestratorConfiguration } from "./adapters/orchestrator/access";
import { orchestratorCapabilities } from "./adapters/orchestrator/capabilities";
import { createOrchestratorNotifier } from "./adapters/orchestrator/notifier";
import { createOrchestratorQuery } from "./adapters/orchestrator/query";
import type { GeneralData, RequestCapabilities, RequestNotifier, RequestQuery } from "./domain/ports";
import { createAssertionSource } from "./identity/cache";
import { readAssertionChannelKey, readIdentityMode, type IdentityMode } from "./identity/config";
import { checkSettings, isRegistrationEnabled } from "./settings";
import { createFileRegistry } from "./state/file-registry";
import {
  createMemoryAssertionCache,
  createMemoryAttemptStore,
  createMemoryGrantStore,
  createMemoryPendingCreationStore,
  createMemorySessionCache,
} from "./state/memory";
import type { AttemptStore } from "./state/ports";

/**
 * Composición del portal: decide qué adaptador atiende cada interfaz.
 * Es el único archivo que conoce las implementaciones. El resto del portal importa de aquí.
 *
 * `REQUESTS_BACKEND` elige quién registra los trámites: `legacy`, por defecto, usa las operaciones
 * `/requests` de la API general; `orchestrator` usa el orquestador. La lee solo el servidor.
 */
type RequestsBackend = "legacy" | "orchestrator";

function readRequestsBackend(value = process.env.REQUESTS_BACKEND): RequestsBackend {
  if (value === undefined || value === "" || value === "legacy") return "legacy";
  if (value === "orchestrator") return "orchestrator";
  throw new Error("REQUESTS_BACKEND debe ser legacy u orchestrator.");
}

// Un valor inválido detiene el arranque en `checkConfiguration`. Aquí no se lanza: se elige el modo por defecto.
const backend: RequestsBackend = (() => {
  try {
    return readRequestsBackend();
  } catch {
    return "legacy";
  }
})();

/*
 * Estado entre peticiones. La única implementación vive en el proceso: memoria y un archivo.
 * Para varias instancias habría que sustituir estas líneas por almacenes compartidos;
 * `docs/decisions.md` explica qué haría falta.
 */
useSessionCache(createMemorySessionCache());
const registry = createFileRegistry(getDataDir);
const grants = createMemoryGrantStore();
const pendingCreations = createMemoryPendingCreationStore();

/** Contadores de los límites propios del portal. */
export const attemptStore: AttemptStore = createMemoryAttemptStore();

// El perfil se pide una sola vez por renderizado: lo comparten la sesión, las acciones y el adaptador.
const currentPatient = cache(() => generalApiData.getProfile());

/*
 * Identidad del paciente ante el orquestador. `PATIENT_IDENTITY_MODE` elige `none`, por defecto, o `assertion`,
 * con el emisor de acreditaciones de la API central y la credencial `PATIENT_ASSERTION_CHANNEL_KEY`.
 * Un valor inválido o la credencial ausente detienen el arranque.
 */
const identityMode: IdentityMode = (() => {
  try {
    return readIdentityMode();
  } catch {
    return "none";
  }
})();

const assertions = createAssertionSource(centralAssertionIssuer, createMemoryAssertionCache());

const orchestratorDependencies = {
  currentPatient,
  getStudy: generalApiData.getStudy,
  getClinic: generalApiData.getClinic,
  identityMode,
  assertions,
  registry,
  grants,
  pendingCreations,
};

/** Catálogo, perfil del paciente, acceso y registro: API general, en los dos modos. */
export const generalData: GeneralData = {
  ...generalApiData,
  getProfile: currentPatient,
  // Al cerrar sesión también se olvida la acreditación de esa sesión.
  async signOut() {
    await assertions.forget();
    await generalApiData.signOut();
  },
};

/** Notificación de los cambios del trámite. */
export const requestNotifier: RequestNotifier =
  backend === "orchestrator" ? createOrchestratorNotifier(orchestratorDependencies) : legacyRequestNotifier;

/** Consulta del último estado del trámite. */
export const requestQuery: RequestQuery =
  backend === "orchestrator" ? createOrchestratorQuery(orchestratorDependencies) : legacyRequestQuery;

/** Lo que soporta el adaptador activo del trámite. Las pantallas muestran solo eso. */
export const requestCapabilities: RequestCapabilities =
  backend === "orchestrator" ? orchestratorCapabilities(identityMode) : legacyCapabilities;

/** Se ejecuta al arrancar. Detiene el servidor si la configuración de un adaptador en uso es inválida. */
export async function checkConfiguration(): Promise<void> {
  checkSettings();
  // La API general se usa en los dos modos: acceso, perfil y catálogo.
  checkGeneralApiConfiguration();
  const requests = readRequestsBackend();
  const identity = readIdentityMode();
  if (identity === "assertion" && requests !== "orchestrator") {
    throw new Error("PATIENT_IDENTITY_MODE=assertion requiere REQUESTS_BACKEND=orchestrator.");
  }
  if (requests === "orchestrator") await checkOrchestratorConfiguration(registry, identity);
  if (identity === "assertion") readAssertionChannelKey();

  // Modos activos, para el registro del servidor. Sin valores secretos: de la clave solo su identificador público.
  const parts = [
    `trámites: ${requests}`,
    `identidad del paciente: ${identity}${identity === "assertion" ? " (emisor: API central)" : ""}`,
    `registro de cuentas: ${isRegistrationEnabled() ? "encendido" : "apagado"}`,
    `IP del cliente a la API: ${forwardsClientIp() ? "encendida" : "apagada"}`,
  ];
  if (requests === "orchestrator") parts.push(`clave del canal: ${channelKeyId()}`);
  console.info(`[portal] ${parts.join(" | ")}`);
}
