import "server-only";
import { createHash } from "node:crypto";
import { failure, success, type Failure, type Result } from "@/lib/domain/errors";
import type { Receipt, RequestEvent, RequestNotifier } from "@/lib/domain/ports";
import {
  callWithGrant,
  closeQuietly,
  readVersion,
  reportRegistryFailure,
  resolveAccess,
  withAssertion,
  type OrchestratorDependencies,
} from "./access";
import { orchestratorRequest, reportConflictWithoutVersionChange, reportUnexpectedBody, type OrchestratorResult } from "./client";
import { isUncertain, toCreationFailure, toFailure, toIdentifiedFailure, toRedeemFailure } from "./failures";
import { normalizeContinuityCode, readContinuityCode, readCreatedJourney, readRedeemedJourney } from "./mapping";

type OnRequestEvent = Exclude<RequestEvent, { type: "request-started" | "continuity-redeemed" }>;
type JourneyEventType = "JOURNEY_CONTEXT_UPDATED" | "JOURNEY_STATUS_CHANGED";

// Formato de `externalEventId` en journey-writes.md. El prefijo `system:` está reservado.
const EXTERNAL_EVENT_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;

/** Una referencia que no está en el catálogo no se publica. Si el catálogo no responde, tampoco. */
function catalogFailure(result: Result<unknown>): Failure | undefined {
  if (result.ok) return undefined;
  const { kind } = result.error;
  return kind === "not-found" || kind === "invalid" ? failure("invalid") : failure("unavailable");
}

/** Si el registro no se puede leer, no se crea ni se adopta nada: el trámite quedaría sin dueño conocido. */
async function registryIsReadable(deps: OrchestratorDependencies, accountId: string): Promise<boolean> {
  try {
    await deps.registry.list(accountId);
    return true;
  } catch {
    reportRegistryFailure("leer");
    return false;
  }
}

/**
 * Clave de idempotencia de una creación: 32 bytes en base64url, como exige `Idempotency-Key`.
 * Se deriva del identificador del evento, que la acción genera al azar.
 */
function creationKey(eventId: string): string {
  return createHash("sha256").update(`request-started:${eventId}`).digest("base64url");
}

/**
 * Creaciones con resultado incierto, por paciente. Mientras el permiso inicial pueda seguir vigente,
 * el siguiente intento del paciente reutiliza la misma clave: si el trámite llegó a crearse,
 * el orquestador devuelve ese mismo y no hay duplicado.
 */
const PENDING_CREATION_MS = 5 * 60_000;

/**
 * `request-started`: `POST /journeys` con su `Idempotency-Key`. El permiso que devuelve se guarda
 * en memoria y el trámite se anota en el registro del paciente.
 *
 * Con un resultado incierto se reenvía una vez la misma petición con la misma clave. Si sigue
 * incierto, la clave queda pendiente para el siguiente intento del paciente.
 */
async function start(deps: OrchestratorDependencies, eventId: string): Promise<Result<Receipt>> {
  const patient = await deps.currentPatient();
  if (!patient.ok) return patient;
  const { accountId } = patient.data;

  const identified = deps.identityMode === "assertion";
  // Nada se envió todavía: el fallo es seguro. En modo `assertion` el registro no se usa.
  if (!identified && !(await registryIsReadable(deps, accountId))) return failure("rejected");

  const pendingKey = await deps.pendingCreations.get(accountId);
  const request = {
    method: "POST",
    path: "/journeys",
    idempotencyKey: pendingKey ?? creationKey(eventId),
    body: JSON.stringify({ type: "APPOINTMENT" }),
  } as const;

  // En modo `assertion` cada envío lleva la acreditación. Si no se obtiene, no se envía nada:
  // nunca se crea un trámite anónimo en su lugar. El reenvío conserva la clave de idempotencia.
  const send = async (): Promise<Result<OrchestratorResult>> =>
    identified
      ? withAssertion(deps, (assertion) => orchestratorRequest({ ...request, assertion }), { renewOnRejection: true })
      : success(await orchestratorRequest(request));

  const first = await send();
  if (!first.ok) return first.error.kind === "session" ? first : failure("identity-unavailable");
  let created = first.data;
  let repeated = pendingKey !== undefined;
  if (!created.ok && isUncertain(created)) {
    const again = await send();
    if (!again.ok) return again.error.kind === "session" ? again : failure("identity-unavailable");
    created = again.data;
    repeated = true;
  }

  if (!created.ok) {
    if (isUncertain(created)) await deps.pendingCreations.set(accountId, request.idempotencyKey, PENDING_CREATION_MS);
    return identified ? toIdentifiedFailure(created, true) : toCreationFailure(created);
  }
  await deps.pendingCreations.delete(accountId);

  const journey = readCreatedJourney(created.data);
  if (!journey) {
    reportUnexpectedBody("POST", "/journeys");
    return failure("unavailable");
  }

  // Un reintento tardío puede llegar sin permiso: el trámite se anota igual y pedirá un permiso nuevo.
  if (journey.access) await deps.grants.save(accountId, journey.id, journey.access.grant, journey.access.expiresAt);
  // En modo `assertion` el trámite queda asociado al paciente en el orquestador: no hay nada que anotar.
  if (identified) return success(repeated ? { requestId: journey.id } : { requestId: journey.id, version: 1 });
  try {
    await deps.registry.add(accountId, journey.id, new Date().toISOString());
  } catch {
    reportRegistryFailure("escribir");
    await deps.grants.drop(accountId, journey.id);
    return failure("unavailable");
  }

  // El contrato crea el contexto en la versión 1. Tras un reintento no se da por sabida:
  // la respuesta repite el estado inicial aunque el trámite haya avanzado.
  return success(repeated ? { requestId: journey.id } : { requestId: journey.id, version: 1 });
}

/**
 * Publica un avance con `POST /events`. El `eventId` viaja como `externalEventId`.
 * `validate` se ejecuta después de comprobar que el trámite es del paciente.
 */
async function publish(
  deps: OrchestratorDependencies,
  event: OnRequestEvent,
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
    const current = await readVersion(deps, access);
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

  let result = await callWithGrant(deps, access, request);
  // Tiempo de espera agotado: un único reenvío idéntico. Si el primero llegó a aplicarse,
  // el orquestador lo reconoce por el identificador y devuelve el mismo resultado.
  if (!result.ok && result.timedOut) result = await callWithGrant(deps, access, request);

  if (result.ok) {
    if (type === "JOURNEY_STATUS_CHANGED" && changes.to === "CANCELLED") await closeQuietly(deps, access);
    // La respuesta trae el identificador del evento, no la versión nueva.
    return success({ requestId: access.requestId });
  }

  if (result.status === 409) {
    // El contrato pide consultar el contexto tras un conflicto, antes de enviar otro evento.
    // Si la versión no cambió, el conflicto no fue por versión obsoleta: queda constancia en el registro.
    const current = await readVersion(deps, access);
    if (current.ok && current.data === expectedVersion) reportConflictWithoutVersionChange();
  }
  return toFailure(result);
}

/**
 * `continuity-requested`: `POST /journeys/:journeyId/continuity-codes`, sin cuerpo.
 * Sin reenvío: si la respuesta se pierde, el contrato pide solicitar otro código.
 * El código no se guarda: viaja en el acuse hasta la pantalla y desaparece.
 */
async function issueContinuityCode(deps: OrchestratorDependencies, requestId: string): Promise<Result<Receipt>> {
  const resolved = await resolveAccess(deps, requestId);
  if (!resolved.ok) return resolved;

  const result = await callWithGrant(deps, resolved.data, { method: "POST", path: "/journeys/:journeyId/continuity-codes" });
  if (!result.ok) return toFailure(result);

  const continuity = readContinuityCode(result.data);
  if (!continuity) {
    reportUnexpectedBody("POST", "/journeys/:journeyId/continuity-codes");
    return failure("unavailable");
  }
  return success({ requestId: resolved.data.requestId, continuity });
}

/**
 * `continuity-redeemed`: `POST /continuity-codes/redeem`. El trámite pasa al registro del paciente
 * de la sesión y el permiso queda solo en memoria.
 *
 * El código es la autorización: no prueba la identidad de quien lo trae. Sin reenvío, porque
 * si la respuesta se pierde el código ya quedó consumido.
 */
async function redeemContinuityCode(deps: OrchestratorDependencies, typed: string): Promise<Result<Receipt>> {
  const patient = await deps.currentPatient();
  if (!patient.ok) return patient;
  const { accountId } = patient.data;

  // Un texto sin forma de código no llega al orquestador, que cuenta cada intento de canje del canal.
  const code = normalizeContinuityCode(typed);
  if (!code) return failure("invalid");
  const identified = deps.identityMode === "assertion";
  if (!identified && !(await registryIsReadable(deps, accountId))) return failure("rejected");

  const result = await orchestratorRequest({
    method: "POST",
    path: "/continuity-codes/redeem",
    body: JSON.stringify({ code }),
  });
  if (!result.ok) return toRedeemFailure(result);

  const journey = readRedeemedJourney(result.data);
  if (!journey) {
    reportUnexpectedBody("POST", "/continuity-codes/redeem");
    return failure("unavailable");
  }

  await deps.grants.save(accountId, journey.id, journey.access.grant, journey.access.expiresAt);
  if (identified) return success({ requestId: journey.id });
  try {
    await deps.registry.add(accountId, journey.id, new Date().toISOString());
  } catch {
    reportRegistryFailure("escribir");
    await deps.grants.drop(accountId, journey.id);
    return failure("unavailable");
  }
  return success({ requestId: journey.id });
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

        case "continuity-requested":
          return issueContinuityCode(deps, event.requestId);

        case "continuity-redeemed":
          return redeemContinuityCode(deps, event.code);

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
