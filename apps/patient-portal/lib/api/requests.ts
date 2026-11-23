import "server-only";
import { apiRequest } from "./client";
import type { components } from "./schema";

type Schemas = components["schemas"];

export type RequestSnapshot = Schemas["RequestSnapshotDto"];
export type RequestPage = Schemas["RequestPageDto"];
export type RequestStep = RequestSnapshot["currentStep"];
export type Channel = Schemas["Channel"];
/** Cambios admitidos por PATCH /requests/{id}/context, sin la versión. */
export type ContextChanges = Omit<Schemas["UpdateRequestContextDto"], "version">;
export type Appointment = Schemas["AppointmentDto"];
export type AppointmentPage = Schemas["AppointmentPageDto"];
export type AssistanceCode = Schemas["AssistanceCodeDto"];
export type JourneyEntry = Schemas["JourneyEntryDto"];

// Todas las operaciones llevan el token del paciente, así que ninguna respuesta se guarda en caché.

export function createRequest(token: string) {
  return apiRequest<RequestSnapshot>({ method: "POST", path: "/requests", token, body: {} });
}

export function listPendingRequests(token: string, page = 1, limit = 20) {
  return apiRequest<RequestPage>({ method: "GET", path: "/requests/pending", query: { page, limit }, token });
}

export function getRequest(token: string, id: string) {
  return apiRequest<RequestSnapshot>({ method: "GET", path: "/requests/{id}", params: { id }, token });
}

/** Guarda selecciones parciales. La versión debe ser la de la última respuesta de la API. */
export function updateRequestContext(token: string, id: string, version: number, changes: ContextChanges) {
  return apiRequest<RequestSnapshot>({
    method: "PATCH",
    path: "/requests/{id}/context",
    params: { id },
    token,
    body: { version, ...changes },
  });
}

export function pauseRequest(token: string, id: string, version: number) {
  return apiRequest<RequestSnapshot>({ method: "POST", path: "/requests/{id}/pause", params: { id }, token, body: { version } });
}

export function resumeRequest(token: string, id: string, version: number) {
  return apiRequest<RequestSnapshot>({ method: "POST", path: "/requests/{id}/resume", params: { id }, token, body: { version } });
}

/** Un reintento compatible devuelve la misma cita. */
export function confirmRequest(token: string, id: string, version: number) {
  return apiRequest<Appointment>({ method: "POST", path: "/requests/{id}/confirm", params: { id }, token, body: { version } });
}

/** Sin cuerpo. Cada llamada emite un código nuevo de un solo uso. */
export function issueAssistanceCode(token: string, id: string) {
  return apiRequest<AssistanceCode>({ method: "POST", path: "/requests/{id}/assistance-code", params: { id }, token });
}

export function listAppointments(token: string, page = 1, limit = 100) {
  return apiRequest<AppointmentPage>({ method: "GET", path: "/appointments", query: { page, limit }, token });
}
