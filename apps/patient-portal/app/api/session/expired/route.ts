import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { getMe } from "@/lib/api/auth";
import { clearSessionCookie, readSessionToken } from "@/lib/session/cookie";
import { safeDestination, signInUrl } from "@/lib/session/routes";

/**
 * Destino de las páginas protegidas cuando la API responde 401.
 * Vuelve a preguntar a la API y solo borra la cookie si la sesión ya es inválida,
 * así un enlace a esta ruta no puede cerrar una sesión vigente.
 */
export async function GET(request: NextRequest) {
  const destination = safeDestination(request.nextUrl.searchParams.get("destino"));
  const token = await readSessionToken();

  if (token) {
    const result = await getMe(token);
    if (result.ok) redirect(destination);
    if (result.status === 401) await clearSessionCookie();
  }

  redirect(signInUrl(destination));
}
