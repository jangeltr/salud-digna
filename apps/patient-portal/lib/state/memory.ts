import "server-only";
import type { Patient } from "@/lib/domain/model";
import type { Secret } from "@/lib/secret";
import type { AssertionCache, AttemptLimit, AttemptStore, Backoff, GrantStore, PendingCreationStore, SessionCache } from "./ports";

/**
 * Implementaciones en la memoria del proceso. Sirven con una sola instancia del portal
 * y se vacían al reiniciar el servidor.
 *
 * Cada mapa vive en `globalThis`, bajo un símbolo propio, para que todas las copias de este módulo
 * que cargue Next compartan los mismos datos.
 */
function shared<Value>(name: string, create: () => Value): Value {
  const key = Symbol.for(`salud-digna.patient-portal.${name}`);
  const holder = globalThis as Record<symbol, Value | undefined>;
  holder[key] ??= create();
  return holder[key];
}

function seconds(ms: number): number {
  return Math.max(1, Math.ceil(ms / 1000));
}

type Expiring<Value> = { value: Value; expiresAt: number };

/** Mapa con vencimiento por entrada. Purga lo vencido al escribir. */
function expiringMap<Value>(name: string) {
  const map = shared(name, () => new Map<string, Expiring<Value>>());
  return {
    get(key: string): Value | undefined {
      const entry = map.get(key);
      if (!entry) return undefined;
      // Vencido cuando la fecha es igual o anterior a la hora actual.
      if (entry.expiresAt <= Date.now()) {
        map.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key: string, value: Value, expiresAt: number): void {
      const now = Date.now();
      for (const [entryKey, entry] of map) {
        if (entry.expiresAt <= now) map.delete(entryKey);
      }
      if (expiresAt > now) map.set(key, { value, expiresAt });
    },
    delete(key: string): void {
      map.delete(key);
    },
  };
}

const pair = (accountId: string, requestId: string) => `${accountId}\n${requestId}`;

/**
 * Permisos de trámite. Viven solo en memoria: nunca se escriben en disco, en cookies ni en una respuesta.
 * Al reiniciar el servidor se pierden, y esos trámites pasan a necesitar un permiso nuevo.
 */
export function createMemoryGrantStore(): GrantStore {
  const grants = expiringMap<Secret>("journey-grants");
  return {
    async save(accountId, requestId, grant, expiresAt) {
      grants.set(pair(accountId, requestId), grant, expiresAt);
    },
    async find(accountId, requestId) {
      return grants.get(pair(accountId, requestId));
    },
    async drop(accountId, requestId) {
      grants.delete(pair(accountId, requestId));
    },
  };
}

/** Acreditaciones del paciente, solo en memoria y con el vencimiento que fija `lib/identity/cache.ts`. */
export function createMemoryAssertionCache(): AssertionCache {
  const assertions = expiringMap<Secret>("patient-assertions");
  return {
    async get(sessionKey) {
      return assertions.get(sessionKey);
    },
    async set(sessionKey, assertion, expiresAt) {
      assertions.set(sessionKey, assertion, expiresAt);
    },
    async delete(sessionKey) {
      assertions.delete(sessionKey);
    },
  };
}

export function createMemoryPendingCreationStore(): PendingCreationStore {
  const pending = expiringMap<string>("pending-creations");
  return {
    async get(accountId) {
      return pending.get(accountId);
    },
    async set(accountId, key, ttlMs) {
      pending.set(accountId, key, Date.now() + ttlMs);
    },
    async delete(accountId) {
      pending.delete(accountId);
    },
  };
}

type Window = { count: number; resetsAt: number };
type Failures = { count: number; blockedUntil: number; lastAt: number; forgetAfterMs: number };

export function createMemoryAttemptStore(): AttemptStore {
  const windows = shared("attempt-windows", () => new Map<string, Window>());
  const failures = shared("attempt-failures", () => new Map<string, Failures>());

  function purge(now: number): void {
    for (const [key, entry] of windows) {
      if (entry.resetsAt <= now) windows.delete(key);
    }
    for (const [key, entry] of failures) {
      if (entry.blockedUntil <= now && now - entry.lastAt > entry.forgetAfterMs) failures.delete(key);
    }
  }

  return {
    // Se reserva antes de ejecutar el intento, para que varias peticiones simultáneas no se salten el tope.
    async take(key, { limit, windowMs }: AttemptLimit) {
      const now = Date.now();
      purge(now);
      const current = windows.get(key) ?? { count: 0, resetsAt: now + windowMs };
      if (current.count >= limit) return seconds(current.resetsAt - now);
      windows.set(key, { ...current, count: current.count + 1 });
      return 0;
    },

    async refund(key) {
      const current = windows.get(key);
      if (current && current.count > 0) windows.set(key, { ...current, count: current.count - 1 });
    },

    async blockedFor(key) {
      const entry = failures.get(key);
      const now = Date.now();
      return entry && entry.blockedUntil > now ? seconds(entry.blockedUntil - now) : 0;
    },

    // Cada fallo por encima de los libres alarga la espera hasta el último valor de la lista.
    async recordFailure(key, policy: Backoff) {
      const now = Date.now();
      purge(now);
      const previous = failures.get(key);
      const count = (previous && now - previous.lastAt <= policy.forgetAfterMs ? previous.count : 0) + 1;
      const over = count - policy.free;
      const delay = over > 0 ? policy.delaysMs[Math.min(over, policy.delaysMs.length) - 1] : 0;
      failures.set(key, { count, blockedUntil: delay > 0 ? now + delay : 0, lastAt: now, forgetAfterMs: policy.forgetAfterMs });
      return delay > 0 ? seconds(delay) : 0;
    },

    async clearFailures(key) {
      failures.delete(key);
    },
  };
}

/** Hasta dónde se recuerda el vencimiento de un token: lo que dura una sesión larga. */
const EXPIRY_MEMORY_MS = 24 * 60 * 60_000;

export function createMemorySessionCache(): SessionCache {
  const profiles = expiringMap<Patient>("session-profiles");
  const expiries = expiringMap<number>("session-expiries");
  return {
    async get(tokenHash) {
      return profiles.get(tokenHash);
    },
    async set(tokenHash, patient, ttlMs) {
      profiles.set(tokenHash, patient, Date.now() + ttlMs);
    },
    async delete(tokenHash) {
      profiles.delete(tokenHash);
      expiries.delete(tokenHash);
    },
    async rememberExpiry(tokenHash, expiresAt) {
      expiries.set(tokenHash, expiresAt, Math.min(expiresAt, Date.now() + EXPIRY_MEMORY_MS));
    },
    async expiryOf(tokenHash) {
      return expiries.get(tokenHash);
    },
  };
}
