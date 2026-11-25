export class ApiError extends Error {
  constructor(public readonly status: number, retryAfter: string | null = null) {
    super({
      400: "La API rechazó la solicitud. Revisa los datos y el estado vigente.",
      401: "La sesión no es válida o ha vencido.",
      403: "Tu cuenta no tiene autorización para esta operación.",
      404: "El trámite no está disponible para esta cuenta.",
      409: "La solicitud cambió. Consulta el estado vigente antes de continuar.",
      429: retryAfter && /^\d+$/.test(retryAfter)
        ? `Límite de intentos. Espera al menos ${retryAfter} segundos.`
        : "Límite de intentos. Intenta más tarde.",
    }[status] ?? "La API central no pudo completar la operación.");
  }
}

export function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : "No se pudo conectar con la API central o leer su respuesta.";
}

export type Api = <T>(path: string, body?: object) => Promise<T>;

export function apiWith(token?: string): Api {
  return async <T>(path: string, body?: object): Promise<T> => {
    const defaultOrigin = process.env.NODE_ENV === "development"
      ? "http://127.0.0.1:3000"
      : "https://api.salud-digna.app";
    const origin = new URL(process.env.NEXT_PUBLIC_GENERAL_API_ORIGIN ?? defaultOrigin);
    if (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname))) {
      throw new Error("Se requiere HTTPS para la API central.");
    }
    const response = await fetch(new URL("/api/v1/" + path, origin), {
      method: body ? "POST" : "GET",
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new ApiError(response.status, response.headers.get("Retry-After"));
    return response.json() as Promise<T>;
  };
}

export type JourneyEntry = {
  id: string;
  type: string;
  channel: string;
  createdAt: string;
  actorRole: string | null;
  payload: Record<string, string | number | boolean>;
};

export function transition(entry: JourneyEntry) {
  const { from, to, currentStep } = entry.payload;
  return [from, to].filter((value) => typeof value === "string").join(" → ")
    || (typeof currentStep === "string" ? currentStep : "");
}
