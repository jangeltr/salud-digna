import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { generalData } from "@/lib/composition";
import { clearSessionCookie } from "@/lib/session/cookie";
import { safeDestination, signInUrl } from "@/lib/session/routes";
import { hasSessionCookie } from "@/lib/session/session";

/**
 * Destino de las páginas protegidas cuando la sesión resulta inválida.
 * Vuelve a comprobarla y solo borra la cookie si sigue siendo inválida,
 * así un enlace a esta ruta no puede cerrar una sesión vigente.
 */
export async function GET(request: NextRequest) {
  const destination = safeDestination(request.nextUrl.searchParams.get("destino"));

  if (await hasSessionCookie()) {
    const result = await generalData.getProfile();
    if (result.ok) redirect(destination);
    if (result.error.kind === "session") await clearSessionCookie();
  }

  redirect(signInUrl(destination));
}
