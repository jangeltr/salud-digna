import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session/cookie";
import { PATH_HEADER, isProtectedPath, signInUrl } from "@/lib/session/routes";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Compara `Origin` con el host de la petición, igual que hace Next al ejecutar una acción de servidor.
 * Aquí solo se adelanta el rechazo para responder 403. La comprobación de Next sigue activa después.
 */
function hasForeignOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (origin === null) return false;

  let originHost: string;
  try {
    originHost = origin === "null" ? "null" : new URL(origin).host;
  } catch {
    return true;
  }

  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host");
  return !host || originHost !== host;
}

/**
 * Comprobación optimista de sesión: solo mira si la cookie existe y no llama a la API.
 * La validez de la sesión se verifica en el servidor con GET /auth/me, en lib/session.
 */
export function proxy(request: NextRequest) {
  if (!SAFE_METHODS.has(request.method) && hasForeignOrigin(request)) {
    return new NextResponse("Solicitud rechazada.", {
      status: 403,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const { pathname, searchParams } = request.nextUrl;
  const query = new URLSearchParams(searchParams);
  query.delete("_rsc");
  const path = query.size > 0 ? `${pathname}?${query}` : pathname;

  if (isProtectedPath(pathname) && !request.cookies.get(SESSION_COOKIE)?.value) {
    return NextResponse.redirect(new URL(signInUrl(path), request.url));
  }

  // Se sobrescribe siempre, así el navegador no puede fijar esta cabecera.
  const headers = new Headers(request.headers);
  headers.set(PATH_HEADER, path);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icons/|icon$|apple-icon$|manifest\\.webmanifest$).*)"],
};
