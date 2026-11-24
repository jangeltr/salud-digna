import "server-only";
import { cookies } from "next/headers";

const isProduction = process.env.NODE_ENV === "production";

/** El prefijo __Host- exige Secure, Path=/ y ningún Domain, así que solo se usa en producción. */
export const SESSION_COOKIE = isProduction ? "__Host-portal-session" : "portal-session";

function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: isProduction,
    maxAge,
  } as const;
}

export async function readSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value || undefined;
}

/** Solo puede llamarse desde una acción de servidor o un manejador de ruta. */
export async function writeSessionCookie(token: string, maxAge: number): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(maxAge));
}

/**
 * Borra la cookie repitiendo sus atributos. Un borrado sin Secure sería rechazado
 * por el navegador cuando el nombre lleva el prefijo __Host-.
 */
export async function clearSessionCookie(): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, "", sessionCookieOptions(0));
}
