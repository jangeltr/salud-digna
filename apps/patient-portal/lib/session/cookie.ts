import "server-only";
import { cookies } from "next/headers";
import { SIGNED_IN_COOKIE, SIGNED_IN_VALUE } from "./indicator";

const isProduction = process.env.NODE_ENV === "production";

/** El prefijo __Host- exige Secure, Path=/ y ningún Domain, así que solo se usa en producción. */
export const SESSION_COOKIE = isProduction ? "__Host-portal-session" : "portal-session";

function cookieOptions(maxAge: number, httpOnly: boolean) {
  return {
    httpOnly,
    sameSite: "lax",
    path: "/",
    secure: isProduction,
    maxAge,
  } as const;
}

export async function readSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value || undefined;
}

/**
 * Escribe la cookie de sesión y, con la misma vida, la cookie indicadora que lee el encabezado.
 * Solo puede llamarse desde una acción de servidor o un manejador de ruta.
 */
export async function writeSessionCookie(token: string, maxAge: number): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, cookieOptions(maxAge, true));
  store.set(SIGNED_IN_COOKIE, SIGNED_IN_VALUE, cookieOptions(maxAge, false));
}

/**
 * Borra las dos cookies repitiendo sus atributos. Un borrado sin Secure sería rechazado
 * por el navegador cuando el nombre lleva el prefijo __Host-.
 */
export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", cookieOptions(0, true));
  store.set(SIGNED_IN_COOKIE, "", cookieOptions(0, false));
}
