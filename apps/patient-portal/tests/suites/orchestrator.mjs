// Modo orquestador sin acreditación (PATIENT_IDENTITY_MODE=none), contra el orquestador simulado.
//   node tests/suites/orchestrator.mjs            -> flujo completo
//   node tests/suites/orchestrator.mjs reinicio   -> tras reiniciar el portal: registro conservado, permisos perdidos
// Necesita el paso previo capture.mjs. Nunca imprime claves, permisos, tokens, contraseñas ni códigos.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Browser, assertWiredToStub, clean, orq, orqApi, signIn, stub } from "../lib/client.mjs";
import { DIRS, IDS, UUID } from "../lib/config.mjs";
import { check, eq, finish, section, sleep } from "../lib/report.mjs";
import { channelKey, secretOf, testPassword, testToken } from "../lib/secrets.mjs";

const PHASE = process.argv[2] ?? "principal";
const { GLUCOSA, BIOMETRIA, ALAMEDA, MIRADOR, UNKNOWN, ANA_ACCOUNT, BETO_ACCOUNT } = IDS;
const PASSWORD = testPassword();
const STATE_FILE = join(DIRS.work, "orquestador-estado.json");
const REGISTRY = join(DIRS.data, "web-channel-registry.json");
const OCCURRED = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const OTHER = "Puedes continuar en la app móvil o en Call Center.";
const UUID_ONLY = new RegExp(`^${UUID}$`);
const UUID_ANY = new RegExp(UUID, "g");

const KEY_WEB = channelKey("web");
const KEY_PUBLISH_ONLY = channelKey("publishOnly");
const KEY_EXPIRED = channelKey("expired");
const KEY_OTHER = channelKey("otherChannel");

// Todo lo que el portal envía al navegador: cuerpos y cabeceras.
const seen = [];
Browser.onResponse = (response) => seen.push(response.body, response.headerText());

const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const orqCalls = async () => (await orq("/__test/state")).calls;
const orqTrace = () => orq("/__test/trace?clear=1");
async function reset() {
  await orq("/__test/reset-calls");
  await stub("/__test/reset-calls");
}
const journeys = () => orq("/__test/journeys");
const journey = async (id) => (await journeys()).find((j) => j.id === id);
async function login(browser, email) {
  const r = await signIn(browser, email, PASSWORD);
  if (r.status !== 303) throw new Error(`acceso ${r.status}`);
}
const ridOf = (location) => new RegExp(`/tramite/(${UUID})`).exec(location)[1];
async function start(browser, study) {
  const page = await browser.get(`/tramite/nuevo${study ? `?estudio=${study}` : ""}`);
  const response = await browser.postForm(page.path, page.forms("Empezar")[0]);
  return ridOf(response.location);
}
const items = (response) => [...response.main().matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => clean(m[1]));
const h3s = (response) => [...response.main().matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)].map((m) => clean(m[1]));
const eventsPosted = (trace) => trace.filter((x) => x.op === "POST /api/v1/events");
const ops = (trace) => trace.map((x) => x.op);
async function secrets(withCodes = false) {
  const data = await orq("/__test/secrets");
  return [...data.keys, ...data.grants, ...data.idempotency, ...(withCodes ? data.codes : [])];
}
const registryText = () => readFileSync(REGISTRY, "utf8");
const openInRegistry = (account) => (JSON.parse(registryText()).patients[account] ?? []).filter((e) => !has(e, "closedAt")).map((e) => e.id);
function codeIn(response) {
  const found = /Tu código de continuidad\s+([0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4})\b/.exec(response.text());
  return found ? found[1] : null;
}
const redeemCalls = (trace) => trace.filter((x) => x.op === "POST /api/v1/continuity-codes/redeem");
/** 32 bytes en base64url sin relleno: 43 caracteres que se decodifican y vuelven a codificar igual. */
function wellFormedKey(value) {
  if (typeof value !== "string" || !/^[\w-]{43}$/.test(value)) return false;
  const raw = Buffer.from(value, "base64url");
  return raw.length === 32 && raw.toString("base64url") === value;
}
const leaks = (texts, values) => texts.reduce((sum, text) => sum + values.filter((value) => value && text.includes(value)).length, 0);
const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z");

// =============================================================================
if (PHASE === "reinicio") {
  const saved = JSON.parse(readFileSync(STATE_FILE, "utf8"));
  const { A, B, D, E } = saved;
  const OPEN = saved.anaOpen;
  const ana = new Browser();
  await login(ana, "ana@example.com");

  section("tras reiniciar el portal");
  await reset();
  let r = await ana.get("/continuar");
  const locked = h3s(r).filter((x) => x === "Necesita un permiso nuevo").length;
  check("el registro sobrevive: los trámites abiertos de Ana siguen listados", r.status === 200 && OPEN.every((x) => r.text().includes(x)) && [A, D, E].every((x) => OPEN.includes(x)), r.h1());
  check("los permisos no sobreviven: todos necesitan un permiso nuevo", locked === OPEN.length && !r.text().includes("Estado:") && !r.text().includes("Siguiente paso"), `bloqueados=${locked} de ${OPEN.length}`);
  check("sin datos del trámite: ni estudio ni clínica", !r.text().includes("Demo "));
  check("el trámite cancelado sigue fuera de la lista", !r.body.includes(B));
  check("la lista no llama al orquestador", eq(await orqCalls(), {}), await orqCalls());
  r = await ana.get(`/tramite/${A}`);
  check("abrir un trámite sin permiso: aviso y folio, sin llamar al orquestador", r.h2s().includes("Necesita un permiso nuevo") && r.text().includes(A) && eq(await orqCalls(), {}), r.h2s());
  const beto = new Browser();
  await login(beto, "beto@example.com");
  r = await beto.get(`/tramite/${A}`);
  check("tras reiniciar, el trámite de Ana sigue sin existir para Beto", r.status === 404 && eq(await orqCalls(), {}), r.status);

  section("registro del canal Web en disco");
  const names = readdirSync(DIRS.data);
  check("un único archivo y ningún temporal", eq(names, ["web-channel-registry.json"]), names);
  const raw = readFileSync(REGISTRY, "utf8");
  const data = JSON.parse(raw);
  const entries = Object.values(data.patients).flat();
  check("contiene los dos pacientes por su identificador de cuenta", data.version === 1 && eq(Object.keys(data.patients).sort(), [ANA_ACCOUNT, BETO_ACCOUNT]), Object.keys(data.patients).sort());
  check("cada entrada lleva solo identificador y fechas", entries.every((e) => Object.keys(e).every((k) => ["id", "createdAt", "closedAt"].includes(k)) && UUID_ONLY.test(e.id)), entries.slice(0, 2).map((e) => Object.keys(e).sort()));
  const closed = data.patients[ANA_ACCOUNT].filter((e) => has(e, "closedAt")).map((e) => e.id);
  check("el cancelado quedó anotado como cerrado", eq(closed, [B]), closed.length);
  check("el trámite adoptado con un código está en el registro de Ana", data.patients[ANA_ACCOUNT].some((e) => e.id === saved.adopted));
  check("el registro no contiene claves, permisos ni códigos de continuidad", leaks([raw], await secrets(true)) === 0);

  section("secretos en registros");
  const log = readFileSync(DIRS.portalLog, "utf8");
  const lower = log.toLowerCase();
  check("el registro del servidor no contiene la clave del canal, permisos, claves de idempotencia ni códigos", leaks([log], await secrets(true)) === 0);
  check("ni tokens de sesión ni contraseñas", leaks([log], [testToken("ana"), testToken("beto"), PASSWORD]) === 0);
  check("ni las palabras Authorization, X-Journey-Grant o Idempotency-Key", !lower.includes("authorization") && !lower.includes("x-journey-grant") && !lower.includes("idempotency"));
  check("ni identificadores de trámite", ![A, B, D, E].some((x) => log.includes(x)));
  const conflicts = log.split("conflicto sin cambio de versión").length - 1;
  check("queda constancia del 409 sin cambio de versión", conflicts === 1, conflicts);
  check("lo enviado al navegador en esta fase no contiene secretos", leaks(seen, await secrets()) === 0);
  finish();
}

// =============================================================================
await assertWiredToStub();
const ana = new Browser();
await login(ana, "ana@example.com");

section("inicio del trámite");
await reset();
let r = await ana.get("/tramite/nuevo");
check("texto del flujo sin horario", r.text().includes("Elegirás el estudio y la clínica paso a paso.") && !r.text().includes("horario"), r.text().slice(0, 120));
check("sin promesa de guardar y continuar: enviar a confirmación", r.text().includes("Al terminar lo envías a confirmación") && !r.text().includes("Podrás guardarlo"));
r = await ana.get(`/tramite/nuevo?estudio=${GLUCOSA}`);
check("/tramite/nuevo: muestra el estudio y no llama al orquestador al cargar", r.status === 200 && r.text().includes("Demo Glucosa") && eq(await orqCalls(), {}) && (await journeys()).length === 0, await orqCalls());
r = await ana.postForm(r.path, r.forms("Empezar")[0]);
const A = r.location ? ridOf(r.location) : null;
const P = `/tramite/${A}`;
let t = await orqTrace();
check("crear: 303 a /tramite/<id> y el trámite existe en el orquestador simulado", r.status === 303 && A !== null && (await journeys()).some((j) => j.id === A), r.status);
check("request-started: POST /journeys con el cuerpo exacto, con clave de canal y sin permiso", t[0].op === "POST /api/v1/journeys" && t[0].raw === '{"type":"APPOINTMENT"}' && t[0].hasAuth && !t[0].hasGrant, t[0].op);
const FIRST_KEY = t[0].idempotencyKey;
check("lleva Idempotency-Key: 32 bytes en base64url", wellFormedKey(FIRST_KEY));
let body = t.length > 1 ? JSON.parse(t[1].raw) : {};
check("study-chosen: POST /events con clave de canal y permiso del trámite", t.length === 2 && t[1].op === "POST /api/v1/events" && t[1].hasAuth && t[1].hasGrant, ops(t));
check("cuerpo: solo los seis campos del contrato", eq(Object.keys(body).sort(), ["externalEventId", "journeyId", "occurredAt", "payload", "schemaVersion", "type"]), Object.keys(body).sort());
check("tipo JOURNEY_CONTEXT_UPDATED, esquema 1 y el trámite recién creado", body.type === "JOURNEY_CONTEXT_UPDATED" && body.schemaVersion === 1 && body.journeyId === A);
check("externalEventId: el identificador único del evento", UUID_ONLY.test(body.externalEventId ?? ""));
check("occurredAt en UTC con milisegundos", OCCURRED.test(body.occurredAt ?? ""), body.occurredAt);
check("payload: versión esperada 1 y el estudio", eq(body.payload, { expectedVersion: 1, studyId: GLUCOSA }), body.payload);
let a = await journey(A);
check("el orquestador quedó en IN_PROGRESS, SELECT_CLINIC, versión 2", a.status === "IN_PROGRESS" && a.currentStep === "SELECT_CLINIC" && a.version === 2, a);

section("flujo: estudio, clínica, revisión");
await reset();
r = await ana.get(P);
let text = r.text();
check("paso clínica", r.status === 200 && r.h2s().includes("Elige una clínica") && text.includes("Llevas elegido: Demo Glucosa"), r.h2s());
const steps = [...text.matchAll(/(\d) ?\. ?(Estudio|Clínica|Fecha y hora|Revisión)/g)].map((m) => [m[1], m[2]]);
check("avance con tres pasos, sin fecha y hora", eq(steps, [["1", "Estudio"], ["2", "Clínica"], ["3", "Revisión"]]) && !text.includes("Fecha y hora"), steps);
check("sin «Guardar y continuar después»", !text.includes("Guardar y continuar después"));
check("enlace «Cancelar trámite» y enlace al historial", eq(r.links("Cancelar trámite"), [`${P}?cancelar=1#cancelar`]) && eq(r.links("Ver el historial del trámite"), [`${P}/historial`]), r.links("Cancelar trámite"));
check("lectura: una llamada de estado y una de contexto", eq(await orqCalls(), { "GET /api/v1/journeys/:id": 1, "GET /api/v1/journeys/:id/context": 1 }), await orqCalls());
check("la página del trámite no es almacenable", (r.header("Cache-Control") ?? "").includes("no-store"));
r = await ana.submit(P, ALAMEDA);
a = await journey(A);
check("clinic-chosen: revisión, en curso", r.status === 303 && a.status === "IN_PROGRESS" && a.currentStep === "REVIEW" && a.version === 3 && eq(a.refs, { studyId: GLUCOSA, clinicId: ALAMEDA }), a);
r = await ana.get(P);
text = r.text();
check("revisión con resumen: estudio, clínica y precio", r.h2s().includes("Revisa tu trámite") && ["Demo Glucosa", "Demo Clínica Alameda", "$120.00 MXN"].every((x) => text.includes(x)), r.h2s());
check("sin horario ni nota", !text.includes("Fecha y hora") && !r.body.includes('name="notes"') && !text.includes("Nota para la clínica"));
check("sin confirmación directa ni ayuda de asesor", !text.includes("Confirmar mi cita") && !text.includes("Pedir ayuda a un asesor") && !text.includes("Terminar con un asesor"));
check("un botón «Enviar a confirmación»", r.forms("Enviar a confirmación").length === 1);

section("acciones que este modo oculta, enviadas a mano");
const legacyForms = JSON.parse(readFileSync(join(DIRS.work, "formularios-heredados.json"), "utf8"));
let before = await journey(A);
const generalBefore = (await stub("/__test/trace")).length;
for (const name of ["horario", "nota", "pausa", "reanudar", "confirmar", "ayuda"]) {
  await reset();
  const rr = await ana.postForm(P, legacyForms[name], { replace: { id: A, version: String(before.version) }, fields: name === "nota" ? { notes: "nota de prueba" } : {} });
  const c = await orqCalls();
  check(`«${name}»: el servidor la rechaza sin notificar nada`, rr.status === 303 && (rr.location ?? "").endsWith(P) && eq(c, {}) && eq(await journey(A), before), `${rr.status} ${rr.location} ${JSON.stringify(c)}`);
}
const sent = (await stub("/__test/trace")).slice(generalBefore).map((x) => x.call).filter((call) => call.includes("/requests"));
check("y ninguna llega a la API general", sent.length === 0, sent.slice(0, 2));

section("cambiar un dato ya elegido");
r = await ana.get(`${P}?cambiar=estudio`);
check("cambiar estudio: avisa de que se borra la clínica, sin hablar de horario", r.text().includes("Si cambias el estudio se borra la clínica que elegiste.") && !r.text().includes("el horario"));
await ana.postForm(r.path, r.forms(BIOMETRIA)[0]);
a = await journey(A);
check("otro estudio: el orquestador borra la clínica", eq(a.refs, { studyId: BIOMETRIA }) && a.currentStep === "SELECT_CLINIC", a.refs);
await ana.submit(P, MIRADOR);
r = await ana.get(`${P}?cambiar=clinica`);
check("cambiar clínica: aviso propio del modo sin horario", r.text().includes("Al elegir otra clínica se sustituye la que tenías."));
// La pantalla oculta el botón de la opción elegida: se envía el formulario de otra opción con el valor vigente,
// primero con la versión actual y después con una antigua, como desde otra pestaña.
for (const [label, other, value, key] of [
  ["clinica", ALAMEDA, MIRADOR, "clinicId"],
  ["estudio", GLUCOSA, BIOMETRIA, "studyId"],
]) {
  r = await ana.get(`${P}?cambiar=${label}`);
  check(`misma ${label}: la pantalla no ofrece botón para la opción elegida`, r.forms(value).length === 0 && r.forms(other).length === 1);
  for (const stale of [false, true]) {
    before = await journey(A);
    const replace = { [key]: value, ...(stale ? { version: String(before.version - 1) } : {}) };
    await orqTrace();
    const rr = await ana.postForm(r.path, r.forms(other)[0], { replace });
    const trace = await orqTrace();
    const tag = `misma ${label}${stale ? " con versión antigua" : ""}`;
    check(`${tag}: vuelve al trámite sin aviso`, rr.status === 303 && rr.location.endsWith(P), rr.location);
    check(`${tag}: ningún evento publicado`, eventsPosted(trace).length === 0, ops(trace));
    const now = await journey(A);
    check(`${tag}: versión e historial intactos`, eq(now, before), `${before.version} -> ${now.version}`);
  }
}
r = await ana.get(`${P}?cambiar=clinica`);
r = await ana.get(`${P}?cambiar=estudio`);
await reset();
let rr = await ana.postForm(r.path, r.forms(GLUCOSA)[0], { replace: { studyId: UNKNOWN } });
check("un estudio que no está en el catálogo no se publica", (rr.location ?? "").includes("aviso=invalido") && !has(await orqCalls(), "POST /api/v1/events"), `${rr.location}`);

section("los dos casos de 409");
r = await ana.get(P);
const staleForm = r.forms("Enviar a confirmación")[0];
let v = (await journey(A)).version;
await orq(`/__test/other-channel?journey=${A}&clinicId=${ALAMEDA}`);
await reset();
rr = await ana.postForm(P, staleForm);
t = await orqTrace();
a = await journey(A);
check("versión obsoleta: 409, el adaptador vuelve a leer el contexto y devuelve conflicto", eq(ops(t), ["POST /api/v1/events", "GET /api/v1/journeys/:id/context"]) && (rr.location ?? "").includes("aviso=cambio"), `${ops(t)} ${rr.location}`);
check("nada cambió en el orquestador", a.status === "IN_PROGRESS" && a.version === v + 1, a);
r = await ana.follow(rr);
check("la pantalla avisa y muestra el estado vigente", r.text().includes("Tu trámite cambió desde otro canal") && r.text().includes("Demo Clínica Alameda"));
const fresh = r.forms("Enviar a confirmación")[0];
await orq(`/__test/other-channel?journey=${A}&to=PENDING_CONFIRMATION`);
v = (await journey(A)).version;
await reset();
rr = await ana.postForm(P, fresh, { replace: { version: String(v) } });
t = await orqTrace();
check("transición inválida con la versión vigente: también conflicto, tras releer el contexto", eq(ops(t), ["POST /api/v1/events", "GET /api/v1/journeys/:id/context"]) && (rr.location ?? "").includes("aviso=cambio") && (await journey(A)).version === v, `${ops(t)} ${rr.location}`);

section("enviar a confirmación");
r = await ana.get(P);
check("pendiente por otro canal: el portal lo muestra sin botón de envío", r.h2s().includes("Pendiente de confirmación") && r.forms("Enviar a confirmación").length === 0, r.h2s());
r = await ana.get(`${P}?cambiar=clinica`);
await ana.postForm(r.path, r.forms(MIRADOR)[0]);
a = await journey(A);
check("cambiar un dato devuelve el trámite a revisión", a.status === "IN_PROGRESS" && a.currentStep === "REVIEW" && a.refs.clinicId === MIRADOR, a);
v = a.version;
await reset();
rr = await ana.submit(P, "Enviar a confirmación");
let posted = eventsPosted(await orqTrace());
body = posted.length ? JSON.parse(posted[0].raw) : {};
check("confirmation-requested: JOURNEY_STATUS_CHANGED a PENDING_CONFIRMATION con la versión vigente", posted.length === 1 && body.type === "JOURNEY_STATUS_CHANGED" && eq(body.payload, { expectedVersion: v, to: "PENDING_CONFIRMATION" }), body.payload);
check("redirige con el aviso de envío", rr.status === 303 && rr.location.endsWith(`${P}?aviso=enviado`) && (await journey(A)).status === "PENDING_CONFIRMATION", rr.location);
r = await ana.follow(rr);
text = r.text();
check("«Pendiente de confirmación» con el aviso", r.h2s().includes("Pendiente de confirmación") && text.includes("Tu trámite se envió a confirmación."), r.h2s());
check("folio del trámite con botón de copiar", text.includes("Folio del trámite") && text.includes(A) && text.includes("Copiar folio"));
check(`texto «${OTHER}»`, text.includes(OTHER));
check("resumen sin fecha y sin botón de envío", text.includes("Demo Clínica Mirador") && !text.includes("Fecha y hora") && r.forms("Enviar a confirmación").length === 0);
check("sigue pudiendo cancelar", eq(r.links("Cancelar trámite"), [`${P}?cancelar=1#cancelar`]));
r = await ana.get("/continuar");
text = r.text();
check("/continuar: lista del registro, con su texto", r.status === 200 && text.includes("Los trámites abiertos que empezaste en este portal o trajiste con un código de continuidad.") && !text.includes("WhatsApp o con un asesor"));
check("con permiso vigente muestra el estado", text.includes("Demo Biometría hemática") && text.includes("Estado: Pendiente de confirmación") && eq(r.links("Ver este trámite"), [P]), text.slice(0, 200));
check("sin formulario de reanudar: no hay pausa", r.forms("Continuar este trámite").length === 0);

section("historial");
await reset();
r = await ana.get(`${P}/historial`);
let line = items(r);
check("historial: 200 con una sola llamada, la del historial", r.status === 200 && eq(await orqCalls(), { "GET /api/v1/journeys/:id/history": 1 }), await orqCalls());
// La creación y el primer evento pueden caer en el mismo milisegundo; el historial desempata por identificador.
const createdLine = line.slice(0, 2).find((x) => x.startsWith("Trámite creado")) ?? "";
check("empieza por «Trámite creado», en la web y con fecha (o empata en el mismo milisegundo con el primer evento)", createdLine.startsWith("Trámite creado En la web · ") && /\d{4}/.test(createdLine), line[0] ?? "");
check("selección actualizada con su siguiente paso", line.join(" | ").includes("Selección actualizada Siguiente paso: Clínica. En la web"), line[1] ?? "");
check("eventos de otro canal con su nombre", line.some((x) => x.includes("En WhatsApp")));
check("termina por el envío a confirmación", (line.at(-1) ?? "").startsWith("Enviado a confirmación De «En curso» a «Pendiente de confirmación». En la web"), line.at(-1) ?? "");
check("hora del centro de México indicada", r.text().includes("Hora del centro de México"));
await orq(`/__test/seed-events?journey=${A}&count=25`);
r = await ana.get(`${P}/historial`);
const more = r.links("Ver eventos posteriores");
check("paginación: 20 eventos y enlace a los posteriores", items(r).length === 20 && more.length === 1, `${items(r).length} ${more.length}`);
const r2 = more.length ? await ana.get(more[0]) : r;
const line2 = items(r2);
check("segunda página: el resto, con canal y tipo desconocidos mostrados tal cual", line2.length > 0 && line2.length <= 20 && line2.some((x) => x.startsWith("Otro evento En el canal demo-kiosko")) && r2.links("Volver al inicio").length === 1, line2.length);
const r3 = await ana.get(`${P}/historial?cursor=abc123`);
check("cursor que el orquestador no reconoce: vuelve al inicio del historial", [307, 308].includes(r3.status) && (r3.location ?? "").endsWith(`${P}/historial`), `${r3.status} ${r3.location}`);

section("tiempo de espera agotado (cada caso tarda unos segundos)");
await reset();
const B = await start(ana);
const PB = `/tramite/${B}`;
const second = (await orqTrace()).filter((x) => x.op === "POST /api/v1/journeys").map((x) => x.idempotencyKey);
check("cada trámite nuevo lleva su propia clave de idempotencia", second.length === 1 && wellFormedKey(second[0]) && second[0] !== FIRST_KEY);
await orq("/__test/fail?op=events&mode=hang-after&times=1");
await reset();
rr = await ana.submit(PB, GLUCOSA);
posted = eventsPosted(await orqTrace());
const b = await journey(B);
check("respuesta perdida: un único reenvío, idéntico byte a byte", posted.length === 2 && posted[0].raw === posted[1].raw, `${posted.length} intentos`);
check("el reenvío lleva el mismo externalEventId y el mismo occurredAt", posted.length === 2 && JSON.parse(posted[0].raw).externalEventId === JSON.parse(posted[1].raw).externalEventId);
check("el evento se aplicó una sola vez y la acción termina bien", b.version === 2 && b.events.filter((e) => e === "JOURNEY_CONTEXT_UPDATED").length === 1 && rr.location.endsWith(PB), `${b.version} ${rr.location}`);
await orq("/__test/fail?op=events&mode=hang&times=2");
await reset();
rr = await ana.submit(PB, ALAMEDA);
posted = eventsPosted(await orqTrace());
check("sin respuesta dos veces: exactamente dos intentos idénticos y aviso de servicio", posted.length === 2 && posted[0].raw === posted[1].raw && (rr.location ?? "").includes("aviso=servicio") && (await journey(B)).version === 2, `${posted.length} ${rr.location}`);
await orq("/__test/clear-failures");

section("crear con resultado incierto: reenvío con la misma Idempotency-Key");
const creations = (trace) => trace.filter((x) => x.op === "POST /api/v1/journeys");
const ids = async () => new Set((await journeys()).map((j) => j.id));
let known = await ids();
await orq("/__test/fail?op=create&mode=hang-after&times=1");
r = await ana.get("/tramite/nuevo");
const startForm = r.forms("Empezar")[0];
await reset();
rr = await ana.postForm(r.path, startForm);
let sentCreations = creations(await orqTrace());
let created = (await journeys()).map((j) => j.id).filter((id) => !known.has(id));
check("respuesta perdida: el portal reenvía una vez, con la misma clave y el mismo cuerpo", sentCreations.length === 2 && sentCreations[0].idempotencyKey === sentCreations[1].idempotencyKey && sentCreations[0].raw === sentCreations[1].raw, `${sentCreations.length} envíos`);
check("recupera el mismo trámite: uno solo creado y el paciente entra en él", created.length === 1 && rr.status === 303 && (rr.location ?? "").endsWith(`/tramite/${created[0] ?? ""}`), `${created.length} creados, ${rr.status}`);
check("el trámite recuperado llega con permiso: se puede leer", (await ana.follow(rr)).h2s().includes("Elige un estudio"));
known = await ids();
await orq("/__test/fail?op=create&mode=hang&times=2");
await reset();
rr = await ana.postForm(r.path, startForm);
sentCreations = creations(await orqTrace());
const LOST_KEY = sentCreations.length ? sentCreations[0].idempotencyKey : null;
check("sin respuesta dos veces: dos envíos con la misma clave, nada creado", sentCreations.length === 2 && sentCreations[1].idempotencyKey === LOST_KEY && eq([...(await ids())].sort(), [...known].sort()), `${sentCreations.length} envíos`);
check("aviso al paciente: puede reintentar y no se duplicará", rr.status === 200 && rr.text().includes("no pudimos confirmar si el trámite se creó") && rr.text().includes("no se duplicará") && rr.forms("Empezar").length === 1, rr.text().slice(-170));
await reset();
rr = await ana.postForm(r.path, startForm);
sentCreations = creations(await orqTrace());
created = (await journeys()).map((j) => j.id).filter((id) => !known.has(id));
check("el siguiente intento del paciente reutiliza esa misma clave y crea el trámite", sentCreations.length === 1 && sentCreations[0].idempotencyKey === LOST_KEY && created.length === 1 && rr.status === 303, `${sentCreations.length} envíos, ${created.length} creados`);
known = await ids();
await orq("/__test/fail?op=create&mode=hang-after&times=1");
await orq("/__test/fail?op=create&mode=hang&times=1");
rr = await ana.postForm(r.path, startForm);
created = (await journeys()).map((j) => j.id).filter((id) => !known.has(id));
check("creado pero sin respuesta en los dos envíos: el paciente recibe el aviso", rr.status === 200 && rr.text().includes("no pudimos confirmar si el trámite se creó") && created.length === 1, `${rr.status} ${created.length}`);
rr = await ana.postForm(r.path, startForm);
const afterIds = (await journeys()).map((j) => j.id).filter((id) => !known.has(id));
check("su reintento recupera ese mismo trámite: ni huérfano ni duplicado", eq(afterIds, created) && rr.status === 303 && (rr.location ?? "").endsWith(`/tramite/${created[0] ?? ""}`), `${afterIds.length} creados, ${rr.status}`);
await orq("/__test/clear-failures");

section("401 y 403 del orquestador");
await orq("/__test/fail?op=auth&mode=401&times=2");
r = await ana.get(PB);
check("401 al leer: servicio no disponible", r.h1() === "Servicio no disponible", r.h1());
await orq("/__test/clear-failures");
r = await ana.get("/perfil");
check("la sesión del paciente sigue abierta", r.status === 200 && r.text().includes("ana@example.com") && ana.token() !== null, r.status);
let page = await ana.get(PB);
let form = page.forms(ALAMEDA)[0];
// Antes de publicar, la acción lee el trámite (estado y contexto) para no publicar una selección sin cambios:
// el 403 se fuerza en esas dos lecturas y en la publicación.
await orq("/__test/fail?op=auth&mode=403&times=3");
await orqTrace();
rr = await ana.postForm(PB, form);
const trace403 = await orqTrace();
check("403 al publicar: la publicación llegó al orquestador", eventsPosted(trace403).length === 1, ops(trace403));
check("403 al publicar: aviso de servicio, sin cerrar la sesión", (rr.location ?? "").includes("aviso=servicio") && !(rr.location ?? "").includes("/acceso") && ana.token() !== null, rr.location);
await orq("/__test/clear-failures");
for (const status of ["401", "403"]) {
  r = await ana.get("/tramite/nuevo");
  known = await ids();
  await orq(`/__test/fail?op=auth&mode=${status}&times=1`);
  await reset();
  rr = await ana.postForm(r.path, r.forms("Empezar")[0]);
  sentCreations = creations(await orqTrace());
  const words = rr.text().toLowerCase();
  check(`${status} al crear: un solo envío, nada creado y sin cerrar la sesión`, sentCreations.length === 1 && eq([...(await ids())].sort(), [...known].sort()) && ana.token() !== null, `${sentCreations.length} envíos`);
  check(`${status} al crear: el mensaje no habla de resultado incierto`, rr.status === 200 && rr.text().includes("No pudimos crear el trámite.") && !words.includes("no pudimos confirmar") && !words.includes("duplicará"), rr.text().slice(-120));
  await orq("/__test/clear-failures");
}

section("un paciente no ve ni modifica el trámite de otro");
const beto = new Browser();
await login(beto, "beto@example.com");
await reset();
r = await beto.get(P);
const rHistory = await beto.get(`${P}/historial`);
const missing = await beto.get("/tramite/00000000-0000-4000-8000-00000000dead");
check("trámite ajeno: 404 en la página y en el historial", r.status === 404 && rHistory.status === 404, `${r.status} ${rHistory.status}`);

/** HTML sin lo que cambia en cada respuesta: identificadores, nonce y el orden de los fragmentos del flujo de React. */
function flightFree(response, html) {
  const found = /'nonce-([^']+)'/.exec(response.header("Content-Security-Policy") ?? "");
  if (found) html = html.replaceAll(found[1], "NONCE");
  const chunks = [...html.matchAll(/self\.__next_f\.push\(([\s\S]*?)\)<\/script>/g)].map((m) => m[1]);
  const rest = html.replace(/self\.__next_f\.push\([\s\S]*?\)<\/script>/g, "");
  const lines = chunks.flatMap((chunk) => chunk.split("\\n")).sort();
  return (rest + lines.join("\n")).replace(UUID_ANY, "ID");
}
const comparable = (response) => flightFree(response, response.main());

check("404 idéntico para trámite ajeno e inexistente", comparable(r) === comparable(missing));
check("sin una sola llamada al orquestador", eq(await orqCalls(), {}), await orqCalls());
const C = await start(beto);
page = await beto.get(`/tramite/${C}`);
form = page.forms(GLUCOSA)[0];
before = await journey(A);
await reset();
rr = await beto.postForm(`/tramite/${C}`, form, { replace: { id: A, version: String(before.version) } });
check("acción de Beto apuntando al trámite de Ana: no encontrado, sin llamar al orquestador", (rr.location ?? "").endsWith(P) && eq(await orqCalls(), {}) && eq(await journey(A), before), `${rr.location} ${JSON.stringify(await orqCalls())}`);
check("y la página a la que llega responde 404", (await beto.follow(rr)).status === 404);
r = await beto.get("/continuar");
check("la lista de Beto tiene su trámite y no el de Ana", !r.body.includes(A) && r.text().includes("Trámite sin estudio elegido"));
check("Ana tampoco ve el de Beto", (await ana.get(`/tramite/${C}`)).status === 404 && !(await ana.get("/continuar")).body.includes(C));

section("cancelar con confirmación previa");
r = await ana.get(PB);
check("sin pedirlo no existe el formulario que cancela", r.forms("cancelar el trámite").length === 0 && eq(r.links("Cancelar trámite"), [`${PB}?cancelar=1#cancelar`]));
r = await ana.get(`${PB}?cancelar=1`);
check("confirmación previa: pregunta, advertencia y dos salidas", r.text().includes("¿Cancelar este trámite?") && r.text().includes("no se puede deshacer") && r.forms("Sí, cancelar el trámite").length === 1 && eq(r.links("No, conservar el trámite"), [PB]));
v = (await journey(B)).version;
await reset();
rr = await ana.postForm(r.path, r.forms("Sí, cancelar el trámite")[0]);
posted = eventsPosted(await orqTrace());
body = posted.length ? JSON.parse(posted[0].raw) : {};
check("request-cancelled: JOURNEY_STATUS_CHANGED a CANCELLED", posted.length === 1 && eq(body.payload, { expectedVersion: v, to: "CANCELLED" }) && (await journey(B)).status === "CANCELLED", body.payload);
r = await ana.follow(rr);
check("aviso de cancelación y trámite cerrado, ya sin opción de cancelar", rr.location.includes("aviso=cancelado") && r.text().includes("Trámite cancelado.") && r.h2s().includes("Trámite cerrado") && r.links("Cancelar trámite").length === 0, r.h2s());
check("un trámite cancelado sale de /continuar", !(await ana.get("/continuar")).body.includes(B));

section("permiso ausente o vencido");
await orq("/__test/grant-ttl?ms=2500");
const D = await start(ana, GLUCOSA);
const PD = `/tramite/${D}`;
await orq("/__test/grant-ttl?ms=300000");
page = await ana.get(PD);
form = page.forms(ALAMEDA)[0];
check("con el permiso aún vigente el trámite se ve", page.h2s().includes("Elige una clínica"));
await sleep(3000);
await reset();
r = await ana.get(PD);
text = r.text();
check("permiso vencido: «Necesita un permiso nuevo», con folio", r.status === 200 && r.h2s().includes("Necesita un permiso nuevo") && text.includes(D) && text.includes(OTHER), r.h2s());
check("sin datos del trámite", !text.includes("Demo Glucosa") && !text.includes("Elige una clínica"));
rr = await ana.postForm(PD, form);
const rDHistory = await ana.get(`${PD}/historial`);
check("una acción sobre ese trámite no publica nada", (rr.location ?? "").endsWith(PD));
check("el historial responde lo mismo", rDHistory.h2s().includes("Necesita un permiso nuevo"));
check("el portal sabe que venció: ninguna llamada al orquestador", eq(await orqCalls(), {}), await orqCalls());
r = await ana.get("/continuar");
text = r.text();
check("/continuar: sin permiso, «Necesita un permiso nuevo» y ningún dato del trámite", h3s(r).includes("Necesita un permiso nuevo") && text.includes(D) && !text.includes("Demo Glucosa"), h3s(r));
check("y el que sí tiene permiso conserva su estado y sus datos", text.includes("Estado: Pendiente de confirmación") && text.includes("Demo Biometría hemática"));
r = await ana.get("/tramite/nuevo");
const expectedOpen = openInRegistry(ANA_ACCOUNT).length;
check("/tramite/nuevo cuenta los trámites abiertos del registro, con y sin permiso", expectedOpen >= 2 && r.text().includes(`Tienes ${expectedOpen} trámites abiertos`), `${expectedOpen} ${r.h2s()}`);
const E = await start(ana);
await orq(`/__test/revoke-grants?journey=${E}`);
await reset();
r = await ana.get(`/tramite/${E}`);
const firstCalls = await orqCalls();
await reset();
const rE2 = await ana.get(`/tramite/${E}`);
check("permiso revocado en el orquestador: su 404 se muestra como permiso nuevo, no como «no encontrado»", r.status === 200 && r.h2s().includes("Necesita un permiso nuevo") && Object.keys(firstCalls).length === 2, `${r.status} ${JSON.stringify(firstCalls)}`);
check("el permiso rechazado se olvida: la siguiente lectura ya no llama", rE2.h2s().includes("Necesita un permiso nuevo") && eq(await orqCalls(), {}), await orqCalls());

section("continuar en otro canal: emitir un código");
const groupedCode = (code) => `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}`;
const otherEvent = (journeyId, eventId, payload, kind = "JOURNEY_CONTEXT_UPDATED") => ({ journeyId, externalEventId: eventId, type: kind, schemaVersion: 1, occurredAt: nowIso(), payload });
const EMIT = "POST /api/v1/journeys/:id/continuity-codes";
await orq("/__test/reset-redeem-limit");
const W = await start(ana);
const PW = `/tramite/${W}`;
r = await ana.get(PW);
check("sin estudio todavía no se ofrece", r.h2s().includes("Elige un estudio") && !r.text().includes("Continuar en otro canal"));
await ana.submit(PW, GLUCOSA);
await reset();
r = await ana.get(PW);
check("con estudio se ofrece ya en el paso de clínica, no solo al final", r.h2s().includes("Elige una clínica") && r.h2s().includes("Continuar en otro canal") && r.forms("Generar código de continuidad").length === 1, r.h2s());
check("cargar la página no emite ningún código", !has(await orqCalls(), EMIT) && !r.text().includes("Tu código de continuidad"), await orqCalls());
await reset();
rr = await ana.postForm(PW, r.forms("Generar código de continuidad")[0]);
const emitted = (await orqTrace()).filter((x) => x.op === EMIT);
const CODE1 = codeIn(rr);
check("al pulsar: una sola emisión, con clave de canal y permiso del trámite, sin cuerpo", emitted.length === 1 && emitted[0].hasAuth && emitted[0].hasGrant && emitted[0].raw === "", emitted.length);
check("muestra el código de 12 caracteres en grupos de cuatro", CODE1 !== null);
check("muestra cuándo vence", /Vence a las \d{2}:\d{2}, hora del centro de México, en (unos \d minutos|un minuto|menos de un minuto)\./.test(rr.text()), rr.text().slice(-200));
check("indica que es de un solo uso y ofrece copiarlo", rr.text().includes("Es de un solo uso.") && rr.text().includes("Copiar código"));
check("no viaja en la URL ni en una cookie: llega en la respuesta de la acción", rr.status === 200 && rr.location === null && rr.setCookies.length === 0);
r = await ana.get(PW);
check("no se guarda en el navegador: al recargar ya no está", CODE1 !== null && !r.body.includes(CODE1) && !r.text().includes("Tu código de continuidad"));
check("ni en el registro del canal Web", CODE1 !== null && !registryText().includes(CODE1) && !registryText().includes(CODE1.replaceAll("-", "")));
rr = await ana.postForm(PW, r.forms("Generar código de continuidad")[0]);
const CODE2 = codeIn(rr);
check("cada pulsación emite un código distinto", CODE2 !== null && CODE2 !== CODE1 && rr.text().includes("Generar otro código"));
r = await beto.get(PW);
check("otro paciente no puede emitir códigos de este trámite: para él no existe", r.status === 404);
await orq("/__test/fail?op=continuity&mode=503&times=1");
r = await ana.get(PW);
rr = await ana.postForm(PW, r.forms("Generar código de continuidad")[0]);
check("si el orquestador no puede emitir: mensaje genérico, sin código", rr.status === 200 && rr.text().includes("No pudimos generar el código.") && codeIn(rr) === null);
await orq("/__test/clear-failures");

section("recorrido de la demo: Web elige estudio, emite el código y otro canal continúa");
let [s, redeemed] = await orqApi("POST", "/continuity-codes/redeem", { key: KEY_OTHER, body: { code: CODE1 } });
check("otro canal canjea el código de Web: mismo trámite y permiso propio", s === 201 && redeemed.journeyId === W && eq(Object.keys(redeemed).sort(), ["grant", "grantExpiresAt", "journeyId"]), s);
let ctx;
[s, ctx] = await orqApi("GET", `/journeys/${W}/context`, { key: KEY_OTHER, grant: redeemed.grant });
check("otro canal lee el contexto con el estudio elegido en Web", s === 200 && eq(ctx.externalRefs, { studyId: GLUCOSA }) && ctx.currentStep === "SELECT_CLINIC", `${s} ${ctx.currentStep}`);
[s] = await orqApi("POST", "/events", { key: KEY_OTHER, grant: redeemed.grant, body: otherEvent(W, "otro-canal-clinica-01", { expectedVersion: ctx.version, clinicId: ALAMEDA }) });
check("otro canal continúa el trámite: elige la clínica", s === 201 && (await journey(W)).currentStep === "REVIEW", s);
r = await ana.get(PW);
check("Web ve el avance hecho en el otro canal", r.h2s().includes("Revisa tu trámite") && r.text().includes("Demo Clínica Alameda"), r.h2s());
line = items(await ana.get(`${PW}/historial`));
check("el historial nombra los dos canales", line.some((x) => x.includes("En la web")) && line.some((x) => x.includes("En WhatsApp")), line.map((x) => x.split(" · ")[0]).join(" | "));
check("el código ya usado no sirve otra vez", (await orqApi("POST", "/continuity-codes/redeem", { key: KEY_OTHER, body: { code: CODE1 } }))[0] === 404);

section("tengo un código de continuidad");
const SINGLE = "El código no es válido, venció o ya se usó.";
await orq("/__test/reset-redeem-limit");
r = await ana.get("/continuar");
const redeemForm = r.forms('name="codigo"')[0] ?? "";
check("/continuar ofrece el campo", r.h2s().includes("Tengo un código de continuidad") && redeemForm !== "", r.h2s());
check("el campo no se autocompleta y limita la longitud", redeemForm.toLowerCase().includes('autocomplete="off"') && redeemForm.toLowerCase().includes('maxlength="20"'));
let other;
[s, other] = await orqApi("POST", "/journeys", { key: KEY_OTHER, body: { type: "APPOINTMENT" }, idem: secretOf("tramite-de-otro-canal-1") });
const X = other.id;
await orqApi("POST", "/events", { key: KEY_OTHER, grant: other.grant, body: otherEvent(X, "otro-canal-estudio-01", { expectedVersion: 1, studyId: BIOMETRIA }) });
let issued;
[s, issued] = await orqApi("POST", `/journeys/${X}/continuity-codes`, { key: KEY_OTHER, grant: other.grant });
const OTHER_CODE = issued.code ?? "";
check("otro canal emite un código para un trámite empezado allí", s === 201 && /^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(OTHER_CODE), s);
check("antes del canje ese trámite no existe para Ana", (await ana.get(`/tramite/${X}`)).status === 404);
await reset();
rr = await ana.postForm("/continuar", redeemForm, { fields: { codigo: `  ${OTHER_CODE.toLowerCase().replaceAll("-", " ")} ` } });
let sentRedeem = redeemCalls(await orqTrace());
check("canje: el portal normaliza lo escrito y envía solo el código", sentRedeem.length === 1 && eq(JSON.parse(sentRedeem[0].raw), { code: OTHER_CODE.replaceAll("-", "") }), `${sentRedeem.length} llamadas`);
check("el canje lleva la clave del canal y ningún permiso de trámite", sentRedeem.length === 1 && sentRedeem[0].hasAuth && !sentRedeem[0].hasGrant);
check("lleva al trámite adoptado, sin el código en la URL", rr.status === 303 && (rr.location ?? "").endsWith(`/tramite/${X}`), `${rr.status} ${rr.location}`);
r = await ana.follow(rr);
check("el trámite del otro canal se ve en Web con lo elegido allí", r.h2s().includes("Elige una clínica") && r.text().includes("Demo Biometría hemática"), r.h2s());
check("queda en el registro de Ana y en su lista", openInRegistry(ANA_ACCOUNT).includes(X) && (await ana.get("/continuar")).body.includes(X));
check("el permiso del canje no está en el registro", leaks([registryText()], await secrets(true)) === 0);
check("y el trámite sigue sin existir para Beto", (await beto.get(`/tramite/${X}`)).status === 404);
rr = await ana.submit(`/tramite/${X}`, MIRADOR);
check("Ana continúa en Web el trámite adoptado", rr.status === 303 && (await journey(X)).refs.clinicId === MIRADOR);

const FORCED = "0101ABCD0011";
[s, other] = await orqApi("POST", "/journeys", { key: KEY_OTHER, body: { type: "APPOINTMENT" }, idem: secretOf("tramite-de-otro-canal-2") });
const Y = other.id;
await orq(`/__test/issue-code?journey=${Y}&channel=demo-whatsapp&code=${FORCED}`);
await reset();
rr = await ana.postForm("/continuar", redeemForm, { fields: { codigo: "oioi-abcd-ooLL" } });
sentRedeem = redeemCalls(await orqTrace());
check("letras parecidas a cifras: O pasa a 0, e I y L pasan a 1", sentRedeem.length === 1 && eq(JSON.parse(sentRedeem[0].raw), { code: FORCED }) && rr.status === 303 && (rr.location ?? "").endsWith(`/tramite/${Y}`), rr.status);
await orq(`/__test/issue-code?journey=${D}&channel=demo-whatsapp&code=7777WXYZ8888`);
check("antes: el trámite con permiso vencido no se puede leer", (await ana.get(PD)).h2s().includes("Necesita un permiso nuevo"));
rr = await ana.postForm("/continuar", redeemForm, { fields: { codigo: "7777-WXYZ-8888" } });
check("un código de otro canal devuelve el acceso a un trámite propio con el permiso vencido", rr.status === 303 && (rr.location ?? "").endsWith(PD) && (await ana.follow(rr)).h2s().includes("Elige una clínica"), `${rr.status} ${rr.location}`);

section("código inválido, vencido o ya usado: un solo mensaje y límite de intentos");
await orq("/__test/reset-redeem-limit");
const cases = [
  ["emitido en este mismo canal", CODE2, 1],
  ["ya usado", OTHER_CODE, 1],
  ["desconocido", "ZZZZ-ZZZZ-ZZZZ", 1],
  ["demasiado corto", "abc", 0],
  ["con un carácter fuera del alfabeto", "UUUU-UUUU-UUUU", 0],
];
const messages = new Set();
for (const [name, typed, expectedCalls] of cases) {
  await reset();
  rr = await ana.postForm("/continuar", redeemForm, { fields: { codigo: typed } });
  const callsMade = redeemCalls(await orqTrace()).length;
  const alert = /<p id="codigo-error"[^>]*>([\s\S]*?)<\/p>/.exec(rr.body);
  messages.add(alert ? clean(alert[1]) : "");
  check(`código ${name}: mensaje único${expectedCalls ? "" : ", sin llamar al orquestador"}`, rr.status === 200 && rr.text().includes(SINGLE) && callsMade === expectedCalls, `${rr.status} llamadas=${callsMade}`);
  check(`código ${name}: lo escrito no vuelve en la página`, !rr.body.includes(typed));
}
check("los cinco casos muestran exactamente el mismo texto", messages.size === 1 && [...messages][0].includes(SINGLE), messages.size);
await reset();
rr = await ana.postForm("/continuar", redeemForm, { fields: { codigo: "ZZZZ-ZZZZ-ZZZZ" } });
check("tras cinco fallos, el sexto intento se bloquea sin llamar al orquestador", rr.status === 200 && rr.text().includes("Demasiados intentos.") && redeemCalls(await orqTrace()).length === 0, rr.text().slice(-120));
[s, other] = await orqApi("POST", "/journeys", { key: KEY_OTHER, body: { type: "APPOINTMENT" }, idem: secretOf("tramite-de-otro-canal-3") });
const Z = other.id;
await orq(`/__test/issue-code?journey=${Z}&channel=demo-whatsapp&code=2222PQRS3333`);
await reset();
rr = await ana.postForm("/continuar", redeemForm, { fields: { codigo: "2222-PQRS-3333" } });
check("durante el bloqueo tampoco pasa un código válido, que queda sin consumir", rr.text().includes("Demasiados intentos.") && redeemCalls(await orqTrace()).length === 0 && !(await orq("/__test/codes")).some((c) => c.journeyId === Z && c.consumed));
r = await beto.get("/continuar");
const betoForm = r.forms('name="codigo"')[0];
await reset();
rr = await beto.postForm("/continuar", betoForm, { fields: { codigo: "ZZZZ-ZZZZ-ZZZZ" } });
check("el límite es por paciente: Beto no está bloqueado", rr.text().includes(SINGLE) && redeemCalls(await orqTrace()).length === 1);
await orq("/__test/fail?op=redeem&mode=429&times=1");
rr = await beto.postForm("/continuar", betoForm, { fields: { codigo: "2222-PQRS-3333" } });
check("429 del orquestador: aviso de espera, distinto del de código inválido", rr.text().includes("Hay demasiados canjes en este momento.") && !rr.text().includes(SINGLE));
await orq("/__test/fail?op=redeem&mode=503&times=1");
rr = await beto.postForm("/continuar", betoForm, { fields: { codigo: "2222-PQRS-3333" } });
check("503 del orquestador: no se pudo comprobar, sin cerrar la sesión", rr.text().includes("No pudimos comprobar el código.") && beto.token() !== null);
await orq("/__test/clear-failures");
rr = await beto.postForm("/continuar", betoForm, { fields: { codigo: "2222-PQRS-3333" } });
check("los avisos del orquestador no gastan intentos del paciente: el código válido entra después", rr.status === 303 && (rr.location ?? "").endsWith(`/tramite/${Z}`), `${rr.status} ${rr.location}`);
const anon = new Browser();
r = await anon.get("/continuar");
check("sin sesión, /continuar lleva a /acceso: el canje exige sesión", [302, 307].includes(r.status) && (r.location ?? "").includes("/acceso"), r.status);

section("reglas del orquestador simulado, por llamada directa");
const IDEM = secretOf("clave-de-idempotencia-de-prueba");
let createdJourney;
[s, createdJourney] = await orqApi("POST", "/journeys", { key: KEY_WEB, body: { type: "APPOINTMENT" }, idem: IDEM });
const J = createdJourney.id;
const G = createdJourney.grant;
const retry = await orqApi("POST", "/journeys", { key: KEY_WEB, body: { type: "APPOINTMENT" }, idem: IDEM });
check("crear sin Idempotency-Key, o con una mal formada: 400", (await orqApi("POST", "/journeys", { key: KEY_WEB, body: { type: "APPOINTMENT" } }))[0] === 400 && (await orqApi("POST", "/journeys", { key: KEY_WEB, body: { type: "APPOINTMENT" }, idem: "corta" }))[0] === 400);
check("crear dos veces con la misma clave: el mismo trámite, con otro permiso", retry[0] === 201 && retry[1].id === J && retry[1].status === "DRAFT" && ![undefined, G].includes(retry[1].grant));
check("crear: 201 con id, estado, permiso y vencimiento", s === 201 && eq(Object.keys(createdJourney).sort(), ["grant", "grantExpiresAt", "id", "status"]) && createdJourney.status === "DRAFT", s);
check("crear rechaza cualquier otro campo", (await orqApi("POST", "/journeys", { key: KEY_WEB, body: { type: "APPOINTMENT", patientId: "x" }, idem: secretOf("otra-clave") }))[0] === 400);
check("sin credencial o con una vencida: 401", (await orqApi("GET", `/journeys/${J}`, { grant: G }))[0] === 401 && (await orqApi("GET", `/journeys/${J}`, { key: KEY_EXPIRED, grant: G }))[0] === 401);
check("sin el scope de lectura: 403", (await orqApi("GET", `/journeys/${J}`, { key: KEY_PUBLISH_ONLY, grant: G }))[0] === 403);
check("sin permiso, o con el permiso de otro canal: 404", (await orqApi("GET", `/journeys/${J}`, { key: KEY_WEB }))[0] === 404 && (await orqApi("GET", `/journeys/${J}`, { key: KEY_OTHER, grant: G }))[0] === 404);

const event = (eid, kind, payload) => ({ journeyId: J, externalEventId: eid, type: kind, schemaVersion: 1, occurredAt: "2026-11-24T06:31:00.000Z", payload });
const publish = (body) => orqApi("POST", "/events", { key: KEY_WEB, grant: G, body });
check("clínica antes que estudio: 409", (await publish(event("e-clinica", "JOURNEY_CONTEXT_UPDATED", { expectedVersion: 1, clinicId: ALAMEDA })))[0] === 409);
check("campo fuera del contrato, como la fecha: 400", (await publish(event("e-fecha", "JOURNEY_CONTEXT_UPDATED", { expectedVersion: 1, studyId: GLUCOSA, scheduledAt: "2027-01-05T16:30:00.000Z" })))[0] === 400);
const firstPublish = await publish(event("e-estudio", "JOURNEY_CONTEXT_UPDATED", { expectedVersion: 1, studyId: GLUCOSA }));
const againPublish = await publish(event("e-estudio", "JOURNEY_CONTEXT_UPDATED", { expectedVersion: 1, studyId: GLUCOSA }));
check("reenvío idéntico: el mismo resultado, sin aplicar dos veces", firstPublish[0] === 201 && eq(againPublish, firstPublish) && (await journey(J)).version === 2, `${firstPublish[0]} ${againPublish[0]}`);
check("409 de deduplicación: mismo identificador con otro contenido", (await publish(event("e-estudio", "JOURNEY_CONTEXT_UPDATED", { expectedVersion: 2, studyId: BIOMETRIA })))[0] === 409);
check("409 de estado: versión obsoleta", (await publish(event("e-viejo", "JOURNEY_CONTEXT_UPDATED", { expectedVersion: 1, clinicId: ALAMEDA })))[0] === 409);
check("409 de estado: enviar a confirmación sin clínica", (await publish(event("e-pronto", "JOURNEY_STATUS_CHANGED", { expectedVersion: 2, to: "PENDING_CONFIRMATION" })))[0] === 409);
check("COMPLETED no se puede publicar", (await publish(event("e-fin", "JOURNEY_STATUS_CHANGED", { expectedVersion: 2, to: "COMPLETED" })))[0] === 400);

section("la API general solo atiende acceso, perfil y catálogo");
const total = await stub("/__test/trace");
const bad = total.map((x) => x.call).filter((call) => call.includes("/requests") || call.includes("/appointments"));
check("ninguna llamada a /requests ni /appointments de la API general en toda la suite", total.length > 0 && bad.length === 0, `${total.length} llamadas, ${bad.slice(0, 2)}`);

section("secretos en lo que recibe el navegador");
const hidden = await secrets();
check("hay secretos que buscar: la clave del canal, los permisos y las claves de idempotencia", hidden.length > 12, hidden.length);
check("ninguno aparece en HTML ni cabeceras", leaks(seen, hidden) === 0, `${seen.length / 2} respuestas revisadas`);
check("tampoco las palabras Authorization, X-Journey-Grant o Idempotency-Key", !seen.some((x) => { const l = x.toLowerCase(); return l.includes("x-journey-grant") || l.includes("authorization") || l.includes("idempotency"); }));
check("los códigos emitidos por otros canales no aparecen en ninguna página", leaks(seen, [OTHER_CODE, OTHER_CODE.replaceAll("-", ""), FORCED, groupedCode(FORCED)]) === 0);
writeFileSync(STATE_FILE, JSON.stringify({ A, B, C, D, E, adopted: X, anaOpen: openInRegistry(ANA_ACCOUNT) }));
finish();
