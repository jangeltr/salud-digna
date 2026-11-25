import "server-only";
import { readClientIp } from "@/lib/session/client-ip";
import { forwardsClientIp, getApiBaseUrl } from "./config";
import type { paths } from "./schema";

const TIMEOUT_MS = 8_000;

/**
 * Cabecera con la IP del paciente, solo si `FORWARD_CLIENT_IP` está encendida.
 * El nombre es propio a propósito: un proxy delante de la API sobrescribe las cabeceras de reenvío
 * habituales. Está pendiente de acordar con el equipo de la API.
 */
const CLIENT_IP_HEADER_FOR_API = "X-Portal-Client-IP";

type WithoutPrefix<Path> = Path extends `/api/v1${infer Rest}` ? Rest : never;

/** Rutas del contrato, sin el prefijo /api/v1 que ya incluye API_BASE_URL. */
export type ApiPath = WithoutPrefix<keyof paths>;

export type ApiSuccess<Data> = { ok: true; status: number; data: Data };

/** `status` es null cuando no hubo respuesta útil: fallo de red, tiempo de espera o cuerpo ilegible. */
export type ApiFailure = { ok: false; status: number | null; retryAfter?: number };

export type ApiResult<Data> = ApiSuccess<Data> | ApiFailure;

export type ApiRequest = {
  method: "GET" | "POST" | "PATCH";
  path: ApiPath;
  /** Valores para los segmentos entre llaves de la ruta, como `{id}`. */
  params?: Record<string, string>;
  query?: Record<string, string | number | undefined>;
  token?: string;
  body?: unknown;
  /** Segundos que puede reutilizarse una respuesta pública. Se ignora si la petición lleva token. */
  revalidate?: number;
};

// El registro omite tokens, contraseñas, cuerpos y parámetros: solo método, ruta del contrato y motivo.
function report(method: string, path: string, reason: string) {
  console.error(`[api] ${method} ${path}: ${reason}`);
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value || !/^\d+$/.test(value.trim())) return undefined;
  return Number(value);
}

function buildUrl({ path, params, query }: Pick<ApiRequest, "path" | "params" | "query">): string {
  const resolved = path.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = params?.[name];
    if (value === undefined) throw new Error(`Falta el parámetro de ruta ${name}.`);
    return encodeURIComponent(value);
  });

  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== "") search.set(name, String(value));
  }

  return getApiBaseUrl() + resolved + (search.size > 0 ? `?${search}` : "");
}

export async function apiRequest<Data>(request: ApiRequest): Promise<ApiResult<Data>> {
  const { method, path, token, body, revalidate } = request;

  // Las cabeceras se construyen aquí. Nada de lo que envía el navegador llega a la API.
  const headers = new Headers({ Accept: "application/json" });
  if (body !== undefined) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  // Solo se reutilizan lecturas públicas. Con token la respuesta nunca se guarda.
  const cacheable = method === "GET" && !token && revalidate !== undefined;

  // La IP sale de la cabecera del proxy de confianza, nunca de otra cabecera del navegador.
  // No viaja en las lecturas que se guardan en caché: una respuesta compartida no depende del cliente.
  if (!cacheable && forwardsClientIp()) {
    const clientIp = await readClientIp();
    if (clientIp) headers.set(CLIENT_IP_HEADER_FOR_API, clientIp);
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(request), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      ...(cacheable ? { next: { revalidate } } : { cache: "no-store" as const }),
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
    // Toda respuesta que no sea 2xx deja el código, salvo el 404 de un estudio o una clínica por identificador,
    // que es un enlace a un registro inactivo o inexistente y no un fallo.
    const catalogMiss = response.status === 404 && (path === "/studies/{id}" || path === "/clinics/{id}");
    if (!catalogMiss) report(method, path, `respuesta ${response.status}`);
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
