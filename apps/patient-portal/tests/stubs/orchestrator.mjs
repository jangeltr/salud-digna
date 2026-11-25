// Orquestador simulado para las pruebas del portal. Solo escucha en 127.0.0.1 y solo tiene datos sintéticos.
// Aplica las reglas de apps/orchestrator/docs/journey-writes.md, journey-queries.md y data-model.md:
// scopes de canal, permiso por trámite y canal con vencimiento, estudio antes que clínica, versión,
// los dos casos de 409 (estado y deduplicación) y el reenvío idéntico.
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { HOST, PORTS } from "../lib/config.mjs";
import { assertionKey, CHANNEL_KEY_IDS, secretOf } from "../lib/secrets.mjs";

const port = PORTS.orchestrator;
const UUID = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
const sha = (text) => createHash("sha256").update(text).digest("hex");
// Claves sintéticas de canal, distintas en cada ejecución (lib/secrets.mjs). La del canal Web es la que recibe el portal.
// El canal `demo-whatsapp` hace de «otro canal» en las pruebas: es el código que usan los datos del orquestador.
const KEYS = {
  [CHANNEL_KEY_IDS.web]: { secret: secretOf("canal:web"), channel: "demo-web", scopes: ["EVENTS_PUBLISH", "JOURNEYS_READ"] },
  [CHANNEL_KEY_IDS.publishOnly]: { secret: secretOf("canal:publishOnly"), channel: "demo-solo-publicar", scopes: ["EVENTS_PUBLISH"] },
  [CHANNEL_KEY_IDS.expired]: { secret: secretOf("canal:expired"), channel: "demo-vencido", scopes: ["EVENTS_PUBLISH", "JOURNEYS_READ"], expired: true },
  [CHANNEL_KEY_IDS.otherChannel]: { secret: secretOf("canal:otherChannel"), channel: "demo-whatsapp", scopes: ["EVENTS_PUBLISH", "JOURNEYS_READ"] },
};

const journeys = new Map(); // id -> { id, type, status, createdAt, updatedAt, context: { currentStep, version, refs, updatedAt }, events: [] }
const grants = new Map(); // digest -> { secret, channel, journeyId, operations, expiresAt, revoked }
const dedup = new Map(); // `${channel}\n${externalEventId}` -> evento
const creations = new Map(); // `${channel}\n${Idempotency-Key}` -> { journey, expiresAt }
const codes = new Map(); // código de 12 caracteres -> { journeyId, source (permiso de origen), expiresAt, consumed }
let redeemWindows = new Map(); // canal -> { resetsAt, count }: 10 canjes por minuto y canal
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_PATTERN = new RegExp(`^(?:[${ALPHABET}]{12}|[${ALPHABET}]{4}(?:-[${ALPHABET}]{4}){2})$`, "i");
const grouped = (code) => `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)}`;
function issueCode(source, forced) {
  const code = forced ?? Array.from(randomBytes(12), (byte) => ALPHABET[byte & 31]).join("");
  const expiresAt = Math.min(Date.now() + 5 * 60_000, source.expiresAt);
  codes.set(code, { journeyId: source.journeyId, source, expiresAt, consumed: false });
  return { code: grouped(code), expiresAt: new Date(expiresAt).toISOString() };
}
let grantTtlMs = 5 * 60_000;
let calls = {};
let trace = [];
let failures = []; // { op, mode, times }

function send(res, status, body) {
  if (res.writableEnded) return;
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}
// Mismo cuerpo de error que http-error.filter.ts: solo código y mensaje genérico.
const MESSAGES = { 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 409: "Conflict", 429: "Too Many Requests", 500: "Internal Server Error", 503: "Service Unavailable" };
const err = (res, status) => send(res, status, { statusCode: status, message: MESSAGES[status] ?? "Request failed" });

async function readRaw(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw;
}
function takeFailure(op) {
  const failure = failures.find((item) => item.op === op && item.times > 0);
  if (!failure) return null;
  failure.times--;
  return failure.mode;
}
const isOpen = (journey) => ["DRAFT", "IN_PROGRESS", "PENDING_CONFIRMATION"].includes(journey.status);

function authenticate(req) {
  const match = /^Bearer ([\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12})\.([a-z0-9_-]{43})$/i.exec(req.headers.authorization ?? "");
  const key = match && KEYS[match[1].toLowerCase()];
  if (!key || key.secret !== match[2] || key.expired) return null;
  return key;
}
function findGrant(req, channel, journeyId, operation) {
  const header = req.headers["x-journey-grant"];
  if (typeof header !== "string" || !/^[\w-]{43}$/.test(header)) return null;
  const grant = grants.get(sha(header));
  if (!grant || grant.channel !== channel || grant.journeyId !== journeyId || grant.revoked) return null;
  if (grant.expiresAt <= Date.now() || !grant.operations.includes(operation)) return null;
  return grant;
}
function issueGrant(channel, journeyId, operations, ttlMs) {
  const secret = randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + ttlMs;
  grants.set(sha(secret), { secret, channel, journeyId, operations, expiresAt, revoked: false });
  return { secret, expiresAt };
}

function addEvent(journey, { producer, externalEventId, type, occurredAt, payload, submitted }) {
  const event = { id: randomUUID(), journeyId: journey.id, producer, externalEventId, type, schemaVersion: 1, occurredAt, receivedAt: new Date().toISOString(), payload, submitted };
  journey.events.push(event);
  dedup.set(`${producer}\n${externalEventId}`, event);
  return event;
}
// --- acreditaciones del paciente (docs/contratos/continuidad-identificada.md) ---------------------
// Formato propio de las pruebas, el mismo que firma el emisor de simulación del portal:
// base64url({ sub, channel, exp }) + "." + HMAC-SHA256 con la clave de lib/secrets.mjs.
const ASSERTION_KEY = Buffer.from(assertionKey(), "base64url");
const seenAssertions = new Set();
let rejectAssertions = false;
function mintAssertion(sub, channel, ttlSeconds = 300) {
  const payload = Buffer.from(JSON.stringify({ sub, channel, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString("base64url");
  return `${payload}.${createHmac("sha256", ASSERTION_KEY).update(payload).digest("base64url")}`;
}
/** Paciente acreditado, o null. Exige firma válida, vigencia y que el canal de la acreditación sea el de la clave. */
function verifyAssertion(req, channel) {
  const raw = req.headers["x-patient-assertion"];
  if (typeof raw !== "string" || !ASSERTION_KEY) return null;
  seenAssertions.add(raw);
  if (rejectAssertions) return null;
  const [payload, signature, extra] = raw.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  if (createHmac("sha256", ASSERTION_KEY).update(payload).digest("base64url") !== signature) return null;
  let claim;
  try { claim = JSON.parse(Buffer.from(payload, "base64url").toString()); } catch { return null; }
  if (!claim || typeof claim.sub !== "string" || claim.channel !== channel || !(claim.exp > Date.now() / 1000)) return null;
  return claim.sub;
}

function createJourney(channel) {
  const now = new Date().toISOString();
  const journey = { id: randomUUID(), type: "APPOINTMENT", status: "DRAFT", createdAt: now, updatedAt: now, context: { currentStep: "SELECT_STUDY", version: 1, refs: {}, updatedAt: now }, events: [] };
  journeys.set(journey.id, journey);
  addEvent(journey, { producer: channel, externalEventId: `system:created:${journey.id}`, type: "JOURNEY_CREATED", occurredAt: now, payload: { version: 1 }, submitted: null });
  return journey;
}

// Reglas de journey-writes.service.ts. Devuelve un código de error o aplica el avance.
function applyEvent(journey, producer, input) {
  const { context } = journey;
  if (context.version !== input.payload.expectedVersion) return 409;
  if (!isOpen(journey)) return 409;

  let status;
  let currentStep = context.currentStep;
  const refs = { ...context.refs };
  if (input.type === "JOURNEY_STATUS_CHANGED") {
    const { to } = input.payload;
    if (to === "PENDING_CONFIRMATION" && (journey.status !== "IN_PROGRESS" || !refs.studyId || !refs.clinicId)) return 409;
    status = to;
  } else {
    const { studyId, clinicId } = input.payload;
    if (studyId && studyId !== refs.studyId) {
      refs.studyId = studyId;
      delete refs.clinicId;
    }
    if (clinicId) refs.clinicId = clinicId;
    if (!refs.studyId) return 409;
    status = "IN_PROGRESS";
    currentStep = refs.clinicId ? "REVIEW" : "SELECT_CLINIC";
  }

  const from = journey.status;
  const now = new Date().toISOString();
  context.version++;
  context.currentStep = currentStep;
  context.refs = refs;
  context.updatedAt = now;
  journey.status = status;
  journey.updatedAt = now;
  const payload = { ...input.payload, version: context.version, ...(input.type === "JOURNEY_STATUS_CHANGED" ? { from } : { currentStep }) };
  return addEvent(journey, { producer, externalEventId: input.externalEventId, type: input.type, occurredAt: input.occurredAt, payload, submitted: input.payload });
}

// Validación de journey-write-input.ts. Devuelve null si el cuerpo es inválido.
function readEvent(body) {
  const only = (object, keys) => object && typeof object === "object" && !Array.isArray(object) && Object.keys(object).every((key) => keys.includes(key));
  if (!only(body, ["journeyId", "externalEventId", "occurredAt", "schemaVersion", "type", "payload"])) return null;
  const { journeyId, externalEventId, occurredAt, schemaVersion, type, payload } = body;
  if (typeof externalEventId !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(externalEventId) || externalEventId.startsWith("system:")) return null;
  if (schemaVersion !== 1 || typeof occurredAt !== "string" || occurredAt.length !== 24) return null;
  const date = new Date(occurredAt);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== occurredAt) return null;
  if (type !== "JOURNEY_CONTEXT_UPDATED" && type !== "JOURNEY_STATUS_CHANGED") return null;
  if (!only(payload, type === "JOURNEY_CONTEXT_UPDATED" ? ["expectedVersion", "studyId", "clinicId"] : ["expectedVersion", "to"])) return null;
  const { expectedVersion } = payload;
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1 || expectedVersion > 2_147_483_647) return null;
  if (typeof journeyId !== "string" || !UUID.test(journeyId)) return null;

  const base = { journeyId: journeyId.toLowerCase(), externalEventId, occurredAt, type };
  if (type === "JOURNEY_CONTEXT_UPDATED") {
    for (const key of ["studyId", "clinicId"]) {
      if (payload[key] !== undefined && (typeof payload[key] !== "string" || !UUID.test(payload[key]))) return null;
    }
    if (!payload.studyId && !payload.clinicId) return null;
    return { ...base, payload: { expectedVersion, ...(payload.studyId && { studyId: payload.studyId.toLowerCase() }), ...(payload.clinicId && { clinicId: payload.clinicId.toLowerCase() }) } };
  }
  if (payload.to !== "PENDING_CONFIRMATION" && payload.to !== "CANCELLED") return null;
  return { ...base, payload: { expectedVersion, to: payload.to } };
}

const same = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
const STEPS = new Set(["SELECT_STUDY", "SELECT_CLINIC", "SELECT_DATETIME", "REVIEW", "CONFIRMED"]);
const STATUSES = new Set(["DRAFT", "IN_PROGRESS", "PENDING_CONFIRMATION", "COMPLETED", "CANCELLED"]);
function project(event) {
  const data = {};
  const { payload } = event;
  if (event.type === "JOURNEY_CONTEXT_UPDATED") {
    if (STEPS.has(payload.currentStep)) data.currentStep = payload.currentStep;
  } else if (event.type === "JOURNEY_STATUS_CHANGED") {
    for (const key of ["from", "to"]) if (STATUSES.has(payload[key])) data[key] = payload[key];
  } else if (event.type !== "JOURNEY_CREATED" && event.type !== "APPOINTMENT_CONFIRMED") {
    return data;
  }
  if (Number.isInteger(payload.version) && payload.version > 0) data.version = payload.version;
  return data;
}

createServer(async (req, res) => {
  const url = new URL(req.url, "http://stub");
  const p = url.pathname;
  // Latencia simulada de red y servicio, solo si se pide: STUB_LATENCY_MS.
  if (!p.startsWith("/__test/") && Number(process.env.STUB_LATENCY_MS) > 0) await new Promise((r) => setTimeout(r, Number(process.env.STUB_LATENCY_MS)));
  const param = (name) => url.searchParams.get(name);

  // --- ganchos de prueba -----------------------------------------------------
  if (p.startsWith("/__test/")) {
    if (p === "/__test/state") return send(res, 200, { calls, journeys: journeys.size });
    if (p === "/__test/trace") { const out = trace; if (param("clear")) trace = []; return send(res, 200, out); }
    if (p === "/__test/reset-calls") { calls = {}; trace = []; return send(res, 200, {}); }
    if (p === "/__test/secrets") return send(res, 200, { keys: Object.entries(KEYS).flatMap(([id, key]) => [key.secret, `${id}.${key.secret}`]), grants: [...grants.values()].map((grant) => grant.secret), assertions: [...seenAssertions], idempotency: [...creations.keys()].map((entry) => entry.split("\n")[1]), codes: [...codes.keys()].flatMap((code) => [code, grouped(code)]) });
    if (p === "/__test/journeys") return send(res, 200, [...journeys.values()].map((j) => ({ id: j.id, status: j.status, currentStep: j.context.currentStep, version: j.context.version, refs: j.context.refs, events: j.events.map((e) => e.type), subject: j.subject ?? null })));
    if (p === "/__test/fail") { failures.push({ op: param("op"), mode: param("mode"), times: Number(param("times") ?? 1) }); return send(res, 200, {}); }
    if (p === "/__test/clear-failures") { failures = []; return send(res, 200, {}); }
    if (p === "/__test/grant-ttl") { grantTtlMs = Number(param("ms")); return send(res, 200, {}); }
    if (p === "/__test/revoke-grants") { for (const grant of grants.values()) if (grant.journeyId === param("journey")) grant.revoked = true; return send(res, 200, {}); }
    if (p === "/__test/issue-grant") { const g = issueGrant(param("channel"), param("journey"), ["READ_JOURNEY", "PUBLISH_EVENT"], 300_000); return send(res, 200, { grant: g.secret }); }
    if (p === "/__test/codes") return send(res, 200, [...codes.values()].map((entry) => ({ journeyId: entry.journeyId, channel: entry.source.channel, consumed: entry.consumed })));
    if (p === "/__test/reset-redeem-limit") { redeemWindows = new Map(); return send(res, 200, {}); }
    if (p === "/__test/reject-assertions") { rejectAssertions = param("on") === "1"; return send(res, 200, {}); }
    if (p === "/__test/assertion-for") return send(res, 200, { assertion: mintAssertion(param("sub"), param("channel") ?? "demo-web") });
    if (p === "/__test/issue-code") {
      // Código emitido por otro canal sobre un trámite, sin pasar por credenciales: ese canal recibe un permiso propio.
      if (!journeys.has(param("journey"))) return send(res, 404, {});
      const issued = issueGrant(param("channel") ?? "demo-whatsapp", param("journey"), ["READ_JOURNEY", "PUBLISH_EVENT"], 300_000);
      return send(res, 200, issueCode(grants.get(sha(issued.secret)), param("code") ?? undefined));
    }
    if (p === "/__test/other-channel") {
      // Avance de otro canal sobre el mismo trámite, sin pasar por credenciales ni permisos.
      const journey = journeys.get(param("journey"));
      if (!journey) return send(res, 404, {});
      const type = param("to") ? "JOURNEY_STATUS_CHANGED" : "JOURNEY_CONTEXT_UPDATED";
      const payload = { expectedVersion: journey.context.version, ...(param("to") && { to: param("to") }), ...(param("studyId") && { studyId: param("studyId") }), ...(param("clinicId") && { clinicId: param("clinicId") }) };
      const result = applyEvent(journey, param("code") ?? "demo-whatsapp", { externalEventId: `otro-canal-${randomUUID()}`, occurredAt: new Date().toISOString(), type, payload });
      return typeof result === "number" ? send(res, result, {}) : send(res, 200, { version: journey.context.version });
    }
    if (p === "/__test/seed-events") {
      // Eventos informativos de un tipo que el portal no conoce, para forzar la paginación del historial.
      const journey = journeys.get(param("journey"));
      if (!journey) return send(res, 404, {});
      for (let index = 0; index < Number(param("count")); index++) {
        addEvent(journey, { producer: param("code") ?? "demo-kiosko", externalEventId: `relleno-${randomUUID()}`, type: "DEMO_NOTE_ADDED", occurredAt: new Date(Date.now() + index).toISOString(), payload: {}, submitted: null });
      }
      return send(res, 200, { events: journey.events.length });
    }
    return send(res, 404, {});
  }

  const raw = req.method === "GET" ? "" : await readRaw(req);
  const op = `${req.method} ${p.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, ":id")}`;
  calls[op] = (calls[op] ?? 0) + 1;
  trace.push({ call: `${req.method} ${p}${url.search}`, op, hasAuth: Boolean(req.headers.authorization), hasGrant: Boolean(req.headers["x-journey-grant"]), hasAssertion: Boolean(req.headers["x-patient-assertion"]), idempotencyKey: req.headers["idempotency-key"] ?? null, raw });

  if (req.method === "GET" && p === "/api/v1/health") return send(res, 200, { status: "ok" });

  // --- credencial de canal: 401 sin credencial válida, 403 sin scope -----------
  const forcedAuth = takeFailure("auth");
  if (forcedAuth === "401") return err(res, 401);
  if (forcedAuth === "403") return err(res, 403);
  const key = authenticate(req);
  if (!key) return err(res, 401);
  const requireScope = (scope) => key.scopes.includes(scope);

  if (req.method === "GET" && p === "/api/v1/channel-auth/verify") {
    if (!requireScope("JOURNEYS_READ")) return err(res, 403);
    return send(res, 200, { authenticated: true, channelCode: key.channel, scopes: key.scopes });
  }

  // --- trámites activos del paciente acreditado ----------------------------------
  if (req.method === "GET" && p === "/api/v1/journeys") {
    if (!requireScope("JOURNEYS_READ")) return err(res, 403);
    const subject = verifyAssertion(req, key.channel);
    if (!subject) return err(res, 404);
    const mode = takeFailure("list");
    if (mode === "500") return err(res, 500);
    const active = url.searchParams.get("active") === "true";
    const items = [...journeys.values()]
      .filter((j) => j.subject === subject && (!active || ["DRAFT", "IN_PROGRESS", "PENDING_CONFIRMATION"].includes(j.status)))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id))
      .slice(0, 100)
      .map(({ id, type, status, createdAt, updatedAt }) => ({ id, type, status, createdAt, updatedAt }));
    return send(res, 200, { items });
  }

  // --- permiso para continuar un trámite del paciente acreditado -----------------
  const grantRequest = /^\/api\/v1\/journeys\/([^/]+)\/access-grants$/.exec(p);
  if (req.method === "POST" && grantRequest) {
    if (!requireScope("JOURNEYS_READ") || !requireScope("EVENTS_PUBLISH")) return err(res, 403);
    const subject = verifyAssertion(req, key.channel);
    const journey = journeys.get(grantRequest[1].toLowerCase());
    // Ajeno, inexistente o con acreditación inválida: el mismo 404.
    if (!subject || !journey || journey.subject !== subject) return err(res, 404);
    const mode = takeFailure("access-grants");
    if (mode === "500") return err(res, 500);
    const grant = issueGrant(key.channel, journey.id, ["READ_JOURNEY", "PUBLISH_EVENT"], grantTtlMs);
    return send(res, 201, { grant: grant.secret, grantExpiresAt: new Date(grant.expiresAt).toISOString() });
  }

  // --- crear un trámite --------------------------------------------------------
  if (req.method === "POST" && p === "/api/v1/journeys") {
    if (!requireScope("EVENTS_PUBLISH")) return err(res, 403);
    // Idempotency-Key obligatoria: 32 bytes en base64url sin relleno. Ausente o mal formada, 400.
    const idem = req.headers["idempotency-key"];
    if (typeof idem !== "string" || !/^[\w-]{43}$/.test(idem) || Buffer.from(idem, "base64url").length !== 32 || Buffer.from(idem, "base64url").toString("base64url") !== idem) return err(res, 400);
    let body;
    try { body = JSON.parse(raw); } catch { return err(res, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((k) => k !== "type") || body.type !== "APPOINTMENT") return err(res, 400);
    // Con acreditación, el trámite queda asociado al paciente. Una acreditación inválida nunca crea un provisional.
    const identified = req.headers["x-patient-assertion"] !== undefined;
    const subject = identified ? verifyAssertion(req, key.channel) : null;
    if (identified && !subject) return err(res, 404);
    const mode = takeFailure("create");
    if (mode === "500") return err(res, 500);
    if (mode === "hang") return; // sin respuesta y sin crear nada
    // Reintento con la misma clave: el mismo trámite en su estado inicial, con otro permiso si el primero sigue vigente.
    const known = creations.get(`${key.channel}\n${idem}`);
    if (known) {
      if (known.expiresAt <= Date.now()) return send(res, 201, { id: known.journey.id, status: "DRAFT" });
      const again = issueGrant(key.channel, known.journey.id, ["READ_JOURNEY", "PUBLISH_EVENT"], known.expiresAt - Date.now());
      return send(res, 201, { id: known.journey.id, status: "DRAFT", grant: again.secret, grantExpiresAt: new Date(known.expiresAt).toISOString() });
    }
    const journey = createJourney(key.channel);
    if (subject) journey.subject = subject;
    const grant = issueGrant(key.channel, journey.id, ["READ_JOURNEY", "PUBLISH_EVENT"], grantTtlMs);
    creations.set(`${key.channel}\n${idem}`, { journey, expiresAt: grant.expiresAt });
    if (mode === "hang-after") return; // creado, pero la respuesta se pierde
    return send(res, 201, { id: journey.id, status: journey.status, grant: grant.secret, grantExpiresAt: new Date(grant.expiresAt).toISOString() });
  }

  // --- publicar un avance ------------------------------------------------------
  if (req.method === "POST" && p === "/api/v1/events") {
    if (!requireScope("EVENTS_PUBLISH")) return err(res, 403);
    let body;
    try { body = JSON.parse(raw); } catch { return err(res, 400); }
    const rawId = body && typeof body === "object" ? body.journeyId : undefined;
    if (typeof rawId !== "string" || !UUID.test(rawId)) return err(res, 400);
    const journeyId = rawId.toLowerCase();
    if (!journeys.has(journeyId) || !findGrant(req, key.channel, journeyId, "PUBLISH_EVENT")) return err(res, 404);
    const input = readEvent(body);
    if (!input) return err(res, 400);

    const mode = takeFailure("events");
    if (mode === "500") return err(res, 500);
    if (mode === "hang") return; // sin respuesta y sin aplicar nada

    // Reenvío: el mismo identificador externo y productor devuelve el mismo resultado; con otro contenido, 409.
    const existing = dedup.get(`${key.channel}\n${input.externalEventId}`);
    if (existing) {
      const equal = existing.journeyId === input.journeyId && existing.type === input.type && existing.occurredAt === input.occurredAt && existing.submitted && same(existing.submitted, input.payload);
      return equal ? send(res, 201, { id: existing.id, journeyId: existing.journeyId }) : err(res, 409);
    }
    const result = applyEvent(journeys.get(journeyId), key.channel, input);
    if (typeof result === "number") return err(res, result);
    if (mode === "hang-after") return; // aplicado, pero la respuesta se pierde
    return send(res, 201, { id: result.id, journeyId });
  }

  // --- códigos de continuidad ----------------------------------------------------
  const emission = /^\/api\/v1\/journeys\/([^/]+)\/continuity-codes$/.exec(p);
  if (req.method === "POST" && emission) {
    // Emitir exige los dos scopes y un permiso del mismo canal y trámite con las dos operaciones.
    if (!requireScope("JOURNEYS_READ") || !requireScope("EVENTS_PUBLISH")) return err(res, 403);
    const journeyId = emission[1].toLowerCase();
    const source = journeys.has(journeyId) ? findGrant(req, key.channel, journeyId, "PUBLISH_EVENT") : null;
    if (!source || !source.operations.includes("READ_JOURNEY")) return err(res, 404);
    const mode = takeFailure("continuity");
    if (mode === "500") return err(res, 500);
    if (mode === "503") return err(res, 503);
    if (mode === "hang") return;
    return send(res, 201, issueCode(source));
  }
  if (req.method === "POST" && p === "/api/v1/continuity-codes/redeem") {
    if (!requireScope("JOURNEYS_READ")) return err(res, 403);
    // El intento se cuenta antes de validar nada: diez por minuto y canal.
    const now = Date.now();
    let window = redeemWindows.get(key.channel);
    if (!window || window.resetsAt <= now) { window = { resetsAt: now + 60_000, count: 0 }; redeemWindows.set(key.channel, window); }
    if (window.count >= 10) return err(res, 429);
    window.count++;
    let body;
    try { body = JSON.parse(raw); } catch { return err(res, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || typeof body.code !== "string" || (body.code.length !== 12 && body.code.length !== 14) || !CODE_PATTERN.test(body.code)) return err(res, 400);
    const mode = takeFailure("redeem");
    if (mode === "429") return err(res, 429);
    if (mode === "503") return err(res, 503);
    if (mode === "hang") return;
    // Desconocido, usado, vencido, con el permiso de origen sin vigencia o emitido por este mismo canal: el mismo 404.
    const entry = codes.get(body.code.replaceAll("-", "").toUpperCase());
    if (!entry || entry.consumed || entry.expiresAt <= now || entry.source.revoked || entry.source.expiresAt <= now || entry.source.channel === key.channel) return err(res, 404);
    entry.consumed = true;
    const grant = issueGrant(key.channel, entry.journeyId, ["READ_JOURNEY", "PUBLISH_EVENT"], 5 * 60_000);
    return send(res, 201, { journeyId: entry.journeyId, grant: grant.secret, grantExpiresAt: new Date(grant.expiresAt).toISOString() });
  }

  // --- consultas ---------------------------------------------------------------
  const match = /^\/api\/v1\/journeys\/([^/]+)(?:\/(context|history))?$/.exec(p);
  if (req.method === "GET" && match) {
    if (!requireScope("JOURNEYS_READ")) return err(res, 403);
    const journeyId = match[1].toLowerCase();
    const journey = UUID.test(journeyId) ? journeys.get(journeyId) : undefined;
    if (!journey || !findGrant(req, key.channel, journeyId, "READ_JOURNEY")) return err(res, 404);
    const kind = match[2] ?? "journey";
    const mode = takeFailure(kind);
    if (mode === "500") return err(res, 500);
    if (mode === "hang") return;

    if (kind === "journey") {
      const { id, type, status, createdAt, updatedAt } = journey;
      return send(res, 200, { id, type, status, createdAt, updatedAt });
    }
    if (kind === "context") {
      const { currentStep, version, refs, updatedAt } = journey.context;
      return send(res, 200, { journeyId, currentStep, version, externalRefs: refs, updatedAt });
    }

    const rawLimit = param("limit");
    const limit = rawLimit === null ? 20 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || (rawLimit !== null && String(limit) !== rawLimit)) return err(res, 400);
    let after = null;
    const cursor = param("cursor");
    if (cursor !== null) {
      try {
        const tuple = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
        if (!Array.isArray(tuple) || tuple.length !== 3 || tuple[0] !== journeyId || !UUID.test(tuple[2]) || new Date(tuple[1]).toISOString() !== tuple[1]) throw new Error("cursor");
        after = { occurredAt: tuple[1], id: tuple[2] };
      } catch { return err(res, 400); }
    }
    const ordered = [...journey.events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id));
    const rest = after ? ordered.filter((e) => e.occurredAt > after.occurredAt || (e.occurredAt === after.occurredAt && e.id > after.id)) : ordered;
    const items = rest.slice(0, limit).map((e) => ({ id: e.id, type: e.type, producerCode: e.producer, occurredAt: e.occurredAt, receivedAt: e.receivedAt, schemaVersion: e.schemaVersion, data: project(e) }));
    const last = rest[limit - 1];
    return send(res, 200, rest.length > limit ? { items, nextCursor: Buffer.from(JSON.stringify([journeyId, last.occurredAt, last.id])).toString("base64url") } : { items });
  }

  return err(res, 404);
}).listen(port, HOST, () => console.log(`orquestador simulado en http://${HOST}:${port}`));
