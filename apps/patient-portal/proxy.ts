import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session/cookie";
import { PATH_HEADER, isProtectedPath, signInUrl } from "@/lib/session/routes";

/**
 * Comprobación optimista: solo mira si la cookie existe y no llama a la API.
 * La validez de la sesión se verifica en el servidor con GET /auth/me, en lib/session.
 */
export function proxy(request: NextRequest) {
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
