import "server-only";
import { cache } from "react";
import { checkGeneralApiConfiguration, generalApiData } from "./adapters/general-api/general-data";
import { legacyCapabilities } from "./adapters/legacy-requests/capabilities";
import { legacyRequestNotifier } from "./adapters/legacy-requests/notifier";
import { legacyRequestQuery } from "./adapters/legacy-requests/query";
import { checkOrchestratorConfiguration } from "./adapters/orchestrator/access";
import { orchestratorCapabilities } from "./adapters/orchestrator/capabilities";
import { createOrchestratorNotifier } from "./adapters/orchestrator/notifier";
import { createOrchestratorQuery } from "./adapters/orchestrator/query";
import type { GeneralData, RequestCapabilities, RequestNotifier, RequestQuery } from "./domain/ports";
import { checkSettings } from "./settings";

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

// En modo orquestador el perfil se pide una sola vez por renderizado: lo comparten la sesión y el adaptador.
const currentPatient = cache(() => generalApiData.getProfile());

const orchestratorDependencies = {
  currentPatient,
  getStudy: generalApiData.getStudy,
  getClinic: generalApiData.getClinic,
};

/** Catálogo, perfil del paciente, acceso y registro: API general, en los dos modos. */
export const generalData: GeneralData =
  backend === "orchestrator" ? { ...generalApiData, getProfile: currentPatient } : generalApiData;

/** Notificación de los cambios del trámite. */
export const requestNotifier: RequestNotifier =
  backend === "orchestrator" ? createOrchestratorNotifier(orchestratorDependencies) : legacyRequestNotifier;

/** Consulta del último estado del trámite. */
export const requestQuery: RequestQuery =
  backend === "orchestrator" ? createOrchestratorQuery(orchestratorDependencies) : legacyRequestQuery;

/** Lo que soporta el adaptador activo del trámite. Las pantallas muestran solo eso. */
export const requestCapabilities: RequestCapabilities =
  backend === "orchestrator" ? orchestratorCapabilities : legacyCapabilities;

/** Se ejecuta al arrancar. Detiene el servidor si la configuración de un adaptador en uso es inválida. */
export async function checkConfiguration(): Promise<void> {
  checkSettings();
  // La API general se usa en los dos modos: acceso, perfil y catálogo.
  checkGeneralApiConfiguration();
  if (readRequestsBackend() === "orchestrator") await checkOrchestratorConfiguration();
}
