import "server-only";
import { readSessionToken } from "@/lib/session/cookie";
import { apiRequest, type ApiRequest, type ApiResult } from "./client";
import { forgetSession } from "./session";

/**
 * Llamada con la sesión del paciente. El token sale del módulo de sesión, así que no viaja
 * por páginas ni acciones. Sin token no se llama a la API: equivale a una sesión inválida.
 * Un `401` borra el perfil guardado de esa sesión.
 */
export async function authorizedRequest<Data>(
  request: Omit<ApiRequest, "token" | "revalidate">,
): Promise<ApiResult<Data>> {
  const token = await readSessionToken();
  if (!token) return { ok: false, status: 401 };
  const result = await apiRequest<Data>({ ...request, token });
  if (!result.ok && result.status === 401) await forgetSession(token);
  return result;
}
