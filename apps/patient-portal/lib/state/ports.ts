import type { Patient } from "@/lib/domain/model";
import type { Secret } from "@/lib/secret";

/**
 * Estado que el portal guarda entre peticiones. Cada almacén es una interfaz asíncrona, así que
 * una implementación compartida entre instancias puede sustituir a la actual sin tocar a quien la usa.
 * Hoy la única implementación vive en el proceso: memoria y un archivo. `lib/composition.ts` la elige.
 */

/** Trámite que el portal sabe que pertenece a una cuenta. */
export type RegistryEntry = {
  id: string;
  /** Cuándo lo registró el portal, en ISO 8601. */
  createdAt: string;
  /** Cuándo supo el portal que quedó cerrado. Un trámite cerrado no vuelve a abrirse. */
  closedAt?: string;
};

/**
 * Registro del canal Web: qué trámites tiene cada cuenta. Es la única fuente de esa relación,
 * porque el orquestador no ofrece consultar los trámites de un paciente. Sin permisos ni claves.
 */
export interface RequestRegistry {
  /** Trámites de la cuenta, del más reciente al más antiguo. */
  list(accountId: string): Promise<RegistryEntry[]>;
  has(accountId: string, requestId: string): Promise<boolean>;
  add(accountId: string, requestId: string, createdAt: string): Promise<void>;
  markClosed(accountId: string, requestId: string, closedAt: string): Promise<void>;
  /** Se ejecuta al arrancar: comprueba que el almacén se puede usar. */
  prepare(): Promise<void>;
}

/** Permisos de trámite, por cuenta y trámite. Son secretos: nunca se escriben en texto plano. */
export interface GrantStore {
  /** `expiresAt` en milisegundos desde 1970. Un permiso ya vencido no se guarda. */
  save(accountId: string, requestId: string, grant: Secret, expiresAt: number): Promise<void>;
  /** Permiso vigente, o `undefined` si falta o venció. */
  find(accountId: string, requestId: string): Promise<Secret | undefined>;
  drop(accountId: string, requestId: string): Promise<void>;
}

/** Claves de idempotencia de creaciones con resultado incierto, por cuenta. */
export interface PendingCreationStore {
  get(accountId: string): Promise<string | undefined>;
  set(accountId: string, key: string, ttlMs: number): Promise<void>;
  delete(accountId: string): Promise<void>;
}

/** Tope de intentos dentro de una ventana fija. */
export type AttemptLimit = { limit: number; windowMs: number };

/** Espera creciente: tras `free` fallos, cada fallo nuevo impone la siguiente espera de la lista. */
export type Backoff = {
  free: number;
  delaysMs: readonly number[];
  /** Tiempo sin fallos tras el que la cuenta vuelve a cero. */
  forgetAfterMs: number;
};

/** Contadores de los límites propios del portal. Todos los tiempos se devuelven en segundos. */
export interface AttemptStore {
  /** Reserva un intento. Devuelve 0 si se admite, o los segundos que faltan para que la ventana se reinicie. */
  take(key: string, limit: AttemptLimit): Promise<number>;
  /** Devuelve un intento reservado, cuando no debe contar. */
  refund(key: string): Promise<void>;
  /** Segundos de espera pendientes, o 0. */
  blockedFor(key: string): Promise<number>;
  /** Anota un fallo y devuelve la espera que impone, o 0 si aún quedan fallos libres. */
  recordFailure(key: string, policy: Backoff): Promise<number>;
  clearFailures(key: string): Promise<void>;
}

/**
 * Perfiles de sesión ya validados por la API general. La clave es un hash del token:
 * el token nunca se guarda.
 */
export interface SessionCache {
  get(tokenHash: string): Promise<Patient | undefined>;
  set(tokenHash: string, patient: Patient, ttlMs: number): Promise<void>;
  delete(tokenHash: string): Promise<void>;
  /** Vencimiento del token, conocido al iniciar sesión. */
  rememberExpiry(tokenHash: string, expiresAt: number): Promise<void>;
  expiryOf(tokenHash: string): Promise<number | undefined>;
}
