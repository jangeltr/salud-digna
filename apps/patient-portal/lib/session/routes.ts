export const SIGN_IN_PATH = "/acceso";
export const DEFAULT_DESTINATION = "/mi-espacio";

/** Cabecera interna con la ruta solicitada. La escribe el proxy en cada petición. */
export const PATH_HEADER = "x-portal-path";

// Rutas de los grupos (account) y (booking). Los grupos no aparecen en la URL.
const PROTECTED_PREFIXES = ["/mi-espacio", "/continuar", "/citas", "/ayuda", "/perfil", "/tramite"];
const AUTH_PREFIXES = [SIGN_IN_PATH, "/registro"];

function matches(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function isProtectedPath(pathname: string): boolean {
  return matches(pathname, PROTECTED_PREFIXES);
}

/**
 * Devuelve un destino interno seguro para redirigir tras el acceso.
 * Rechaza lo que no empiece por "/" y lo que empiece por "//".
 */
export function safeDestination(value: unknown, fallback = DEFAULT_DESTINATION): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  // Los navegadores tratan "\" como "/", y los caracteres de control permiten ocultar el destino.
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return fallback;

  let url: URL;
  try {
    url = new URL(value, "http://portal.invalid");
  } catch {
    return fallback;
  }
  if (url.origin !== "http://portal.invalid") return fallback;
  if (matches(url.pathname, AUTH_PREFIXES) || url.pathname.startsWith("/api/")) return fallback;

  return url.pathname + url.search;
}

export function signInUrl(destination?: string): string {
  const safe = safeDestination(destination);
  return `${SIGN_IN_PATH}?destino=${encodeURIComponent(safe)}`;
}
