import "server-only";
import { failure, success, type Result } from "@/lib/domain/errors";
import type { BookingRequest, Clinic, Patient, Study } from "@/lib/domain/model";
import {
  orchestratorRequest,
  reportUnexpectedBody,
  type OrchestratorRequest,
  type OrchestratorResult,
} from "./client";
import type { Secret } from "@/lib/secret";
import type { GrantStore, PendingCreationStore, RequestRegistry } from "@/lib/state/ports";
import { getChannelKey, getOrchestratorBaseUrl } from "./config";
import { toFailure } from "./failures";
import { readContextVersion, toBookingRequest } from "./mapping";

/** Lo que el adaptador necesita de la API general y de los almacenes. Lo entrega `lib/composition.ts`. */
export type OrchestratorDependencies = {
  /**
   * Paciente de la sesión actual. El orquestador no conoce al paciente ni su sesión:
   * comprobarla antes de cada operación es responsabilidad del portal.
   */
  currentPatient(): Promise<Result<Patient>>;
  /** Catálogo. El orquestador guarda referencias opacas y no comprueba que existan. */
  getStudy(id: string): Promise<Result<Study>>;
  getClinic(id: string): Promise<Result<Clinic>>;
  /** Qué trámites tiene cada cuenta. */
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

/** Trámite del paciente de la sesión con un permiso vigente. */
export type Access = { accountId: string; requestId: string; grant: Secret };

/**
 * Comprobación previa a cualquier lectura o escritura de un trámite.
 * Si el registro no lo atribuye al paciente de la sesión, responde «no encontrado» sin llamar al orquestador.
 * Si es suyo pero no hay permiso vigente en memoria, responde `access-expired`, también sin llamar.
 */
export async function resolveAccess(deps: OrchestratorDependencies, requestId: string): Promise<Result<Access>> {
  const patient = await deps.currentPatient();
  if (!patient.ok) return patient;

  const { accountId } = patient.data;
  const id = requestId.toLowerCase();

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
  return success({ accountId, requestId: id, grant });
}

/** Llamada al orquestador con el permiso del trámite. Si lo rechaza, el permiso se olvida. */
export async function callWithGrant(
  deps: OrchestratorDependencies,
  access: Access,
  request: Omit<OrchestratorRequest, "grant" | "journeyId">,
): Promise<OrchestratorResult> {
  const result = await orchestratorRequest({ ...request, journeyId: access.requestId, grant: access.grant });
  if (!result.ok && result.status === 404) await deps.grants.drop(access.accountId, access.requestId);
  return result;
}

/** Anota el cierre en el registro. Si falla, el trámite sigue listado y se volverá a intentar en otra lectura. */
export async function closeQuietly(deps: OrchestratorDependencies, { accountId, requestId }: Access): Promise<void> {
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
 */
export async function readRequest(deps: OrchestratorDependencies, access: Access): Promise<Result<BookingRequest>> {
  const [journey, context] = await Promise.all([
    callWithGrant(deps, access, { method: "GET", path: "/journeys/:journeyId" }),
    callWithGrant(deps, access, { method: "GET", path: "/journeys/:journeyId/context" }),
  ]);
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
export async function checkOrchestratorConfiguration(registry: RequestRegistry): Promise<void> {
  getOrchestratorBaseUrl();
  getChannelKey();
  try {
    await registry.prepare();
  } catch {
    // El mensaje omite la ruta y el contenido del archivo.
    throw new Error("No se pudo preparar el registro del canal Web en PORTAL_DATA_DIR.");
  }
}
