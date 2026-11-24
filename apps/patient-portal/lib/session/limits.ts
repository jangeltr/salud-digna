import "server-only";
import type { AttemptLimit, Backoff } from "@/lib/state/ports";

/**
 * Límites propios del portal. Son independientes de los que apliquen la API general y el orquestador:
 * todas las peticiones a esos servicios salen del servidor del portal, así que ellos no distinguen
 * a un paciente de otro por su IP.
 */

const MINUTE = 60_000;
const WAITS = [30_000, MINUTE, 2 * MINUTE, 5 * MINUTE, 15 * MINUTE] as const;

/** Acceso, por correo: tres fallos libres y después esperas de 30 segundos a 15 minutos. */
export const LOGIN_BY_EMAIL: Backoff = { free: 3, delaysMs: WAITS, forgetAfterMs: 30 * MINUTE };

/** Acceso, por IP del cliente: cinco fallos libres, porque varios pacientes pueden compartir una IP. */
export const LOGIN_BY_IP: Backoff = { free: 5, delaysMs: WAITS, forgetAfterMs: 30 * MINUTE };

/** Trámites que un paciente puede empezar por hora. Cuenta cada intento que llega al servicio. */
export const REQUESTS_PER_HOUR: AttemptLimit = { limit: 20, windowMs: 60 * MINUTE };

/** Códigos de continuidad que un paciente puede generar por hora. */
export const CONTINUITY_CODES_PER_HOUR: AttemptLimit = { limit: 30, windowMs: 60 * MINUTE };

/** Canjes fallidos que se toleran por paciente. El orquestador admite diez por minuto a todo el canal. */
export const CONTINUITY_REDEEM: AttemptLimit = { limit: 5, windowMs: 10 * MINUTE };

/** Tiempo de espera en palabras: «30 segundos», «1 minuto», «12 minutos». */
export function waitText(seconds: number | undefined): string {
  if (seconds === undefined || seconds <= 0) return "unos minutos";
  if (seconds < 60) return seconds === 1 ? "1 segundo" : `${seconds} segundos`;
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? "1 minuto" : `${minutes} minutos`;
}
