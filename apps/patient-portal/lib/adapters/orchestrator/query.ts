import "server-only";
import { failure, success } from "@/lib/domain/errors";
import type { BookingRequest, LockedRequest } from "@/lib/domain/model";
import type { RequestQuery } from "@/lib/domain/ports";
import type { RegistryEntry } from "@/lib/state/ports";
import {
  callWithGrant,
  readRequest,
  reportRegistryFailure,
  resolveAccess,
  withAssertion,
  type OrchestratorDependencies,
} from "./access";
import { orchestratorRequest, reportUnexpectedBody } from "./client";
import { toFailure, toIdentifiedFailure } from "./failures";
import { readJourneySummaries, toHistoryPage } from "./mapping";

/**
 * Consulta del trámite sobre el orquestador.
 * - Modo `none`: la lista sale del registro del canal Web, y de cada trámite solo se lee el estado si hay
 *   permiso vigente.
 * - Modo `assertion`: la lista sale de `GET /journeys?active=true` con la acreditación del paciente e
 *   incluye los trámites de cualquier canal. Solo trae folio, estado y fechas: el detalle se lee al abrir
 *   cada trámite, con un permiso que se pide en ese momento.
 */
export function createOrchestratorQuery(deps: OrchestratorDependencies): RequestQuery {
  return {
    async listPending({ page, limit }) {
      if (deps.identityMode === "assertion") {
        const patient = await deps.currentPatient();
        if (!patient.ok) return patient;
        const asked = await withAssertion(deps, (assertion) =>
          orchestratorRequest({ method: "GET", path: "/journeys", query: { active: "true" }, assertion }),
          { renewOnRejection: true },
        );
        if (!asked.ok) return asked.error.kind === "session" ? asked : failure("identity-unavailable");
        const result = asked.data;
        if (!result.ok) return toIdentifiedFailure(result, false);
        const summaries = readJourneySummaries(result.data);
        if (!summaries) {
          reportUnexpectedBody("GET", "/journeys");
          return failure("unavailable");
        }
        return success({
          items: [],
          summaries: summaries.slice((page - 1) * limit, page * limit),
          hasMore: summaries.length > page * limit,
        });
      }

      const patient = await deps.currentPatient();
      if (!patient.ok) return patient;
      const { accountId } = patient.data;

      let open: RegistryEntry[];
      try {
        open = (await deps.registry.list(accountId)).filter((entry) => !entry.closedAt);
      } catch {
        reportRegistryFailure("leer");
        return failure("unavailable");
      }

      // Todas las lecturas van en paralelo. El orquestador no ofrece leer varios trámites a la vez:
      // cada uno cuesta dos llamadas, estado y contexto.
      const slice = open.slice((page - 1) * limit, page * limit);
      const reads = await Promise.all(
        slice.map(async (entry) => {
          const grant = await deps.grants.find(accountId, entry.id);
          return grant ? readRequest(deps, { accountId, requestId: entry.id, grant, fresh: false }) : failure("access-expired");
        }),
      );

      const items: BookingRequest[] = [];
      const locked: LockedRequest[] = [];
      for (const [index, read] of reads.entries()) {
        const entry = slice[index];
        if (read.ok) {
          // Un trámite que resultó cerrado ya quedó anotado en el registro y sale de los pendientes.
          if (read.data.status !== "completed" && read.data.status !== "cancelled") items.push(read.data);
        } else if (read.error.kind === "access-expired") {
          locked.push({ id: entry.id, registeredAt: entry.createdAt });
        } else {
          return read;
        }
      }

      return success({ items, locked, hasMore: open.length > page * limit });
    },

    async getRequest(id) {
      const access = await resolveAccess(deps, id);
      return access.ok ? readRequest(deps, access.data) : access;
    },

    // El contexto puede traer `appointmentId`, pero ningún evento del contrato lo escribe.
    async getAppointment() {
      return success(undefined);
    },

    async getHistory(requestId, { limit, cursor }) {
      const access = await resolveAccess(deps, requestId);
      if (!access.ok) return access;

      const result = await callWithGrant(deps, access.data, {
        method: "GET",
        path: "/journeys/:journeyId/history",
        query: { limit, cursor },
      });
      if (!result.ok) return toFailure(result);

      const history = toHistoryPage(result.data);
      if (!history) {
        reportUnexpectedBody("GET", "/journeys/:journeyId/history");
        return failure("unavailable");
      }
      return success(history);
    },
  };
}
