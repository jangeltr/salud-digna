export const uuid = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
export const isId = (v: unknown): v is string => typeof v === "string" && uuid.test(v);
export const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const date = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T.*Z$/.test(v) && Number.isFinite(Date.parse(v));
const version = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 2147483647;
const statuses = ["DRAFT", "IN_PROGRESS", "PENDING_CONFIRMATION", "COMPLETED", "CANCELLED"];
const steps = ["SELECT_STUDY", "SELECT_CLINIC", "SELECT_DATETIME", "REVIEW", "CONFIRMED"];
export type HistoryItem = { id: string; type: string; producerCode: string; occurredAt: string; receivedAt: string;
  schemaVersion: number; data: { version?: number; currentStep?: string; from?: string; to?: string } };
export type HistoryPage = { items: HistoryItem[]; nextCursor?: string };
export type View = { status: string; context: { version: number; currentStep: string; externalRefs: Record<string, string> };
  history: HistoryPage | null };
export type Outcome = { outcome: "applied"; eventId: string } | { outcome: "uncertain" | "rejected"; status?: number };

function invalid(): never { throw new Error("Invalid upstream response"); }

export function readSummary(value: unknown, id: string) {
  if (!record(value) || value.id !== id || typeof value.type !== "string" ||
      typeof value.status !== "string" || !statuses.includes(value.status) ||
      !date(value.createdAt) || !date(value.updatedAt)) invalid();
  return value.status;
}

export function readContext(value: unknown, id: string): View["context"] {
  if (!record(value) || value.journeyId !== id || typeof value.currentStep !== "string" ||
      !steps.includes(value.currentStep) || !version(value.version) || !date(value.updatedAt) ||
      !record(value.externalRefs)) invalid();
  const externalRefs: Record<string, string> = {};
  for (const key of ["studyId", "clinicId", "appointmentId"]) {
    const ref = value.externalRefs[key];
    if (isId(ref)) externalRefs[key] = ref;
  }
  return { version: value.version, currentStep: value.currentStep, externalRefs };
}

export function readHistory(value: unknown): HistoryPage {
  if (!record(value) || !Array.isArray(value.items) || value.items.length > 20 ||
      (value.nextCursor !== undefined && (typeof value.nextCursor !== "string" || !value.nextCursor || value.nextCursor.length > 200))) invalid();
  const items = value.items.map((item): HistoryItem => {
    if (!record(item) || !isId(item.id) || typeof item.type !== "string" || typeof item.producerCode !== "string" ||
        typeof item.occurredAt !== "string" || !date(item.occurredAt) || typeof item.receivedAt !== "string" ||
        !date(item.receivedAt) || !version(item.schemaVersion) || !record(item.data)) invalid();
    const data: HistoryItem["data"] = {};
    if (item.schemaVersion === 1) {
      const { version: rev, currentStep, from, to } = item.data;
      if (version(rev)) data.version = rev;
      if (typeof currentStep === "string" && steps.includes(currentStep)) data.currentStep = currentStep;
      if (typeof from === "string" && statuses.includes(from)) data.from = from;
      if (typeof to === "string" && statuses.includes(to)) data.to = to;
    }
    return { id: item.id, type: item.type, producerCode: item.producerCode, occurredAt: item.occurredAt,
      receivedAt: item.receivedAt, schemaVersion: item.schemaVersion, data };
  });
  return { items, nextCursor: value.nextCursor };
}

export function eventPayload(input: Record<string, unknown>) {
  if (!version(input.expectedVersion)) return;
  const expectedVersion = input.expectedVersion;
  if (input.type === "JOURNEY_STATUS_CHANGED" && (input.to === "PENDING_CONFIRMATION" || input.to === "CANCELLED") &&
      input.studyId === undefined && input.clinicId === undefined) {
    return { type: input.type, payload: { expectedVersion, to: input.to } };
  }
  if (input.type !== "JOURNEY_CONTEXT_UPDATED" || input.to !== undefined) return;
  const { studyId, clinicId } = input;
  if ((studyId !== undefined && !isId(studyId)) || (clinicId !== undefined && !isId(clinicId)) || (!studyId && !clinicId)) return;
  return { type: input.type, payload: { expectedVersion, studyId, clinicId } };
}

export function readReceipt(value: unknown, id: string) {
  if (!record(value) || value.journeyId !== id || !isId(value.id)) invalid();
  return value.id;
}

export function continuityCode(value: unknown) {
  const alphabet = "[0-9A-HJKMNP-TV-Z]";
  const pattern = new RegExp("^(?:" + alphabet + "{12}|" + alphabet + "{4}(?:-" + alphabet + "{4}){2})$", "i");
  return typeof value === "string" && (value.length === 12 || value.length === 14) && pattern.test(value)
    ? value.replaceAll("-", "").toUpperCase() : undefined;
}

export function readRedemption(value: unknown) {
  if (!record(value) || !isId(value.journeyId) || typeof value.grant !== "string" ||
      !/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(value.grant) ||
      typeof value.grantExpiresAt !== "string" || !date(value.grantExpiresAt)) invalid();
  return { id: value.journeyId.toLowerCase(), grant: value.grant, expiresAt: Date.parse(value.grantExpiresAt) };
}

export function allowsPending(status: string, context: View["context"]) {
  return status === "IN_PROGRESS" && version(context.version) &&
    isId(context.externalRefs.studyId) && isId(context.externalRefs.clinicId);
}

export function hasPublishScope(value: unknown) {
  return record(value) && value.authenticated === true && Array.isArray(value.scopes) &&
    value.scopes.includes("JOURNEYS_READ") && value.scopes.includes("EVENTS_PUBLISH");
}

export const referenceLabels: Record<string, string> = {
  studyId: "Estudio (UUID)", clinicId: "Clínica (UUID)", appointmentId: "Cita (UUID)",
};
