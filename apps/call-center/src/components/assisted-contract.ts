import { ApiError, type Api } from "./orchestrator";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const utcDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is string {
  return typeof value === "string" && uuid.test(value);
}

function isDateTime(value: unknown): value is string {
  if (typeof value !== "string" || !utcDateTime.test(value)) return false;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return false;
  return new Date(time).toISOString().slice(0, 19) === value.slice(0, 19);
}

function isSelection(value: unknown) {
  return isRecord(value) && isId(value.id) && typeof value.name === "string";
}

export async function confirmAppointment(api: Api, requestId: string, version: number) {
  const value = await api<unknown>(
    "call-center/requests/" + encodeURIComponent(requestId) + "/confirm",
    { version },
    200,
  );
  if (!isRecord(value) || !isId(value.id) || !isId(value.requestId) ||
      value.requestId.toLowerCase() !== requestId.toLowerCase() || value.status !== "CONFIRMED" ||
      !isDateTime(value.scheduledAt) || !isDateTime(value.createdAt) ||
      !isSelection(value.study) || !isSelection(value.clinic)) {
    throw new Error("Respuesta de confirmación inválida.");
  }
  return { id: value.id, scheduledAt: value.scheduledAt, status: value.status };
}

export function isAccessError(error: unknown) {
  return error instanceof ApiError && [401, 403, 404].includes(error.status);
}

export function isUncertain(error: unknown) {
  return !(error instanceof ApiError) || error.status >= 500 || error.status === 408;
}
