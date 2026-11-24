import "server-only";
import { getChannelKey, getOrchestratorBaseUrl } from "./config";
import type { Secret } from "./secret";

const TIMEOUT_MS = 8_000;

/** Rutas de `journey-writes.md` y `journey-queries.md`, sin el prefijo /api/v1 que ya incluye ORCHESTRATOR_BASE_URL. */
export type OrchestratorPath =
  | "/journeys"
  | "/events"
  | "/journeys/:journeyId"
  | "/journeys/:journeyId/context"
  | "/journeys/:journeyId/history";

export type OrchestratorSuccess = { ok: true; status: number; data: unknown };

/**
 * `status` es null cuando no hubo respuesta útil: fallo de red, tiempo de espera o cuerpo ilegible.
 * `timedOut` distingue el tiempo de espera agotado, el único caso en que se reenvía un evento.
 */
export type OrchestratorFailure = { ok: false; status: number | null; timedOut: boolean; retryAfter?: number };

export type OrchestratorResult = OrchestratorSuccess | OrchestratorFailure;

export type OrchestratorRequest = {
  method: "GET" | "POST";
  path: OrchestratorPath;
  /** Valor del segmento `:journeyId`. */
  journeyId?: string;
  query?: Record<string, string | number | undefined>;
  /** Permiso del trámite. Viaja en X-Journey-Grant. */
  grant?: Secret;
  /** Clave de idempotencia de `POST /journeys`. Viaja en Idempotency-Key. */
  idempotencyKey?: string;
  /** Cuerpo JSON ya serializado, para que un reenvío sea idéntico byte a byte. */
  body?: string;
};

// El registro omite la clave del canal, los permisos, las claves de idempotencia, los cuerpos
// y los identificadores: solo método, ruta del contrato y motivo.
function report(method: string, path: string, reason: string) {
  console.error(`[orquestador] ${method} ${path}: ${reason}`);
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value || !/^\d+$/.test(value.trim())) return undefined;
  return Number(value);
}

function buildUrl({ path, journeyId, query }: OrchestratorRequest): string {
  const resolved = path.replace(":journeyId", () => {
    if (journeyId === undefined) throw new Error("Falta el identificador del trámite.");
    return encodeURIComponent(journeyId);
  });

  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== "") search.set(name, String(value));
  }

  return getOrchestratorBaseUrl() + resolved + (search.size > 0 ? `?${search}` : "");
}

/** Única salida hacia el orquestador. Ninguna respuesta se guarda en caché. */
export async function orchestratorRequest(request: OrchestratorRequest): Promise<OrchestratorResult> {
  const { method, path, grant, idempotencyKey, body } = request;

  // Las cabeceras se construyen aquí y no salen de esta función: no se registran ni se devuelven.
  const headers = new Headers({ Accept: "application/json" });
  headers.set("Authorization", `Bearer ${getChannelKey().reveal()}`);
  if (grant) headers.set("X-Journey-Grant", grant.reveal());
  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);
  if (body !== undefined) headers.set("Content-Type", "application/json");

  let response: Response;
  try {
    response = await fetch(buildUrl(request), {
      method,
      headers,
      body,
      cache: "no-store",
      // Una redirección reenviaría las cabeceras secretas a otro destino.
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    // Del error solo se usa el nombre. Su mensaje no se registra.
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    report(method, path, timedOut ? "tiempo de espera agotado" : "fallo de red");
    return { ok: false, status: null, timedOut };
  }

  if (!response.ok) {
    // El cuerpo del error se descarta: su mensaje nunca llega a la interfaz.
    await response.body?.cancel().catch(() => undefined);
    if (response.status === 401 || response.status === 403) {
      report(method, path, `credencial de canal rechazada (${response.status})`);
    } else if (response.status >= 500) {
      report(method, path, `respuesta ${response.status}`);
    }
    return {
      ok: false,
      status: response.status,
      timedOut: false,
      retryAfter: parseRetryAfter(response.headers.get("Retry-After")),
    };
  }

  try {
    return { ok: true, status: response.status, data: (await response.json()) as unknown };
  } catch {
    report(method, path, "cuerpo ilegible");
    return { ok: false, status: null, timedOut: false };
  }
}

/** Para avisar de una respuesta correcta cuya forma no es la del contrato. */
export function reportUnexpectedBody(method: string, path: OrchestratorPath): void {
  report(method, path, "respuesta con forma inesperada");
}

/** Para dejar constancia de un 409 que no se explica por un cambio de versión. */
export function reportConflictWithoutVersionChange(): void {
  report("POST", "/events", "conflicto sin cambio de versión: transición inválida o identificador de evento reutilizado");
}
