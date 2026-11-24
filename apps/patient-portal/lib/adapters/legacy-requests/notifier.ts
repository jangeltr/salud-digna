import "server-only";
import { success, type Result } from "@/lib/domain/errors";
import type { Receipt, RequestEvent, RequestNotifier } from "@/lib/domain/ports";
import { authorizedRequest } from "../general-api/authorized";
import type { ApiPath, ApiResult } from "../general-api/client";
import { toFailure } from "../general-api/failures";
import type { components } from "../general-api/schema";
import type { Snapshot } from "./mapping";

type Schemas = components["schemas"];
type ExistingRequestEvent = Exclude<RequestEvent, { type: "request-started" }>;
type ContextChanges = Omit<Schemas["UpdateRequestContextDto"], "version">;

/** Las operaciones que devuelven el trámite informan su versión en el acuse. */
function receipt(result: ApiResult<Snapshot>): Result<Receipt> {
  return result.ok ? success({ requestId: result.data.id, version: result.data.version }) : toFailure(result);
}

/**
 * La API actual exige la versión en cada escritura. Si el evento no la trae,
 * se lee la vigente antes de escribir.
 */
async function withVersion(
  event: ExistingRequestEvent,
  write: (version: number) => Promise<Result<Receipt>>,
): Promise<Result<Receipt>> {
  if (event.expectedVersion !== undefined) return write(event.expectedVersion);

  const current = await authorizedRequest<Snapshot>({
    method: "GET",
    path: "/requests/{id}",
    params: { id: event.requestId },
  });
  return current.ok ? write(current.data.version) : toFailure(current);
}

function updateContext(event: ExistingRequestEvent, changes: ContextChanges): Promise<Result<Receipt>> {
  return withVersion(event, async (version) =>
    receipt(
      await authorizedRequest<Snapshot>({
        method: "PATCH",
        path: "/requests/{id}/context",
        params: { id: event.requestId },
        body: { version, ...changes },
      }),
    ),
  );
}

function transition(event: ExistingRequestEvent, path: ApiPath): Promise<Result<Receipt>> {
  return withVersion(event, async (version) =>
    receipt(
      await authorizedRequest<Snapshot>({ method: "POST", path, params: { id: event.requestId }, body: { version } }),
    ),
  );
}

/**
 * Notificación del trámite sobre las operaciones `/requests` de la API actual.
 * Cada evento de negocio se traduce a la operación que hoy lo registra.
 * `eventId` se acepta y se ignora: la API actual no tiene dónde recibirlo.
 */
export const legacyRequestNotifier: RequestNotifier = {
  async notify(event) {
    switch (event.type) {
      case "request-started":
        return receipt(await authorizedRequest<Snapshot>({ method: "POST", path: "/requests", body: {} }));

      case "study-chosen":
        return updateContext(event, { studyId: event.studyId });

      case "clinic-chosen":
        return updateContext(event, { clinicId: event.clinicId });

      case "slot-chosen":
        return updateContext(event, { scheduledAt: event.scheduledAt });

      case "note-saved":
        // El contrato pide enviar null para quitar la nota.
        return updateContext(event, { notes: event.note });

      case "request-paused":
        return transition(event, "/requests/{id}/pause");

      case "request-resumed":
        return transition(event, "/requests/{id}/resume");

      case "appointment-confirmed":
        // Un reintento compatible devuelve la misma cita. La respuesta es la cita, no el trámite.
        return withVersion(event, async (version) => {
          const result = await authorizedRequest<Schemas["AppointmentDto"]>({
            method: "POST",
            path: "/requests/{id}/confirm",
            params: { id: event.requestId },
            body: { version },
          });
          return result.ok ? success({ requestId: event.requestId }) : toFailure(result);
        });

      case "help-requested": {
        // Sin cuerpo ni versión. Cada llamada emite un código nuevo de un solo uso.
        const result = await authorizedRequest<Schemas["AssistanceCodeDto"]>({
          method: "POST",
          path: "/requests/{id}/assistance-code",
          params: { id: event.requestId },
        });
        if (!result.ok) return toFailure(result);
        const { code, expiresAt } = result.data;
        return success({ requestId: event.requestId, assistance: { code, expiresAt } });
      }
    }
  },
};
