import "server-only";
import { readSessionToken } from "@/lib/session/cookie";
import { apiRequest, type ApiRequest, type ApiResult } from "./client";

/**
 * Llamada con la sesión del paciente. El token sale del módulo de sesión, así que no viaja
 * por páginas ni acciones. Sin token no se llama a la API: equivale a una sesión inválida.
 */
export async function authorizedRequest<Data>(
  request: Omit<ApiRequest, "token" | "revalidate">,
): Promise<ApiResult<Data>> {
  const token = await readSessionToken();
  if (!token) return { ok: false, status: 401 };
  return apiRequest<Data>({ ...request, token });
}
