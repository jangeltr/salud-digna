import "server-only";
import { createHmac } from "node:crypto";
import { failure, success, type Result } from "@/lib/domain/errors";
import type { Patient } from "@/lib/domain/model";
import { Secret } from "@/lib/secret";
import type { AssertionIssuer } from "./ports";

/**
 * Emisor de prueba, solo para el orquestador simulado. No imita al emisor de la API central:
 * firma localmente con una clave compartida con el simulador un contenido propio de las pruebas,
 * `{ sub, channel, exp }`, donde `sub` es la cuenta que validó el servidor. `lib/composition.ts`
 * se niega a arrancarlo si algún servicio no es local.
 */
const TTL_SECONDS = 300;
const CHANNEL = "demo-web";

export function createSimulatorIssuer(currentPatient: () => Promise<Result<Patient>>, key: Secret): AssertionIssuer {
  return {
    async issue() {
      const patient = await currentPatient();
      if (!patient.ok) return patient.error.kind === "session" ? patient : failure("identity-unavailable");

      const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
      const payload = Buffer.from(JSON.stringify({ sub: patient.data.accountId, channel: CHANNEL, exp })).toString("base64url");
      const signature = createHmac("sha256", Buffer.from(key.reveal(), "base64url")).update(payload).digest("base64url");
      return success({ assertion: new Secret(`${payload}.${signature}`), expiresAt: exp * 1000 });
    },
  };
}
