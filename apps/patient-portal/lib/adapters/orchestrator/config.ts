import "server-only";
import path from "node:path";
import { readServiceUrl } from "../service-url";
import { Secret } from "./secret";

/** Lee y valida ORCHESTRATOR_BASE_URL. Exige https, salvo en localhost y 127.0.0.1. */
export function readOrchestratorBaseUrl(value = process.env.ORCHESTRATOR_BASE_URL): string {
  return readServiceUrl("ORCHESTRATOR_BASE_URL", value);
}

// El contrato describe la clave como `<keyId>.<secret>`. Solo se comprueba esa forma, sin fijar longitudes.
const CHANNEL_KEY = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/** Lee ORCHESTRATOR_API_KEY, la clave del canal Web. Los mensajes de error omiten su valor. */
export function readChannelKey(value = process.env.ORCHESTRATOR_API_KEY): Secret {
  if (!value) {
    throw new Error("Falta ORCHESTRATOR_API_KEY. Defínela en .env.local con la clave del canal Web.");
  }
  if (!CHANNEL_KEY.test(value)) {
    throw new Error("ORCHESTRATOR_API_KEY debe tener la forma <keyId>.<secret>, sin el prefijo Bearer ni espacios.");
  }
  return new Secret(value);
}

/**
 * Carpeta del registro del canal Web. Por defecto, `.data` dentro del portal.
 * Es una carpeta de datos que se decide al arrancar, no un recurso del código:
 * el comentario evita que la compilación rastree todo el proyecto por esta ruta.
 */
export function readDataDir(value = process.env.PORTAL_DATA_DIR): string {
  return path.resolve(/* turbopackIgnore: true */ value || ".data");
}

let baseUrl: string | undefined;
let channelKey: Secret | undefined;
let dataDir: string | undefined;

export function getOrchestratorBaseUrl(): string {
  baseUrl ??= readOrchestratorBaseUrl();
  return baseUrl;
}

export function getChannelKey(): Secret {
  channelKey ??= readChannelKey();
  return channelKey;
}

export function getDataDir(): string {
  dataDir ??= readDataDir();
  return dataDir;
}
