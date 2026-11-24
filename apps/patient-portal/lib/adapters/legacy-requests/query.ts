import "server-only";
import { success } from "@/lib/domain/errors";
import type { RequestQuery } from "@/lib/domain/ports";
import { authorizedRequest } from "../general-api/authorized";
import { toFailure, toResult } from "../general-api/failures";
import type { components } from "../general-api/schema";
import { toAppointment, toBookingRequest, type Snapshot } from "./mapping";

type Schemas = components["schemas"];

// El contrato no ofrece consultar la cita de un trámite: se recorre el listado de citas propias.
const APPOINTMENT_PAGE_SIZE = 100;
const APPOINTMENT_PAGES = 3;

/**
 * Consulta del trámite sobre las operaciones `/requests` y `/appointments` de la API actual.
 * Todas llevan el token del paciente, así que ninguna respuesta se guarda en caché.
 */
export const legacyRequestQuery: RequestQuery = {
  async listPending({ page, limit }) {
    const result = await authorizedRequest<Schemas["RequestPageDto"]>({
      method: "GET",
      path: "/requests/pending",
      query: { page, limit },
    });
    return toResult(result, (data) => ({ items: data.items.map(toBookingRequest), hasMore: data.hasMore }));
  },

  async getRequest(id) {
    const result = await authorizedRequest<Snapshot>({ method: "GET", path: "/requests/{id}", params: { id } });
    return toResult(result, toBookingRequest);
  },

  async getAppointment(requestId) {
    for (let page = 1; page <= APPOINTMENT_PAGES; page++) {
      const result = await authorizedRequest<Schemas["AppointmentPageDto"]>({
        method: "GET",
        path: "/appointments",
        query: { page, limit: APPOINTMENT_PAGE_SIZE },
      });
      if (!result.ok) return toFailure(result);

      const match = result.data.items.find((appointment) => appointment.requestId === requestId);
      if (match) return success(toAppointment(match));
      if (!result.data.hasMore) break;
    }
    return success(undefined);
  },
};
