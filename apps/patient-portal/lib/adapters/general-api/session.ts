import "server-only";
import { createHash } from "node:crypto";
import type { Patient } from "@/lib/domain/model";
import type { SessionCache } from "@/lib/state/ports";

/**
 * Caché de perfiles de sesión. Evita pedir `GET /auth/me` en cada página: el perfil validado se
 * reutiliza durante el mínimo entre 60 segundos y el vencimiento del token.
 *
 * Contrapartida: durante esos segundos, una sesión que la API invalide por su cuenta sigue abriendo
 * las páginas del portal. Cualquier operación que llegue a la API con ese token recibe un `401`,
 * que borra la entrada y cierra la sesión. El cierre de sesión del propio portal también la borra.
 *
 * Solo se guarda cuando se conoce el vencimiento del token, que llega al iniciar sesión en este proceso.
 * El portal no decodifica el token, así que tras un reinicio las sesiones abiertas vuelven a validarse
 * en cada página hasta que el paciente inicia sesión otra vez.
 *
 * La clave es el SHA-256 del token: el token nunca se guarda.
 */
const MAX_TTL_MS = 60_000;

let sessions: SessionCache | undefined;

/** Lo llama `lib/composition.ts`, que decide qué implementación se usa. */
export function useSessionCache(cache: SessionCache): void {
  sessions = cache;
}

export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

export async function cachedProfile(token: string): Promise<Patient | undefined> {
  return sessions?.get(tokenHash(token));
}

export async function rememberProfile(token: string, patient: Patient): Promise<void> {
  if (!sessions) return;
  const key = tokenHash(token);
  const expiresAt = await sessions.expiryOf(key);
  if (expiresAt === undefined) return;
  const ttl = Math.min(MAX_TTL_MS, expiresAt - Date.now());
  if (ttl > 0) await sessions.set(key, patient, ttl);
}

export async function rememberExpiry(token: string, expiresAt: number): Promise<void> {
  await sessions?.rememberExpiry(tokenHash(token), expiresAt);
}

/** Tras un `401` o al cerrar sesión. */
export async function forgetSession(token: string): Promise<void> {
  await sessions?.delete(tokenHash(token));
}
