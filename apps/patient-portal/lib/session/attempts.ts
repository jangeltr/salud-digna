import "server-only";

/**
 * Límite de intentos en memoria, por clave. Sirve con un único proceso del portal
 * y se vacía al reiniciar el servidor.
 */
export type AttemptLimit = {
  /** Intentos fallidos que se toleran dentro de la ventana. */
  limit: number;
  windowMs: number;
};

type Window = { count: number; resetsAt: number };

// En `globalThis` para que todas las copias del módulo que cargue Next compartan el mismo contador.
const STORE = Symbol.for("salud-digna.patient-portal.attempts");
type Holder = { [STORE]?: Map<string, Window> };

function store(): Map<string, Window> {
  const holder = globalThis as Holder;
  holder[STORE] ??= new Map();
  return holder[STORE];
}

/**
 * Reserva un intento antes de ejecutarlo, para que varias peticiones simultáneas no se salten el límite.
 * Devuelve `false` si la clave ya agotó sus intentos en la ventana.
 */
export function takeAttempt(key: string, { limit, windowMs }: AttemptLimit, now: number = Date.now()): boolean {
  for (const [entryKey, entry] of store()) {
    if (entry.resetsAt <= now) store().delete(entryKey);
  }

  const current = store().get(key) ?? { count: 0, resetsAt: now + windowMs };
  if (current.count >= limit) return false;
  store().set(key, { ...current, count: current.count + 1 });
  return true;
}

/** Devuelve un intento reservado: solo cuentan los fallidos. */
export function refundAttempt(key: string): void {
  const current = store().get(key);
  if (current && current.count > 0) store().set(key, { ...current, count: current.count - 1 });
}
