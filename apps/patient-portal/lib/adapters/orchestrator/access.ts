import "server-only";
import { failure, success, type Result } from "@/lib/domain/errors";
import type { BookingRequest, Clinic, Patient, Study } from "@/lib/domain/model";
import type { AssertionSource, CurrentAssertion } from "@/lib/identity/ports";
import type { Secret } from "@/lib/secret";
import type { GrantStore, PendingCreationStore, RequestRegistry } from "@/lib/state/ports";
import {
  orchestratorRequest,
  reportUnexpectedBody,
  type OrchestratorRequest,
  type OrchestratorResult,
} from "./client";
import { getChannelKey, getOrchestratorBaseUrl } from "./config";
import { toFailure } from "./failures";
import { readAccessGrant, readContextVersion, toBookingRequest } from "./mapping";

/** Lo que el adaptador necesita de la API general, de la identidad y de los almacenes. Lo entrega `lib/composition.ts`. */
export type OrchestratorDependencies = {
  /**
   * Paciente de la sesión actual. El orquestador no conoce la sesión del portal:
   * comprobarla antes de cada operación es responsabilidad del portal.
   */
  currentPatient(): Promise<Result<Patient>>;
  /** Catálogo. El orquestador guarda referencias opacas y no comprueba que existan. */
  getStudy(id: string): Promise<Result<Study>>;
  getClinic(id: string): Promise<Result<Clinic>>;
  /**
   * `none`: la pertenencia de cada trámite la decide el registro del canal Web.
   * `assertion`: la decide el orquestador con la acreditación institucional del paciente; el registro no se usa.
   */
  identityMode: "none" | "assertion";
  /** Acreditación de la sesión actual. Solo se usa en modo `assertion`. */
  assertions: AssertionSource;
  /** Qué trámites tiene cada cuenta. Solo en modo `none`. */
  registry: RequestRegistry;
  /** Permisos de trámite, solo en memoria. */
  grants: GrantStore;
  /** Claves de creaciones con resultado incierto. */
  pendingCreations: PendingCreationStore;
};

// El registro de errores nombra la operación y nunca incluye identificadores ni rutas con datos del paciente.
export function reportRegistryFailure(operation: "leer" | "escribir"): void {
  console.error(`[registro] no se pudo ${operation} el registro del canal Web`);
}

/**
 * Trámite del paciente de la sesión con un permiso vigente.
 * `fresh` indica que el permiso se acaba de pedir: si el orquestador lo rechaza, no se vuelve a pedir.
 */
export type Access = { accountId: string; requestId: string; grant: Secret; fresh: boolean };

/**
 * Llamada que lleva la acreditación del paciente. Un fallo al obtenerla corta la operación:
 * nunca se llama sin acreditación.
 *
 * Con `renewOnRejection`, si el orquestador responde `404` a una acreditación guardada, se pide otra y se
 * repite una sola vez. Solo en la creación y el listado, donde el `404` significa que rechazó la
 * acreditación. En `access-grants` también cubre el trámite ajeno: repetir doblaría las llamadas de quien
 * pruebe identificadores.
 */
export async function withAssertion(
  deps: OrchestratorDependencies,
  call: (assertion: Secret) => Promise<OrchestratorResult>,
  { renewOnRejection }: { renewOnRejection: boolean },
): Promise<Result<OrchestratorResult>> {
  const first = await deps.assertions.current();
  if (!first.ok) return first;
  const result = await call(first.data.assertion);
  if (!renewOnRejection || result.ok || result.status !== 404 || first.data.fresh) return success(result);

  const renewed: Result<CurrentAssertion> = await deps.assertions.renew();
  if (!renewed.ok) return renewed;
  return success(await call(renewed.data.assertion));
}

/**
 * Pide un permiso para el trámite con `POST /journeys/:journeyId/access-grants`. Es la comprobación
 * de pertenencia del modo `assertion`: el orquestador solo lo concede si el trámite es del paciente
 * acreditado. Un `404` es «no encontrado», igual para un trámite ajeno que para uno inexistente.
 */
async function requestGrant(deps: OrchestratorDependencies, accountId: string, requestId: string): Promise<Result<Access>> {
  const asked = await withAssertion(deps, (assertion) =>
    orchestratorRequest({ method: "POST", path: "/journeys/:journeyId/access-grants", journeyId: requestId, assertion }),
    { renewOnRejection: false },
  );
  if (!asked.ok) return asked;
  const result = asked.data;
  if (!result.ok) return result.status === 404 ? failure("not-found") : toFailure(result);

  const granted = readAccessGrant(result.data, requestId);
  if (!granted) {
    reportUnexpectedBody("POST", "/journeys/:journeyId/access-grants");
    return failure("unavailable");
  }
  await deps.grants.save(accountId, requestId, granted.grant, granted.expiresAt);
  return success({ accountId, requestId, grant: granted.grant, fresh: true });
}

/**
 * Comprobación previa a cualquier lectura o escritura de un trámite.
 *
 * - Modo `none`: si el registro no lo atribuye al paciente, responde «no encontrado» sin llamar al
 *   orquestador. Si es suyo pero no hay permiso vigente en memoria, responde `access-expired`.
 * - Modo `assertion`: usa el permiso guardado para esta cuenta, que solo pudo obtenerse con su
 *   acreditación o con un código; si no hay, lo pide con la acreditación de esta sesión.
 *   Un identificador de trámite del navegador nunca se usa sin ese paso.
 */
export async function resolveAccess(deps: OrchestratorDependencies, requestId: string): Promise<Result<Access>> {
  const patient = await deps.currentPatient();
  if (!patient.ok) return patient;

  const { accountId } = patient.data;
  const id = requestId.toLowerCase();

  if (deps.identityMode === "assertion") {
    const grant = await deps.grants.find(accountId, id);
    return grant ? success({ accountId, requestId: id, grant, fresh: false }) : requestGrant(deps, accountId, id);
  }

  let owned: boolean;
  try {
    owned = await deps.registry.has(accountId, id);
  } catch {
    reportRegistryFailure("leer");
    return failure("unavailable");
  }
  if (!owned) return failure("not-found");

  const grant = await deps.grants.find(accountId, id);
  if (!grant) return failure("access-expired");
  return success({ accountId, requestId: id, grant, fresh: false });
}

/**
 * Llamada al orquestador con el permiso del trámite. Si lo rechaza, el permiso se olvida.
 * En modo `assertion` se pide otro y se repite una sola vez, salvo que el rechazado fuera recién pedido.
 */
export async function callWithGrant(
  deps: OrchestratorDependencies,
  access: Access,
  request: Omit<OrchestratorRequest, "grant" | "journeyId">,
): Promise<OrchestratorResult> {
  const result = await orchestratorRequest({ ...request, journeyId: access.requestId, grant: access.grant });
  if (result.ok || result.status !== 404) return result;

  await deps.grants.drop(access.accountId, access.requestId);
  if (deps.identityMode !== "assertion" || access.fresh) return result;

  const renewed = await requestGrant(deps, access.accountId, access.requestId);
  if (!renewed.ok) return result;
  Object.assign(access, renewed.data);
  return orchestratorRequest({ ...request, journeyId: access.requestId, grant: access.grant });
}

/** Anota el cierre en el registro, solo en modo `none`. Si falla, se volverá a intentar en otra lectura. */
export async function closeQuietly(deps: OrchestratorDependencies, { accountId, requestId }: Access): Promise<void> {
  if (deps.identityMode === "assertion") return;
  try {
    await deps.registry.markClosed(accountId, requestId, new Date().toISOString());
  } catch {
    reportRegistryFailure("escribir");
  }
}

/** Versión vigente del contexto. */
export async function readVersion(deps: OrchestratorDependencies, access: Access): Promise<Result<number>> {
  const context = await callWithGrant(deps, access, { method: "GET", path: "/journeys/:journeyId/context" });
  if (!context.ok) return toFailure(context);

  const version = readContextVersion(context.data);
  if (version === undefined) {
    reportUnexpectedBody("GET", "/journeys/:journeyId/context");
    return failure("unavailable");
  }
  return success(version);
}

/**
 * Último estado registrado del trámite. El orquestador lo reparte en dos consultas, estado y contexto,
 * que no son atómicas entre sí: un evento de otro canal puede caer entre ambas.
 * La primera va sola si el permiso puede tener que renovarse, para no pedir dos permisos a la vez.
 */
export async function readRequest(deps: OrchestratorDependencies, access: Access): Promise<Result<BookingRequest>> {
  const journeyCall = () => callWithGrant(deps, access, { method: "GET", path: "/journeys/:journeyId" });
  const contextCall = () => callWithGrant(deps, access, { method: "GET", path: "/journeys/:journeyId/context" });
  const sequential = deps.identityMode === "assertion" && !access.fresh;
  const [journey, context] = sequential
    ? [await journeyCall(), await contextCall()]
    : await Promise.all([journeyCall(), contextCall()]);
  if (!journey.ok) return toFailure(journey);
  if (!context.ok) return toFailure(context);

  const request = toBookingRequest(journey.data, context.data);
  if (!request) {
    reportUnexpectedBody("GET", "/journeys/:journeyId");
    return failure("unavailable");
  }
  if (request.status === "completed" || request.status === "cancelled") await closeQuietly(deps, access);
  return success(request);
}

/** Se ejecuta al arrancar en modo orquestador. Detiene el servidor si falta algo o es inválido. */
export async function checkOrchestratorConfiguration(registry: RequestRegistry, identityMode: "none" | "assertion"): Promise<void> {
  getOrchestratorBaseUrl();
  getChannelKey();
  if (identityMode === "assertion") return;
  try {
    await registry.prepare();
  } catch {
    // El mensaje omite la ruta y el contenido del archivo.
    throw new Error("No se pudo preparar el registro del canal Web en PORTAL_DATA_DIR.");
  }
}
