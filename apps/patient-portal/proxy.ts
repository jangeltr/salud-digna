import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session/cookie";
import { PATH_HEADER, isProtectedPath, signInUrl } from "@/lib/session/routes";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const isDevelopment = process.env.NODE_ENV === "development";

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
 * Política de contenido con un nonce por petición, como indica la guía de Next: solo se ejecutan
 * los scripts que llevan el nonce y los que ellos cargan. Next lo lee de la cabecera de la petición
 * y lo pone en sus propios scripts y estilos. En desarrollo React necesita `eval` y estilos en línea.
 *
 * No incluye `upgrade-insecure-requests`: rompería las pruebas locales por http, y en producción
 * `Strict-Transport-Security` ya obliga a usar https.
 */
function contentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' ${isDevelopment ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
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

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = contentSecurityPolicy(nonce);

  // Se sobrescriben siempre, así el navegador no puede fijar estas cabeceras.
  const headers = new Headers(request.headers);
  headers.set(PATH_HEADER, path);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", policy);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon$|apple-icon$).*)"],
};
