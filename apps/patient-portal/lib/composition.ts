import "server-only";
import { checkGeneralApiConfiguration, generalApiData } from "./adapters/general-api/general-data";
import { legacyRequestNotifier } from "./adapters/legacy-requests/notifier";
import { legacyRequestQuery } from "./adapters/legacy-requests/query";
import type { GeneralData, RequestNotifier, RequestQuery } from "./domain/ports";

/**
 * Composición del portal: decide qué adaptador atiende cada interfaz.
 * Es el único archivo que conoce las implementaciones. El resto del portal importa de aquí.
 *
 * Cuando exista el orquestador, sus adaptadores sustituirán a los heredados en las dos últimas líneas.
 */

/** Catálogo, perfil del paciente, acceso y registro: API general. */
export const generalData: GeneralData = generalApiData;

/** Notificación de los cambios del trámite: hoy, operaciones `/requests` de la API actual. */
export const requestNotifier: RequestNotifier = legacyRequestNotifier;

/** Consulta del último estado del trámite: hoy, operaciones `/requests` de la API actual. */
export const requestQuery: RequestQuery = legacyRequestQuery;

/** Se ejecuta al arrancar. Detiene el servidor si la configuración de un adaptador en uso es inválida. */
export function checkConfiguration(): void {
  // Los adaptadores heredados usan la misma API, así que comparten esta configuración.
  checkGeneralApiConfiguration();
}
