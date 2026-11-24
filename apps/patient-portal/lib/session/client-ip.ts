import "server-only";
import { isIP } from "node:net";
import { headers } from "next/headers";

/**
 * Cabecera con la IP del cliente. El portal confía en ella porque la escribe el proxy inverso:
 * debe sobrescribir cualquier valor que mande el navegador, y el portal debe escuchar solo en
 * `127.0.0.1`, para que nadie más pueda presentarse como el proxy.
 */
export const CLIENT_IP_HEADER = "x-real-ip";

// En `globalThis` para avisar una sola vez por proceso, aunque Next cargue varias copias del módulo.
const WARNED = Symbol.for("salud-digna.patient-portal.client-ip-warned");
type Holder = { [WARNED]?: boolean };

function warnOnce(): void {
  const holder = globalThis as Holder;
  if (holder[WARNED]) return;
  holder[WARNED] = true;
  console.warn("[límites] la petición no trae la cabecera X-Real-IP del proxy: el límite por IP no se aplica");
}

/**
 * IP del cliente de la petición en curso, o `undefined` si el proxy no la envió o no es una IP.
 * Sin ella no hay límite por IP ni se reenvía nada a la API general: los demás límites siguen activos.
 * Nunca se usa otra cabecera del navegador, como `X-Forwarded-For`.
 */
export async function readClientIp(): Promise<string | undefined> {
  let value: string | null;
  try {
    value = (await headers()).get(CLIENT_IP_HEADER);
  } catch {
    // Fuera de una petición, como en la compilación.
    return undefined;
  }

  const ip = value?.trim();
  if (!ip || isIP(ip) === 0) {
    warnOnce();
    return undefined;
  }
  return ip;
}
