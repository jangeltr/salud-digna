import "server-only";
import { readServiceUrl } from "../service-url";

/**
 * Lee y valida API_BASE_URL. Exige https, salvo en localhost y 127.0.0.1.
 * Los mensajes de error omiten el valor de la variable.
 */
export function readApiBaseUrl(value = process.env.API_BASE_URL): string {
  return readServiceUrl("API_BASE_URL", value);
}

let apiBaseUrl: string | undefined;

export function getApiBaseUrl(): string {
  apiBaseUrl ??= readApiBaseUrl();
  return apiBaseUrl;
}
