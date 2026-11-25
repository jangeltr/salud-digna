import type {
  BookingRequest,
  Channel,
  ContinuityCode,
  HistoryEntry,
  HistoryPage,
  RequestStatus,
  RequestStep,
  RequestSummary,
} from "@/lib/domain/model";
import { Secret } from "@/lib/secret";

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

/** Permiso de un trámite con su vencimiento. Sale ya envuelto: su valor no circula como texto. */
export type GrantedAccess = { grant: Secret; expiresAt: number };

function readGrant(data: Record<string, unknown>): GrantedAccess | undefined {
  const expires = readDate(data.grantExpiresAt);
  if (!expires || typeof data.grant !== "string" || !GRANT.test(data.grant)) return undefined;
  return { grant: new Secret(data.grant), expiresAt: Date.parse(expires) };
}

/** `access` falta cuando un reintento llega con el permiso inicial ya vencido o revocado. */
export type CreatedJourney = { id: string; access?: GrantedAccess };

/** Respuesta de `POST /journeys`. Un reintento puede traer solo `id` y `status`. */
export function readCreatedJourney(data: unknown): CreatedJourney | undefined {
  if (!isRecord(data)) return undefined;
  const id = readUuid(data.id);
  if (!id) return undefined;
  if (data.grant === undefined && data.grantExpiresAt === undefined) return { id };

  const access = readGrant(data);
  return access ? { id, access } : undefined;
}

/**
 * Respuesta de `POST /journeys/:journeyId/access-grants` (`patient-identity.md`, «Recuperación automática»):
 * `201` con `journeyId`, `grant` y `grantExpiresAt`. El permiso solo vale si es del trámite pedido.
 */
export function readAccessGrant(data: unknown, journeyId: string): GrantedAccess | undefined {
  if (!isRecord(data) || readUuid(data.journeyId) !== journeyId) return undefined;
  return readGrant(data);
}

const OPEN_STATUSES = new Set<RequestStatus>(["draft", "in-progress", "pending-confirmation"]);

/**
 * Respuesta de `GET /journeys?active=true`: `{ items: [{ id, type, status, createdAt, updatedAt }] }`.
 * Se quedan solo los trámites de cita abiertos, aunque el servicio ya filtre: una versión anterior
 * del orquestador ignora `active` y devuelve también los cerrados.
 */
export function readJourneySummaries(data: unknown): RequestSummary[] | undefined {
  if (!isRecord(data) || !Array.isArray(data.items)) return undefined;
  const summaries: RequestSummary[] = [];
  for (const item of data.items) {
    if (!isRecord(item)) return undefined;
    const id = readUuid(item.id);
    const createdAt = readDate(item.createdAt);
    const updatedAt = readDate(item.updatedAt);
    const status = lookup(STATUS, item.status);
    if (!id || !createdAt || !updatedAt) return undefined;
    if (item.type !== "APPOINTMENT" || !status || !OPEN_STATUSES.has(status)) continue;
    summaries.push({ id, status, createdAt, lastActivityAt: updatedAt });
  }
  return summaries;
}

/** Respuesta de `POST /continuity-codes/redeem`. */
export function readRedeemedJourney(data: unknown): { id: string; access: GrantedAccess } | undefined {
  if (!isRecord(data)) return undefined;
  const id = readUuid(data.journeyId);
  const access = readGrant(data);
  return id && access ? { id, access } : undefined;
}

// Doce caracteres, agrupados de cuatro en cuatro o seguidos. El alfabeto no se fija aquí.
const ISSUED_CODE = /^[0-9A-Za-z]{4}(?:-?[0-9A-Za-z]{4}){2}$/;

/** Respuesta de `POST /journeys/:journeyId/continuity-codes`. */
export function readContinuityCode(data: unknown): ContinuityCode | undefined {
  if (!isRecord(data)) return undefined;
  const expiresAt = readDate(data.expiresAt);
  if (!expiresAt || typeof data.code !== "string" || !ISSUED_CODE.test(data.code)) return undefined;
  return { code: data.code, expiresAt };
}

// Alfabeto de los códigos: Base32 sin I, L, O ni U, como el ejemplo del contrato.
const TYPED_CODE = /^[0-9A-HJKMNP-TV-Z]{12}$/;

/**
 * Deja el código que escribió el paciente en la forma que acepta el canje: doce caracteres en mayúsculas.
 * Quita espacios y guiones, y corrige las letras que el alfabeto excluye por parecerse a un número:
 * O pasa a 0, e I y L pasan a 1. Devuelve `undefined` si aun así no tiene la forma de un código,
 * para no gastar un intento de canje en el orquestador.
 */
export function normalizeContinuityCode(input: string): string | undefined {
  const code = input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  return TYPED_CODE.test(code) ? code : undefined;
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
