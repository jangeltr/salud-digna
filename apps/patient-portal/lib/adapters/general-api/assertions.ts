import "server-only";
import { failure, success } from "@/lib/domain/errors";
import { getAssertionChannelKey } from "@/lib/identity/config";
import type { AssertionIssuer } from "@/lib/identity/ports";
import { Secret } from "@/lib/secret";
import { readSessionToken } from "@/lib/session/cookie";
import { authorizedRequest } from "./authorized";
import { reportUnexpectedBody } from "./client";
import type { components } from "./schema";

type PatientAssertion = components["schemas"]["PatientAssertionDto"];

const JWS = /^[\w-]+\.([\w-]+)\.[\w-]+$/;

/**
 * Vencimiento del JWS, en milisegundos. El contrato declara su contenido legible y con `exp` en segundos Unix.
 * El portal no verifica la firma: eso le toca al orquestador. Solo lo lee para no guardarlo más de lo que vale.
 */
function readExpiry(assertion: string): number | undefined {
  const parts = JWS.exec(assertion);
  if (!parts) return undefined;
  try {
    const claims: unknown = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    const exp = claims && typeof claims === "object" ? (claims as { exp?: unknown }).exp : undefined;
    return typeof exp === "number" && Number.isSafeInteger(exp) ? exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Emisor de la API central: `POST /api/v1/auth/patient-assertions`, contrato en `docs/api-patient-assertions.md`.
 * Lleva la sesión del paciente y la credencial del canal Web en `X-Patient-Assertion-Channel-Key`, con el cuerpo `{}`.
 * El servidor construye la petición: no reenvía nada del navegador, tampoco `Origin`.
 *
 * Errores: sin sesión, `session`. Cualquier otro fallo es `identity-unavailable`: un `401` no distingue entre la
 * sesión y la credencial del canal, y la sesión ya se validó antes. El cliente registra el código, nunca la credencial
 * ni la acreditación.
 */
export const centralAssertionIssuer: AssertionIssuer = {
  async issue() {
    if (!(await readSessionToken())) return failure("session");

    const result = await authorizedRequest<PatientAssertion>({
      method: "POST",
      path: "/auth/patient-assertions",
      body: {},
      channelKey: getAssertionChannelKey(),
    });
    if (!result.ok) return failure("identity-unavailable");

    const assertion = result.data?.assertion;
    const expiresAt = typeof assertion === "string" ? readExpiry(assertion) : undefined;
    if (typeof assertion !== "string" || expiresAt === undefined) {
      reportUnexpectedBody("POST", "/auth/patient-assertions");
      return failure("identity-unavailable");
    }
    if (expiresAt <= Date.now()) return failure("identity-unavailable");
    return success({ assertion: new Secret(assertion), expiresAt });
  },
};
