import "server-only";
import { createHash } from "node:crypto";
import { failure, success, type Failure, type Result } from "@/lib/domain/errors";
import type { Receipt, RequestEvent, RequestNotifier } from "@/lib/domain/ports";
import {
  callWithGrant,
  closeQuietly,
  readVersion,
  resolveAccess,
  type OrchestratorDependencies,
} from "./access";
import { orchestratorRequest, reportConflictWithoutVersionChange, reportUnexpectedBody } from "./client";
import { toCreationFailure, toFailure } from "./failures";
import { dropGrant, saveGrant } from "./grants";
import { readCreatedJourney } from "./mapping";
import { listRegistered, register, reportRegistryFailure } from "./registry";

type ExistingRequestEvent = Exclude<RequestEvent, { type: "request-started" }>;
type JourneyEventType = "JOURNEY_CONTEXT_UPDATED" | "JOURNEY_STATUS_CHANGED";

// Formato de `externalEventId` en journey-writes.md. El prefijo `system:` está reservado.
const EXTERNAL_EVENT_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;

/** Una referencia que no está en el catálogo no se publica. Si el catálogo no responde, tampoco. */
function catalogFailure(result: Result<unknown>): Failure | undefined {
  if (result.ok) return undefined;
  const { kind } = result.error;
  return kind === "not-found" || kind === "invalid" ? failure("invalid") : failure("unavailable");
}

/**
 * Clave de idempotencia de una creación: 32 bytes en base64url, como exige `Idempotency-Key`.
 * Se deriva del identificador del evento, que la acción genera al azar: el mismo evento lleva
 * siempre la misma clave, y un trámite nuevo lleva otra.
 */
function creationKey(eventId: string): string {
  return createHash("sha256").update(`request-started:${eventId}`).digest("base64url");
}

/**
 * `request-started`: `POST /journeys`. El permiso que devuelve se guarda en memoria y el trámite
 * se anota en el registro del paciente. El `eventId` viaja como clave de idempotencia.
 *
 * Sin reintento automático, por decisión del propietario del portal: si la respuesta se pierde,
 * se informa al paciente. Con la clave de idempotencia, reenviar el mismo evento sería seguro.
 */
async function start(deps: OrchestratorDependencies, eventId: string): Promise<Result<Receipt>> {
  const patient = await deps.currentPatient();
  if (!patient.ok) return patient;
  const { accountId } = patient.data;

  // Si el registro no se puede leer, no se crea nada: el trámite quedaría sin dueño conocido.
  try {
    await listRegistered(accountId);
  } catch {
    reportRegistryFailure("leer");
    return failure("rejected");
  }

  const created = await orchestratorRequest({
    method: "POST",
    path: "/journeys",
    idempotencyKey: creationKey(eventId),
    body: JSON.stringify({ type: "APPOINTMENT" }),
  });
  if (!created.ok) return toCreationFailure(created);

  const journey = readCreatedJourney(created.data);
  if (!journey) {
    reportUnexpectedBody("POST", "/journeys");
    return failure("unavailable");
  }

  saveGrant(accountId, journey.id, journey.grant, journey.grantExpiresAt);
  try {
    await register(accountId, journey.id, new Date().toISOString());
  } catch {
    reportRegistryFailure("escribir");
    dropGrant(accountId, journey.id);
    return failure("unavailable");
  }

  // El contrato crea el contexto en la versión 1.
  return success({ requestId: journey.id, version: 1 });
}

/**
 * Publica un avance con `POST /events`. El `eventId` viaja como `externalEventId`.
 * `validate` se ejecuta después de comprobar que el trámite es del paciente.
 */
async function publish(
  deps: OrchestratorDependencies,
  event: ExistingRequestEvent,
  type: JourneyEventType,
  changes: Record<string, string>,
  validate?: () => Promise<Failure | undefined>,
): Promise<Result<Receipt>> {
  if (!EXTERNAL_EVENT_ID.test(event.eventId) || event.eventId.startsWith("system:")) return failure("invalid");

  const resolved = await resolveAccess(deps, event.requestId);
  if (!resolved.ok) return resolved;
  const access = resolved.data;

  const invalid = await validate?.();
  if (invalid) return invalid;

  // El orquestador exige la versión esperada. Si el evento no la trae, se lee antes la vigente.
  let expectedVersion = event.expectedVersion;
  if (expectedVersion === undefined) {
    const current = await readVersion(access);
    if (!current.ok) return current;
    expectedVersion = current.data;
  }

  // Se serializa una sola vez: el reenvío debe ser idéntico, también en `occurredAt`.
  const body = JSON.stringify({
    journeyId: access.requestId,
    externalEventId: event.eventId,
    type,
    schemaVersion: 1,
    // UTC con milisegundos, como pide el contrato.
    occurredAt: new Date().toISOString(),
    payload: { expectedVersion, ...changes },
  });
  const request = { method: "POST", path: "/events", body } as const;

  let result = await callWithGrant(access, request);
  // Tiempo de espera agotado: un único reenvío idéntico. Si el primero llegó a aplicarse,
  // el orquestador lo reconoce por el identificador y devuelve el mismo resultado.
  if (!result.ok && result.timedOut) result = await callWithGrant(access, request);

  if (result.ok) {
    if (type === "JOURNEY_STATUS_CHANGED" && changes.to === "CANCELLED") await closeQuietly(access);
    // La respuesta trae el identificador del evento, no la versión nueva.
    return success({ requestId: access.requestId });
  }

  if (result.status === 409) {
    // El contrato pide consultar el contexto tras un conflicto, antes de enviar otro evento.
    // Si la versión no cambió, el conflicto no fue por versión obsoleta: queda constancia en el registro.
    const current = await readVersion(access);
    if (current.ok && current.data === expectedVersion) reportConflictWithoutVersionChange();
  }
  return toFailure(result);
}

/**
 * Notificación del trámite sobre el orquestador. Cada evento de negocio se traduce a la llamada
 * que hoy lo registra. Lo que el contrato no cubre devuelve `rejected` sin llamar a ningún servicio.
 */
export function createOrchestratorNotifier(deps: OrchestratorDependencies): RequestNotifier {
  return {
    async notify(event) {
      switch (event.type) {
        case "request-started":
          return start(deps, event.eventId);

        case "study-chosen":
          return publish(deps, event, "JOURNEY_CONTEXT_UPDATED", { studyId: event.studyId }, async () =>
            catalogFailure(await deps.getStudy(event.studyId)),
          );

        case "clinic-chosen":
          return publish(deps, event, "JOURNEY_CONTEXT_UPDATED", { clinicId: event.clinicId }, async () =>
            catalogFailure(await deps.getClinic(event.clinicId)),
          );

        case "confirmation-requested":
          return publish(deps, event, "JOURNEY_STATUS_CHANGED", { to: "PENDING_CONFIRMATION" });

        case "request-cancelled":
          return publish(deps, event, "JOURNEY_STATUS_CHANGED", { to: "CANCELLED" });

        case "slot-chosen":
        case "note-saved":
        case "request-paused":
        case "request-resumed":
        case "appointment-confirmed":
        case "help-requested":
          // Sin equivalente en el contrato del orquestador. Ver `capabilities.ts`.
          return failure("rejected");
      }
    },
  };
}
