/**
 * Cookie indicadora de sesión. Solo dice «hay una sesión abierta en este navegador» con el valor `1`:
 * no contiene el token, ni el paciente, ni ningún identificador. No es `HttpOnly`, porque la lee
 * el encabezado en el navegador para elegir entre «Acceso» y «Mi espacio» en las páginas que se
 * sirven desde caché, iguales para todos.
 *
 * Nunca autoriza nada: las rutas protegidas siguen validando la cookie de sesión en el servidor.
 * Se escribe y se borra junto con la cookie de sesión, en `cookie.ts`, y vence con ella.
 *
 * Este módulo no lleva `server-only`: lo importan el servidor y el navegador.
 */
const isProduction = process.env.NODE_ENV === "production";

/** El prefijo __Host- exige Secure, Path=/ y ningún Domain, así que solo se usa en producción. */
export const SIGNED_IN_COOKIE = isProduction ? "__Host-portal-signed-in" : "portal-signed-in";

export const SIGNED_IN_VALUE = "1";

/** Lee la cookie indicadora de una cabecera `Cookie` o de `document.cookie`. */
export function hasSignedInCookie(cookieHeader: string): boolean {
  return cookieHeader.split(";").some((part) => part.trim() === `${SIGNED_IN_COOKIE}=${SIGNED_IN_VALUE}`);
}
