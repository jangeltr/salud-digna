// Credenciales sintéticas de las pruebas. Todas se derivan de TEST_RUN_SECRET, un valor aleatorio que el lanzador
// genera en cada ejecución y que nunca se escribe en disco ni en la salida. Los simuladores y las suites las
// calculan igual, sin compartir archivos. Ninguna sirve fuera de los servicios simulados.
import { createHmac } from "node:crypto";

function seed() {
  const value = process.env.TEST_RUN_SECRET;
  if (!value) throw new Error("Falta TEST_RUN_SECRET: ejecuta las pruebas con «pnpm test» o «node tests/run.mjs».");
  return value;
}

/** 32 bytes en base64url, sin relleno: 43 caracteres. */
export function secretOf(label) {
  return createHmac("sha256", seed()).update(label).digest("base64url");
}

/** Contraseña de las cuentas de prueba del simulador de la API general. */
export function testPassword() {
  return `prueba-${secretOf("contrasena").slice(0, 20)}`;
}

/** Token de sesión que el simulador entrega a cada cuenta de prueba: `ana`, `beto` o `carla`. */
export function testToken(name) {
  return `prueba-token-${name}-${secretOf(`token:${name}`).slice(0, 24)}`;
}

/** Clave con la que la API general simulada firma las acreditaciones y el orquestador simulado las verifica. */
export function assertionKey() {
  return secretOf("emisor-de-acreditaciones");
}

/** Credencial del canal Web ante el emisor de acreditaciones: `PATIENT_ASSERTION_CHANNEL_KEY` del portal bajo prueba. */
export function assertionChannelKey() {
  return secretOf("emisor:canal-web");
}

/** Claves de canal del orquestador simulado: `<keyId>.<secreto>`. */
export const CHANNEL_KEY_IDS = {
  web: "11111111-1111-4111-8111-111111111111",
  publishOnly: "22222222-2222-4222-8222-222222222222",
  expired: "33333333-3333-4333-8333-333333333333",
  otherChannel: "44444444-4444-4444-8444-444444444444",
};

export function channelKey(name) {
  return `${CHANNEL_KEY_IDS[name]}.${secretOf(`canal:${name}`)}`;
}
