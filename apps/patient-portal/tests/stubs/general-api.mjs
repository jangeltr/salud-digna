// API general simulada para las pruebas del portal. Solo escucha en 127.0.0.1 y solo tiene datos sintéticos.
// Reproduce las reglas de docs/api-requests.md, api-appointments.md y api-call-center.md.
// Las cuentas usan correos de example.com, y la contraseña y los tokens cambian en cada ejecución (lib/secrets.mjs).
import { createServer } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { HOST, PORTS } from "../lib/config.mjs";
import { mintAssertion } from "../lib/assertions.mjs";
import { assertionChannelKey, testPassword, testToken } from "../lib/secrets.mjs";

const port = PORTS.api;
const PASSWORD = testPassword();
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const isUuid = (v) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;

const studies = [
  { id: uuid(201), name: "Demo Glucosa", description: "Estudio sintético.", price: "120.00", isActive: true },
  { id: uuid(202), name: "Demo Biometría hemática", description: "Estudio sintético.", price: "185.00", isActive: true },
  { id: uuid(203), name: "Demo Perfil de lípidos", description: null, price: "310.50", isActive: true },
];
const clinics = [
  { id: uuid(101), name: "Demo Clínica Alameda", address: "Avenida Ejemplo 101", city: "Ciudad Ejemplo", state: "Estado Ejemplo", isActive: true },
  { id: uuid(102), name: "Demo Clínica Mirador", address: "Calle Ejemplo 202", city: "Ciudad Ejemplo", state: "Estado Ejemplo", isActive: true },
];
const accounts = {
  [testToken("ana")]: { id: uuid(901), email: "ana@example.com", patientId: uuid(911), firstName: "Ana" },
  [testToken("beto")]: { id: uuid(902), email: "beto@example.com", patientId: uuid(912), firstName: "Beto" },
  [testToken("carla")]: { id: uuid(903), email: "carla@example.com", patientId: uuid(913), firstName: "Carla" },
};
const revoked = new Set();
const requests = new Map();
const appointments = new Map();
let calls = {};
let queries = [];
let failures = []; // { op, mode, times }
let lastCode = null;
let assertionTtlSeconds = 300; // vigencia de las acreditaciones que emite; la cambia /__test/assertion-ttl

const count = (key) => { calls[key] = (calls[key] ?? 0) + 1; };
function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...headers });
  res.end(body === undefined ? "" : JSON.stringify(body));
}
const err = (res, status, message) => send(res, status, { message: `CRUDO: ${message}`, error: "Error", statusCode: status });
async function readJson(req) { if (req.parsed !== undefined) return req.parsed; let raw = ""; for await (const c of req) raw += c; try { req.parsed = raw ? JSON.parse(raw) : {}; } catch { req.parsed = null; } return req.parsed; }
let trace = []; // registro completo y ordenado de lo que pide el portal
function takeFailure(op) {
  const f = failures.find((x) => x.op === op && x.times > 0);
  if (!f) return null;
  f.times--;
  return f.mode;
}

function derive(context) {
  if (!context.studyId) return ["SELECT_STUDY", "DRAFT"];
  if (!context.clinicId) return ["SELECT_CLINIC", "IN_PROGRESS"];
  if (!context.scheduledAt) return ["SELECT_DATETIME", "IN_PROGRESS"];
  return ["REVIEW", "PENDING_CONFIRMATION"];
}
const isOpen = (r) => ["DRAFT", "IN_PROGRESS", "PENDING_CONFIRMATION"].includes(r.status);
function snapshot(r) {
  const { id, type, status, currentStep, lastChannel, version, context, createdAt, updatedAt, completedAt } = r;
  return { id, type, status, currentStep, lastChannel, version, context: { ...context }, createdAt, updatedAt, completedAt };
}
function event(r, type, channel, actorRole, payload = {}) {
  r.events.push({ id: randomUUID(), type, createdAt: new Date().toISOString(), channel, actorRole, payload });
}
function touch(r, channel = "WEB") {
  const [step, status] = derive(r.context);
  if (isOpen(r)) { r.currentStep = step; r.status = status; }
  r.version++;
  r.updatedAt = new Date().toISOString();
  if (r.lastChannel !== channel) { event(r, "CHANNEL_SWITCHED", channel, "PATIENT", { from: r.lastChannel, to: channel, version: r.version }); r.lastChannel = channel; }
}
const page = (url, items) => {
  const p = Number(url.searchParams.get("page") ?? 1), l = Number(url.searchParams.get("limit") ?? 20);
  return { items: items.slice((p - 1) * l, p * l), page: p, limit: l, hasMore: items.length > p * l };
};

createServer(async (req, res) => {
  const url = new URL(req.url, "http://stub");
  const p = url.pathname;
  // Latencia simulada de red y servicio, solo si se pide: STUB_LATENCY_MS.
  if (!p.startsWith("/__test/") && Number(process.env.STUB_LATENCY_MS) > 0) await new Promise((r) => setTimeout(r, Number(process.env.STUB_LATENCY_MS)));

  // --- ganchos de prueba -------------------------------------------------
  if (p === "/__test/state") return send(res, 200, { calls, queries: queries.slice(-60), lastCode, appointments: appointments.size });
  if (p === "/__test/trace") { const out = trace; if (url.searchParams.get("clear")) trace = []; return send(res, 200, out); }
  if (p === "/__test/reset-calls") { calls = {}; queries = []; return send(res, 200, {}); }
  if (p === "/__test/requests") return send(res, 200, [...requests.values()].map((r) => ({ ...snapshot(r), owner: r.owner, events: r.events.map((e) => e.type) })));
  if (p === "/__test/fail") { failures.push({ op: url.searchParams.get("op"), mode: url.searchParams.get("mode"), times: Number(url.searchParams.get("times") ?? 1) }); return send(res, 200, {}); }
  if (p === "/__test/clear-failures") { failures = []; return send(res, 200, {}); }
  if (p === "/__test/assertion-ttl") { assertionTtlSeconds = Number(url.searchParams.get("s")); return send(res, 200, {}); }
  if (p === "/__test/revoke") { revoked.add(url.searchParams.get("token")); return send(res, 200, {}); }
  if (p === "/__test/restore") { revoked.delete(url.searchParams.get("token")); return send(res, 200, {}); }
  if (p === "/__test/other-channel") {
    const r = requests.get(url.searchParams.get("id"));
    if (!r) return send(res, 404, {});
    const clinic = url.searchParams.get("clinic");
    if (clinic) { r.context.clinicId = clinic; delete r.context.scheduledAt; }
    const channel = url.searchParams.get("channel") ?? "WHATSAPP";
    touch(r, channel);
    event(r, "REQUEST_CONTEXT_UPDATED", channel, "PATIENT", { version: r.version, currentStep: r.currentStep });
    const minutes = Number(url.searchParams.get("minutesAgo") ?? 0);
    if (minutes) r.updatedAt = new Date(Date.now() - minutes * 60000).toISOString();
    return send(res, 200, snapshot(r));
  }

  const key = `${req.method} ${p.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, "{id}")}`;
  count(key);
  queries.push(`${req.method} ${p}${url.search}`);
  trace.push({ call: `${req.method} ${p}${url.search}`, auth: /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1] ?? null, body: req.method === "GET" ? null : await readJson(req), clientIp: req.headers["x-portal-client-ip"] ?? null, headerNames: Object.keys(req.headers).sort() });

  // --- catálogo y autenticación -------------------------------------------
  if (req.method === "GET" && p === "/api/v1/studies") return send(res, 200, page(url, studies.filter((s) => !url.searchParams.get("q") || s.name.toLowerCase().includes(url.searchParams.get("q").split("~")[0].toLowerCase()))));
  if (req.method === "GET" && p === "/api/v1/clinics" && takeFailure("clinics") === "malformed") {
    // Dato con una forma que el contrato no admite: la dirección como objeto. Sirve para provocar un error de pintado.
    return send(res, 200, { items: [{ ...clinics[0], address: { calle: "Avenida Ejemplo", numero: 101 } }], page: 1, limit: 12, hasMore: false });
  }
  if (req.method === "GET" && p === "/api/v1/clinics") return send(res, 200, page(url, clinics.filter((s) => !url.searchParams.get("q") || s.name.toLowerCase().includes(url.searchParams.get("q").split("~")[0].toLowerCase()))));
  const cat = /^\/api\/v1\/(studies|clinics)\/([^/]+)$/.exec(p);
  if (req.method === "GET" && cat) {
    if (!isUuid(cat[2])) return err(res, 400, "uuid");
    const item = (cat[1] === "studies" ? studies : clinics).find((x) => x.id === cat[2].toLowerCase());
    return item ? send(res, 200, item) : err(res, 404, "no encontrado");
  }
  if (req.method === "POST" && p === "/api/v1/auth/login") {
    const body = await readJson(req);
    const token = Object.keys(accounts).find((t) => accounts[t].email === body?.email);
    if (!token || body.password !== PASSWORD) return err(res, 401, "credenciales");
    return send(res, 200, { accessToken: token, tokenType: "Bearer", expiresIn: 1800, user: { id: accounts[token].id, email: accounts[token].email, role: "PATIENT" } });
  }

  // --- a partir de aquí, sesión de paciente --------------------------------
  const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1];
  const me = token && !revoked.has(token) ? accounts[token] : undefined;
  if (!me) return send(res, 401, { message: "Unauthorized", statusCode: 401 });
  if (req.method === "GET" && p === "/api/v1/auth/me") {
    return send(res, 200, { id: me.id, email: me.email, role: "PATIENT", isActive: true, patientId: me.patientId, patient: { id: me.patientId, firstName: me.firstName, lastName: "Prueba", email: me.email, phone: null } });
  }
  // --- emisor de acreditaciones (docs/api-patient-assertions.md) -----------------------------------------
  // Sesión de paciente, credencial del canal en X-Patient-Assertion-Channel-Key y cuerpo `{}`. El canal sale de la
  // credencial y `customerId` es el UUID de la ficha de paciente, distinto del de la cuenta.
  if (req.method === "POST" && p === "/api/v1/auth/patient-assertions") {
    const forced = takeFailure("assertions");
    if (forced) return err(res, Number(forced), "fallo forzado del emisor");
    if (req.headers["x-patient-assertion-channel-key"] !== assertionChannelKey()) return err(res, 401, "credencial de canal");
    const body = await readJson(req);
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length > 0) return err(res, 400, "cuerpo");
    const assertion = mintAssertion({ channel: "demo-web", customerId: me.patientId, sub: me.id, ttlSeconds: assertionTtlSeconds });
    return send(res, 200, { assertion }, { "Cache-Control": "no-store" });
  }

  const mine = [...requests.values()].filter((r) => r.owner === token).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));

  if (req.method === "POST" && p === "/api/v1/requests") {
    const body = await readJson(req);
    if (body === null || Object.keys(body).some((k) => k !== "type") || (body.type !== undefined && body.type !== "APPOINTMENT")) return err(res, 400, "cuerpo inválido");
    const mode = takeFailure("create");
    if (mode === "before") return err(res, 500, "fallo antes de crear");
    const now = new Date().toISOString();
    const r = { id: randomUUID(), owner: token, type: "APPOINTMENT", status: "DRAFT", currentStep: "SELECT_STUDY", lastChannel: "WEB", version: 1, context: {}, createdAt: now, updatedAt: now, completedAt: null, events: [] };
    requests.set(r.id, r);
    event(r, "REQUEST_CREATED", "WEB", "PATIENT", { version: 1 });
    if (mode === "after") return err(res, 500, "fallo después de crear");
    return send(res, 201, snapshot(r));
  }
  if (req.method === "GET" && p === "/api/v1/requests/pending") {
    if (takeFailure("pending")) return err(res, 500, "fallo al listar");
    return send(res, 200, page(url, mine.filter(isOpen).map(snapshot)));
  }
  if (req.method === "GET" && p === "/api/v1/requests") return send(res, 200, page(url, mine.map(snapshot)));
  if (req.method === "GET" && p === "/api/v1/appointments") return send(res, 200, page(url, [...appointments.values()].filter((a) => a.owner === token).map(({ owner, ...a }) => a)));
  const apt = /^\/api\/v1\/appointments\/([^/]+)$/.exec(p);
  if (req.method === "GET" && apt) {
    const a = appointments.get(apt[1]);
    if (!a || a.owner !== token) return err(res, 404, "cita");
    const { owner, ...rest } = a;
    return send(res, 200, rest);
  }

  const m = /^\/api\/v1\/requests\/([^/]+)(?:\/(context|pause|resume|confirm|journey|assistance-code))?$/.exec(p);
  if (!m) return err(res, 404, `Cannot ${req.method} ${p}`);
  if (!isUuid(m[1])) return err(res, 400, "uuid");
  const r = requests.get(m[1].toLowerCase());
  // Inexistente y ajeno responden igual.
  if (!r || r.owner !== token) return err(res, 404, "Solicitud no encontrada.");
  const action = m[2];

  if (req.method === "GET" && !action) return send(res, 200, snapshot(r));
  if (req.method === "GET" && action === "journey") return send(res, 200, r.events);
  if (req.method === "POST" && action === "assistance-code") {
    if (!isOpen(r)) return err(res, 409, "La solicitud está cerrada.");
    lastCode = randomBytes(16).toString("base64url");
    return send(res, 201, { code: lastCode, expiresAt: new Date(Date.now() + 5 * 60000).toISOString() }, { "Cache-Control": "no-store" });
  }

  const body = await readJson(req);
  if (body === null || !Number.isInteger(body.version) || body.version < 1) return err(res, 400, "version inválida");
  const forced = takeFailure(action);
  if (forced === "400") return err(res, 400, "validación forzada");
  if (forced === "500") return err(res, 500, "fallo forzado");

  if (req.method === "POST" && action === "confirm") {
    const existing = [...appointments.values()].find((a) => a.requestId === r.id);
    if (r.status === "COMPLETED" && existing) { const { owner, ...rest } = existing; return send(res, 200, rest); }
    if (!isOpen(r)) return err(res, 409, "cerrada");
    if (body.version !== r.version) return err(res, 409, "La versión cambió.");
    if (r.status !== "PENDING_CONFIRMATION" || Date.parse(r.context.scheduledAt) <= Date.now()) return err(res, 400, "no está lista");
    const a = { id: randomUUID(), owner: token, requestId: r.id, study: { id: r.context.studyId, name: studies.find((s) => s.id === r.context.studyId).name }, clinic: { id: r.context.clinicId, name: clinics.find((c) => c.id === r.context.clinicId).name }, scheduledAt: r.context.scheduledAt, status: "CONFIRMED", createdAt: new Date().toISOString() };
    appointments.set(a.id, a);
    r.status = "COMPLETED"; r.currentStep = "CONFIRMED"; r.completedAt = a.createdAt; r.version++; r.updatedAt = a.createdAt;
    event(r, "APPOINTMENT_CONFIRMED", "WEB", "PATIENT", { appointmentId: a.id, version: r.version });
    event(r, "REQUEST_STATUS_CHANGED", "WEB", "PATIENT", { from: "PENDING_CONFIRMATION", to: "COMPLETED", version: r.version });
    const { owner, ...rest } = a;
    return send(res, 200, rest);
  }

  if (!isOpen(r)) return err(res, 409, "La solicitud está cerrada.");
  if (body.version !== r.version) return err(res, 409, "La versión cambió. Recupera el estado actualizado de la solicitud.");

  if (req.method === "PATCH" && action === "context") {
    const allowed = ["version", "studyId", "clinicId", "scheduledAt", "notes"];
    if (Object.keys(body).some((k) => !allowed.includes(k))) return err(res, 400, "property should not exist");
    const next = { ...r.context };
    if (body.studyId !== undefined) {
      if (!studies.some((s) => s.id === body.studyId)) return err(res, 400, "estudio inválido");
      if (next.studyId !== body.studyId) { delete next.clinicId; delete next.scheduledAt; }
      next.studyId = body.studyId;
    }
    if (body.clinicId !== undefined) {
      if (!next.studyId || !clinics.some((c) => c.id === body.clinicId)) return err(res, 400, "clínica inválida");
      if (next.clinicId !== body.clinicId) delete next.scheduledAt;
      next.clinicId = body.clinicId;
    }
    if (body.scheduledAt !== undefined) {
      if (body.scheduledAt === null) delete next.scheduledAt;
      else {
        if (!next.clinicId || typeof body.scheduledAt !== "string" || !DATE.test(body.scheduledAt) || !(Date.parse(body.scheduledAt) > Date.now())) return err(res, 400, "fecha inválida");
        next.scheduledAt = new Date(body.scheduledAt).toISOString();
      }
    }
    if (body.notes !== undefined) {
      if (body.notes === null) delete next.notes;
      else { if (typeof body.notes !== "string" || body.notes.length > 500) return err(res, 400, "nota inválida"); next.notes = body.notes; }
    }
    r.context = next;
    touch(r);
    event(r, "REQUEST_CONTEXT_UPDATED", "WEB", "PATIENT", { version: r.version, currentStep: r.currentStep });
    return send(res, 200, snapshot(r));
  }
  if (req.method === "POST" && action === "pause") {
    touch(r);
    event(r, "REQUEST_PAUSED", "WEB", "PATIENT", { version: r.version });
    return send(res, 200, snapshot(r));
  }
  if (req.method === "POST" && action === "resume") {
    // Mismo canal: registra actividad con la misma versión. Otro canal: cambia lastChannel e incrementa.
    if (r.lastChannel !== "WEB") touch(r);
    event(r, "REQUEST_RESUMED", "WEB", "PATIENT", { version: r.version });
    return send(res, 200, snapshot(r));
  }
  return err(res, 404, `Cannot ${req.method} ${p}`);
}).listen(port, HOST, () => console.log(`API general simulada en http://${HOST}:${port}`));
