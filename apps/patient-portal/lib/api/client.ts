import "server-only";
import { getApiBaseUrl } from "./config";
import type { paths } from "./schema";

const TIMEOUT_MS = 8_000;

type WithoutPrefix<Path> = Path extends `/api/v1${infer Rest}` ? Rest : never;

/** Rutas del contrato, sin el prefijo /api/v1 que ya incluye API_BASE_URL. */
export type ApiPath = WithoutPrefix<keyof paths>;

export type ApiSuccess<Data> = { ok: true; status: number; data: Data };

/** `status` es null cuando no hubo respuesta útil: fallo de red, tiempo de espera o cuerpo ilegible. */
export type ApiFailure = { ok: false; status: number | null; retryAfter?: number };

export type ApiResult<Data> = ApiSuccess<Data> | ApiFailure;

type ApiRequest = {
  method: "GET" | "POST" | "PATCH";
  path: ApiPath;
  token?: string;
  body?: unknown;
};

// El registro omite tokens, contraseñas y cuerpos: solo método, ruta y motivo.
function report(method: string, path: string, reason: string) {
  console.error(`[api] ${method} ${path}: ${reason}`);
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value || !/^\d+$/.test(value.trim())) return undefined;
  return Number(value);
}

export async function apiRequest<Data>({ method, path, token, body }: ApiRequest): Promise<ApiResult<Data>> {
  // Las cabeceras se construyen aquí. Nada de lo que envía el navegador llega a la API.
  const headers = new Headers({ Accept: "application/json" });
  if (body !== undefined) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(getApiBaseUrl() + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    report(method, path, timedOut ? "tiempo de espera agotado" : "fallo de red");
    return { ok: false, status: null };
  }

  if (!response.ok) {
    // El cuerpo del error se descarta: su mensaje nunca llega a la interfaz.
    await response.body?.cancel().catch(() => undefined);
    if (response.status >= 500) report(method, path, `respuesta ${response.status}`);
    return {
      ok: false,
      status: response.status,
      retryAfter: parseRetryAfter(response.headers.get("Retry-After")),
    };
  }

  try {
    return { ok: true, status: response.status, data: (await response.json()) as Data };
  } catch {
    report(method, path, "cuerpo ilegible");
    return { ok: false, status: null };
  }
}
