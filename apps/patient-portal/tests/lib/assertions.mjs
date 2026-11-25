// Acreditaciones de prueba con la forma del contrato (`docs/api-patient-assertions.md`): JWS de tres partes con
// `channel`, `customerId`, `sub`, `jti`, `iat` y `exp`. Las firma y verifica un HMAC con una clave de la ejecución,
// compartida solo entre la API general simulada y el orquestador simulado. No sirven fuera de las pruebas.
import { createHmac, randomUUID } from "node:crypto";
import { assertionKey } from "./secrets.mjs";

const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const sign = (input) => createHmac("sha256", Buffer.from(assertionKey(), "base64url")).update(input).digest("base64url");

export function mintAssertion({ channel, customerId, sub = randomUUID(), ttlSeconds = 300 }) {
  const iat = Math.floor(Date.now() / 1000);
  const input = `${encode({ alg: "HS256", typ: "sd-patient+jwt" })}.${encode({ channel, customerId, sub, jti: randomUUID(), iat, exp: iat + ttlSeconds })}`;
  return `${input}.${sign(input)}`;
}

/** Contenido de una acreditación válida y vigente, o null. */
export function verifyAssertion(raw) {
  if (typeof raw !== "string") return null;
  const parts = raw.split(".");
  if (parts.length !== 3 || sign(`${parts[0]}.${parts[1]}`) !== parts[2]) return null;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (typeof claims.channel !== "string" || typeof claims.customerId !== "string" || !(claims.exp > Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}
