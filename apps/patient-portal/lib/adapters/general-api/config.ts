import "server-only";
import { readFlag } from "@/lib/flags";
import { readServiceUrl } from "../service-url";

/**
 * Lee y valida API_BASE_URL. Exige https, salvo en localhost y 127.0.0.1.
 * Los mensajes de error omiten el valor de la variable.
 */
export function readApiBaseUrl(value = process.env.API_BASE_URL): string {
  return readServiceUrl("API_BASE_URL", value);
}

/**
 * `FORWARD_CLIENT_IP` decide si el cliente HTTP envía a la API general la IP del paciente.
 * Apagada por defecto. Solo debe encenderse cuando el equipo de la API confirme que confía
 * en esa cabecera únicamente cuando la petición viene del servidor del portal.
 */
export function readForwardClientIp(value = process.env.FORWARD_CLIENT_IP): boolean {
  return readFlag("FORWARD_CLIENT_IP", value, false);
}

let apiBaseUrl: string | undefined;
let forwardClientIp: boolean | undefined;

export function forwardsClientIp(): boolean {
  forwardClientIp ??= readForwardClientIp();
  return forwardClientIp;
}

export function getApiBaseUrl(): string {
  apiBaseUrl ??= readApiBaseUrl();
  return apiBaseUrl;
}
