import "server-only";
import type { Secret } from "./secret";

/**
 * Permisos de trámite del canal Web. Viven solo en la memoria del proceso, asociados a paciente y trámite:
 * nunca se escriben en disco, en cookies ni en una respuesta. Al reiniciar el servidor se pierden,
 * y esos trámites pasan a necesitar un permiso nuevo.
 */
type Entry = { grant: Secret; expiresAt: number };

// En `globalThis` para que todas las copias del módulo que cargue Next compartan el mismo almacén.
const STORE = Symbol.for("salud-digna.patient-portal.journey-grants");
type Holder = { [STORE]?: Map<string, Entry> };

function store(): Map<string, Entry> {
  const holder = globalThis as Holder;
  holder[STORE] ??= new Map();
  return holder[STORE];
}

function key(accountId: string, requestId: string): string {
  return `${accountId}\n${requestId}`;
}

function purgeExpired(now: number): void {
  for (const [entryKey, entry] of store()) {
    if (entry.expiresAt <= now) store().delete(entryKey);
  }
}

/** Guarda el permiso de un trámite del paciente. `expiresAt` es la fecha que informó el orquestador. */
export function saveGrant(accountId: string, requestId: string, grant: Secret, expiresAt: number): void {
  const now = Date.now();
  purgeExpired(now);
  if (expiresAt > now) store().set(key(accountId, requestId), { grant, expiresAt });
}

/** Permiso vigente del paciente para ese trámite. `undefined` si falta o venció. */
export function findGrant(accountId: string, requestId: string): Secret | undefined {
  const entryKey = key(accountId, requestId);
  const entry = store().get(entryKey);
  if (!entry) return undefined;
  // Igual que el orquestador: vencido cuando la fecha es igual o anterior a la hora actual.
  if (entry.expiresAt <= Date.now()) {
    store().delete(entryKey);
    return undefined;
  }
  return entry.grant;
}

/** Olvida un permiso que el orquestador ya no acepta. */
export function dropGrant(accountId: string, requestId: string): void {
  store().delete(key(accountId, requestId));
}
