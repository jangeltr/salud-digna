import "server-only";
import { failure } from "@/lib/domain/errors";
import type { AssertionIssuer } from "@/lib/identity/ports";

/**
 * Emisor de la API central, pendiente. El contrato prevé `POST /api/v1/auth/patient-assertions`,
 * con respuesta `{ "assertion": "<JWS>" }` y una vigencia máxima de cinco minutos, pero su forma de
 * autenticación y de solicitud aún no está definida. Hasta entonces no se inventa ninguna cabecera,
 * credencial ni cuerpo: toda acreditación falla con `identity-unavailable`.
 *
 * Al llegar el contrato, este archivo es el único que cambia: hará la llamada con `authorizedRequest`
 * o con la credencial que el contrato indique, y devolverá la acreditación envuelta en `Secret`.
 */
export const pendingAssertionIssuer: AssertionIssuer = {
  async issue() {
    return failure("identity-unavailable");
  },
};
