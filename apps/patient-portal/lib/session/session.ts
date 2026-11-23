import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getMe, type Account } from "@/lib/api/auth";
import { readSessionToken } from "./cookie";
import { DEFAULT_DESTINATION, PATH_HEADER, safeDestination, signInUrl } from "./routes";

export type Session =
  | { status: "anonymous" }
  | { status: "authenticated"; account: Account }
  | { status: "expired" }
  | { status: "unavailable" };

/** Indica si el navegador envió la cookie. No comprueba su validez ni llama a la API. */
export async function hasSessionCookie(): Promise<boolean> {
  return (await readSessionToken()) !== undefined;
}

/**
 * Comprueba la sesión con GET /auth/me. El token nunca se decodifica en el portal.
 * `cache` evita repetir la llamada dentro de un mismo renderizado.
 */
export const getSession = cache(async (): Promise<Session> => {
  const token = await readSessionToken();
  if (!token) return { status: "anonymous" };

  const result = await getMe(token);
  if (result.ok) return { status: "authenticated", account: result.data };
  if (result.status === 401) return { status: "expired" };
  return { status: "unavailable" };
});

async function requestedPath(): Promise<string> {
  return safeDestination((await headers()).get(PATH_HEADER), DEFAULT_DESTINATION);
}

/**
 * Lleva al flujo de sesión vencida. Un Server Component no puede borrar cookies:
 * lo hace el manejador de /api/session/expired antes de ir a /acceso.
 */
export async function expireSession(): Promise<never> {
  const destination = await requestedPath();
  redirect(`/api/session/expired?destino=${encodeURIComponent(destination)}`);
}

/**
 * Exige una sesión válida para renderizar una página protegida.
 * Devuelve null cuando la API no responde, para que la página muestre el aviso de servicio.
 */
export async function requireAccount(): Promise<Account | null> {
  const session = await getSession();
  if (session.status === "authenticated") return session.account;
  if (session.status === "unavailable") return null;
  if (session.status === "expired") await expireSession();

  redirect(signInUrl(await requestedPath()));
}

/** Como `requireAccount`, y además entrega el token para las llamadas de datos de la página. */
export async function requireSession(): Promise<{ account: Account; token: string } | null> {
  const account = await requireAccount();
  if (!account) return null;

  const token = await readSessionToken();
  if (!token) redirect(signInUrl(await requestedPath()));
  return { account, token };
}
