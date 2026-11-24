import type {
  BookingRequest,
  Channel,
  HistoryEntry,
  HistoryPage,
  RequestStatus,
  RequestStep,
} from "@/lib/domain/model";
import { Secret } from "./secret";

/**
 * Traducción de las respuestas del orquestador al modelo del portal.
 * El orquestador no publica un OpenAPI, así que no hay tipos generados: las formas salen de
 * `journey-writes.md` y `journey-queries.md`, y cada respuesta se comprueba antes de usarla.
 * Una respuesta con otra forma devuelve `undefined`.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// El permiso viaja en una cabecera: solo se aceptan los caracteres de base64url.
const GRANT = /^[A-Za-z0-9_-]{16,512}$/;

const STATUS: Record<string, RequestStatus> = {
  DRAFT: "draft",
  IN_PROGRESS: "in-progress",
  PENDING_CONFIRMATION: "pending-confirmation",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

const STEP: Record<string, RequestStep> = {
  SELECT_STUDY: "study",
  SELECT_CLINIC: "clinic",
  SELECT_DATETIME: "datetime",
  REVIEW: "review",
  CONFIRMED: "confirmed",
};

const HISTORY_KIND: Record<string, HistoryEntry["kind"]> = {
  JOURNEY_CREATED: "created",
  JOURNEY_CONTEXT_UPDATED: "selections-updated",
  JOURNEY_STATUS_CHANGED: "status-changed",
  APPOINTMENT_CONFIRMED: "appointment-confirmed",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readUuid(value: unknown): string | undefined {
  return typeof value === "string" && UUID.test(value) ? value.toLowerCase() : undefined;
}

function readDate(value: unknown): string | undefined {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : undefined;
}

function lookup<Value>(table: Record<string, Value>, value: unknown): Value | undefined {
  return typeof value === "string" && Object.hasOwn(table, value) ? table[value] : undefined;
}

export type CreatedJourney = { id: string; grant: Secret; grantExpiresAt: number };

/** Respuesta de `POST /journeys`. El permiso sale ya envuelto: su valor no circula como texto. */
export function readCreatedJourney(data: unknown): CreatedJourney | undefined {
  if (!isRecord(data)) return undefined;
  const id = readUuid(data.id);
  const expires = readDate(data.grantExpiresAt);
  if (!id || !expires || typeof data.grant !== "string" || !GRANT.test(data.grant)) return undefined;
  return { id, grant: new Secret(data.grant), grantExpiresAt: Date.parse(expires) };
}

/** Versión del contexto, de la respuesta de `GET /journeys/:journeyId/context`. */
export function readContextVersion(context: unknown): number | undefined {
  if (!isRecord(context)) return undefined;
  const { version } = context;
  return typeof version === "number" && Number.isInteger(version) && version >= 1 ? version : undefined;
}

/**
 * Une el estado (`GET /journeys/:journeyId`) y el contexto (`…/context`) en el trámite del modelo.
 * Un estado o un paso fuera del contrato se trata como trámite cerrado, igual que en el adaptador heredado.
 * El orquestador no guarda fecha ni nota, y no informa del último canal.
 */
export function toBookingRequest(journey: unknown, context: unknown): BookingRequest | undefined {
  if (!isRecord(journey) || !isRecord(context)) return undefined;

  const id = readUuid(journey.id);
  const createdAt = readDate(journey.createdAt);
  const journeyUpdatedAt = readDate(journey.updatedAt);
  const contextUpdatedAt = readDate(context.updatedAt);
  const version = readContextVersion(context);
  if (!id || !createdAt || !journeyUpdatedAt || !contextUpdatedAt || version === undefined) return undefined;
  if (readUuid(context.journeyId) !== id) return undefined;

  const refs = isRecord(context.externalRefs) ? context.externalRefs : {};
  const lastActivityAt = Date.parse(contextUpdatedAt) > Date.parse(journeyUpdatedAt) ? contextUpdatedAt : journeyUpdatedAt;

  return {
    id,
    status: lookup(STATUS, journey.status) ?? "cancelled",
    step: lookup(STEP, context.currentStep) ?? "confirmed",
    selections: { studyId: readUuid(refs.studyId), clinicId: readUuid(refs.clinicId) },
    lastActivityAt,
    createdAt,
    version,
  };
}

/**
 * El contrato no enumera los códigos de canal: solo usa `demo-web` como ejemplo.
 * Se reconocen por su nombre los que contienen una palabra conocida. El resto queda como `other`
 * y la pantalla muestra el código tal cual.
 */
function toChannel(code: string): Channel {
  const normalized = code.toLowerCase();
  if (normalized.includes("whatsapp")) return "whatsapp";
  if (normalized.includes("call")) return "call-center";
  if (normalized.includes("web")) return "web";
  return "other";
}

function toHistoryEntry(item: unknown): HistoryEntry | undefined {
  if (!isRecord(item)) return undefined;
  const id = readUuid(item.id);
  const occurredAt = readDate(item.occurredAt);
  if (!id || !occurredAt || typeof item.producerCode !== "string") return undefined;

  const data = isRecord(item.data) ? item.data : {};
  const kind = lookup(HISTORY_KIND, item.type) ?? "other";

  return {
    id,
    kind,
    channel: toChannel(item.producerCode),
    channelCode: item.producerCode,
    occurredAt,
    ...(kind === "selections-updated" ? { step: lookup(STEP, data.currentStep) } : {}),
    ...(kind === "status-changed" ? { from: lookup(STATUS, data.from), to: lookup(STATUS, data.to) } : {}),
  };
}

/** Respuesta de `GET /journeys/:journeyId/history`. Llega del evento más antiguo al más reciente. */
export function toHistoryPage(data: unknown): HistoryPage | undefined {
  if (!isRecord(data) || !Array.isArray(data.items)) return undefined;

  const items: HistoryEntry[] = [];
  for (const item of data.items) {
    const entry = toHistoryEntry(item);
    if (!entry) return undefined;
    items.push(entry);
  }
  return typeof data.nextCursor === "string" && data.nextCursor !== "" ? { items, nextCursor: data.nextCursor } : { items };
}
