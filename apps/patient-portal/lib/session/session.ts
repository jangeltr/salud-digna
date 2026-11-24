import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { generalData } from "@/lib/composition";
import type { Patient } from "@/lib/domain/model";
import { readSessionToken } from "./cookie";
import { DEFAULT_DESTINATION, PATH_HEADER, safeDestination, signInUrl } from "./routes";

export type Session =
  | { status: "anonymous" }
  | { status: "authenticated"; patient: Patient }
  | { status: "expired" }
  | { status: "unavailable" };

/** Indica si el navegador envió la cookie. No comprueba su validez ni llama a ningún servicio. */
export async function hasSessionCookie(): Promise<boolean> {
  return (await readSessionToken()) !== undefined;
}

/**
 * Comprueba la sesión pidiendo el perfil del paciente. El token nunca se decodifica en el portal.
 * `cache` evita repetir la llamada dentro de un mismo renderizado.
 */
export const getSession = cache(async (): Promise<Session> => {
  if (!(await hasSessionCookie())) return { status: "anonymous" };

  const result = await generalData.getProfile();
  if (result.ok) return { status: "authenticated", patient: result.data };
  if (result.error.kind === "session") return { status: "expired" };
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
 * Exige una sesión válida para renderizar una página protegida y devuelve el paciente.
 * Devuelve null cuando el servicio no responde, para que la página muestre el aviso de servicio.
 */
export async function requireAccount(): Promise<Patient | null> {
  const session = await getSession();
  if (session.status === "authenticated") return session.patient;
  if (session.status === "unavailable") return null;
  if (session.status === "expired") await expireSession();

  redirect(signInUrl(await requestedPath()));
}
