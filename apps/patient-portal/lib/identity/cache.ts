import "server-only";
import { createHash } from "node:crypto";
import { failure, success } from "@/lib/domain/errors";
import { readSessionToken } from "@/lib/session/cookie";
import type { AssertionCache } from "@/lib/state/ports";
import type { AssertionIssuer, AssertionSource } from "./ports";

/** Nunca más de cinco minutos, aunque el emisor informe otra cosa. */
const MAX_TTL_MS = 5 * 60_000;
/** Se renueva antes de vencer, para que no caduque entre la lectura y la llamada al orquestador. */
const RENEW_MARGIN_MS = 30_000;

/**
 * Acreditaciones por sesión. La clave es el SHA-256 del token de sesión, con un prefijo propio:
 * la acreditación de una sesión nunca sirve a otra. Nada sale de la memoria del proceso.
 */
export function createAssertionSource(issuer: AssertionIssuer, cache: AssertionCache): AssertionSource {
  async function sessionKey(): Promise<string | undefined> {
    const token = await readSessionToken();
    return token ? createHash("sha256").update(`patient-assertion:${token}`).digest("base64url") : undefined;
  }

  async function issueFor(key: string) {
    const issued = await issuer.issue();
    if (!issued.ok) return issued;
    const now = Date.now();
    const expiresAt = Math.min(issued.data.expiresAt ?? now + MAX_TTL_MS, now + MAX_TTL_MS) - RENEW_MARGIN_MS;
    await cache.set(key, issued.data.assertion, expiresAt);
    return success({ assertion: issued.data.assertion, fresh: true });
  }

  return {
    async current() {
      const key = await sessionKey();
      if (!key) return failure("session");
      const known = await cache.get(key);
      return known ? success({ assertion: known, fresh: false }) : issueFor(key);
    },
    async renew() {
      const key = await sessionKey();
      if (!key) return failure("session");
      await cache.delete(key);
      return issueFor(key);
    },
    async forget() {
      const key = await sessionKey();
      if (key) await cache.delete(key);
    },
  };
}
