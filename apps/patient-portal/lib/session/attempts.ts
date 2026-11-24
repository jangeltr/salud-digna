import "server-only";

/**
 * Límites de intentos en memoria, por clave. Sirven con un único proceso del portal
 * y se vacían al reiniciar el servidor.
 */

/** Tope de intentos dentro de una ventana fija. */
export type AttemptLimit = { limit: number; windowMs: number };

/** Espera creciente: tras `free` fallos, cada fallo nuevo impone la siguiente espera de la lista. */
export type Backoff = {
  free: number;
  delaysMs: readonly number[];
  /** Tiempo sin fallos tras el que la cuenta vuelve a cero. */
  forgetAfterMs: number;
};

type Window = { count: number; resetsAt: number };
type Failures = { count: number; blockedUntil: number; lastAt: number; forgetAfterMs: number };

// En `globalThis` para que todas las copias del módulo que cargue Next compartan los contadores.
const STORE = Symbol.for("salud-digna.patient-portal.attempts");
type Holder = { [STORE]?: { windows: Map<string, Window>; failures: Map<string, Failures> } };

function store() {
  const holder = globalThis as Holder;
  holder[STORE] ??= { windows: new Map(), failures: new Map() };
  return holder[STORE];
}

function purge(now: number): void {
  const { windows, failures } = store();
  for (const [key, entry] of windows) {
    if (entry.resetsAt <= now) windows.delete(key);
  }
  for (const [key, entry] of failures) {
    if (entry.blockedUntil <= now && now - entry.lastAt > entry.forgetAfterMs) failures.delete(key);
  }
}

function seconds(ms: number): number {
  return Math.max(1, Math.ceil(ms / 1000));
}

/**
 * Reserva un intento antes de ejecutarlo, para que varias peticiones simultáneas no se salten el tope.
 * Devuelve 0 si el intento se admite, o los segundos que faltan para que la ventana se reinicie.
 */
export function takeAttempt(key: string, { limit, windowMs }: AttemptLimit, now: number = Date.now()): number {
  purge(now);
  const { windows } = store();
  const current = windows.get(key) ?? { count: 0, resetsAt: now + windowMs };
  if (current.count >= limit) return seconds(current.resetsAt - now);
  windows.set(key, { ...current, count: current.count + 1 });
  return 0;
}

/** Devuelve un intento reservado, cuando no debe contar. */
export function refundAttempt(key: string): void {
  const { windows } = store();
  const current = windows.get(key);
  if (current && current.count > 0) windows.set(key, { ...current, count: current.count - 1 });
}

/** Segundos de espera que le quedan a la clave, o 0 si puede intentarlo. */
export function blockedFor(key: string, now: number = Date.now()): number {
  const entry = store().failures.get(key);
  return entry && entry.blockedUntil > now ? seconds(entry.blockedUntil - now) : 0;
}

/**
 * Anota un fallo. Devuelve los segundos de espera que impone, o 0 si la clave aún tiene fallos libres.
 * Cada fallo por encima de los libres alarga la espera hasta el último valor de la lista.
 */
export function recordFailure(key: string, policy: Backoff, now: number = Date.now()): number {
  purge(now);
  const { failures } = store();
  const previous = failures.get(key);
  const count = (previous && now - previous.lastAt <= policy.forgetAfterMs ? previous.count : 0) + 1;

  const over = count - policy.free;
  const delay = over > 0 ? policy.delaysMs[Math.min(over, policy.delaysMs.length) - 1] : 0;
  failures.set(key, { count, blockedUntil: delay > 0 ? now + delay : 0, lastAt: now, forgetAfterMs: policy.forgetAfterMs });
  return delay > 0 ? seconds(delay) : 0;
}

/** Olvida los fallos de una clave, tras un intento correcto. */
export function clearFailures(key: string): void {
  store().failures.delete(key);
}
