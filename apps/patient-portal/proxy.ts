import { NextResponse, type NextRequest } from "next/server";
import { CATALOG_CACHE_SECONDS } from "@/lib/cache-settings";
import { SESSION_COOKIE } from "@/lib/session/cookie";
import { PATH_HEADER, isProtectedPath, signInUrl } from "@/lib/session/routes";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const isDevelopment = process.env.NODE_ENV === "development";
const STUDY_DETAIL = /^\/estudios\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Listados cuya primera página es estática. Con filtros, la búsqueda está en `<ruta>/buscar`. */
const CATALOG_LISTS = new Set(["/estudios", "/clinicas"]);

/**
 * Caché de las páginas de catálogo para Nginx, una CDN y el navegador, con la duración de
 * `CATALOG_CACHE_SECONDS`. Sustituye a la de Next, que no lleva `public` y permite servir una copia
 * vieja durante un año: tras un despliegue, esa copia apuntaría a archivos de la compilación anterior.
 */
const CATALOG_CACHE_CONTROL = `public, max-age=${CATALOG_CACHE_SECONDS}, s-maxage=${CATALOG_CACHE_SECONDS}`;

/**
 * Páginas de catálogo que se generan una vez, iguales para todos, y se sirven desde caché.
 * No leen cookies ni la URL, así que no pueden llevar nonce: la guía de Next exige generar en cada
 * petición las páginas con nonce.
 */
function isCachedCatalog(pathname: string): boolean {
  return pathname === "/" || CATALOG_LISTS.has(pathname) || STUDY_DETAIL.test(pathname);
}

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
 * Política de contenido. En las páginas que se generan en cada petición lleva un nonce, como indica
 * la guía de Next: solo se ejecutan los scripts que llevan el nonce y los que ellos cargan. Next lo lee
 * de la cabecera de la petición y lo pone en sus propios scripts y estilos.
 *
 * Las páginas de catálogo que se sirven desde caché no pueden llevarlo y usan la variante sin nonce
 * de la misma guía, con scripts y estilos en línea permitidos. Esas páginas no muestran datos del
 * paciente ni texto que él escriba. En desarrollo React necesita `eval` y estilos en línea.
 *
 * No incluye `upgrade-insecure-requests`: rompería las pruebas locales por http, y en producción
 * `Strict-Transport-Security` ya obliga a usar https.
 */
function contentSecurityPolicy(nonce: string | undefined): string {
  const scripts = nonce ? `'nonce-${nonce}' 'strict-dynamic'` : "'unsafe-inline'";
  const styles = nonce && !isDevelopment ? `'nonce-${nonce}'` : "'unsafe-inline'";
  return [
    "default-src 'self'",
    `script-src 'self' ${scripts}${isDevelopment ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' ${styles}`,
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

  // Enlaces antiguos con filtros en el listado: la búsqueda está en su propia ruta.
  if (CATALOG_LISTS.has(pathname) && query.size > 0) {
    return NextResponse.redirect(new URL(`${pathname}/buscar?${query}`, request.url), 308);
  }

  // Catálogo servido desde caché: la política va sin nonce, en la variante de la guía de Next sin nonce.
  if (isCachedCatalog(pathname)) {
    const response = NextResponse.next();
    response.headers.set("Content-Security-Policy", contentSecurityPolicy(undefined));
    response.headers.set("Cache-Control", CATALOG_CACHE_CONTROL);
    return response;
  }

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
