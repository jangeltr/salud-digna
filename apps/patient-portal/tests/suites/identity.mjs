// Continuidad identificada: PATIENT_IDENTITY_MODE=assertion contra el orquestador simulado.
//   node tests/suites/identity.mjs simulador   -> emisor de simulación
//   node tests/suites/identity.mjs pendiente   -> emisor pendiente: ninguna acreditación, ningún trámite
// Nunca imprime acreditaciones, permisos, claves ni tokens.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Browser, assertWiredToStub, clean, orq, orqApi, signIn } from "../lib/client.mjs";
import { DIRS, IDS, UUID } from "../lib/config.mjs";
import { check, eq, finish, section, sleep } from "../lib/report.mjs";
import { CHANNEL_KEY_IDS, channelKey, secretOf, testPassword } from "../lib/secrets.mjs";

const PHASE = process.argv[2];
const { GLUCOSA, BIOMETRIA, ALAMEDA, ANA_ACCOUNT } = IDS;
const ANA = ANA_ACCOUNT;
const PASSWORD = testPassword();
const KEY_OTHER = channelKey("otherChannel");

// Cuerpos, cabeceras, cookies y destinos que el portal envió al navegador.
const seen = [];
Browser.onResponse = (response) => seen.push(response.body, response.headerText(), response.path);

const trace = () => orq("/__test/trace?clear=1");
const ops = (entries) => entries.map((e) => e.op);
const journeys = () => orq("/__test/journeys");
const journey = async (id) => (await journeys()).find((j) => j.id === id);
async function login(browser, email) {
  const r = await signIn(browser, email, PASSWORD);
  if (r.status !== 303) throw new Error(`acceso ${r.status}`);
}
function ridOf(location) {
  const found = new RegExp(`/tramite/(${UUID})`).exec(location ?? "");
  return found ? found[1] : null;
}
async function start(browser, study) {
  const page = await browser.get(`/tramite/nuevo${study ? `?estudio=${study}` : ""}`);
  return browser.postForm(page.path, page.forms("Empezar")[0]);
}
const readLog = () => readFileSync(DIRS.portalLog, "utf8");

await assertWiredToStub();

// =============================================================================================
if (PHASE === "pendiente") {
  section("emisor pendiente: ninguna acreditación, ningún trámite");
  const ana = new Browser();
  await login(ana, "ana@example.com");
  await trace();
  const before = (await journeys()).length;
  let r = await ana.get(`/tramite/nuevo?estudio=${GLUCOSA}`);
  let entries = await trace();
  check("/tramite/nuevo: aviso de identidad y ningún botón para empezar", r.text().includes("No pudimos verificar tu identidad") && r.forms("Empezar").length === 0, r.text().slice(0, 160));
  check("ninguna llamada al orquestador: nunca se crea un trámite anónimo", entries.length === 0 && (await journeys()).length === before, ops(entries));
  r = await ana.get("/continuar");
  check("/continuar: aviso de identidad, sin lista", r.status === 200 && r.text().includes("No pudimos verificar tu identidad") && (await trace()).length === 0, r.h1());
  r = await ana.get("/mi-espacio");
  check("/mi-espacio: el mismo aviso", r.text().includes("No pudimos verificar tu identidad"));
  r = await ana.get("/tramite/00000000-0000-4000-8000-0000000000aa");
  check("abrir un trámite por URL: aviso de identidad y ninguna llamada", r.text().includes("No pudimos verificar tu identidad") && (await trace()).length === 0, r.status);
  const log = readLog();
  check("al arrancar se registra el modo y el emisor pendiente", log.includes("identidad del paciente: assertion (emisor: pendiente)"));
  check("y se avisa del error mostrado, con su tipo", log.includes("[portal] error mostrado en /tramite/nuevo: identity-unavailable") && log.includes("[portal] error mostrado en /continuar: identity-unavailable"));
  finish();
}

// =============================================================================================
const ana = new Browser();
const beto = new Browser();
await login(ana, "ana@example.com");
await login(beto, "beto@example.com");

section("crear un trámite identificado");
await trace();
let r = await start(ana, GLUCOSA);
const A = ridOf(r.location);
let entries = await trace();
const creation = entries.filter((e) => e.op === "POST /api/v1/journeys");
check("crea y lleva al trámite", r.status === 303 && A !== null, `${r.status} ${r.location}`);
check("POST /journeys lleva acreditación e Idempotency-Key", creation.length === 1 && creation[0].hasAssertion && Boolean(creation[0].idempotencyKey), creation.length);
check("el trámite queda asociado a la paciente en el orquestador", A !== null && (await journey(A)).subject === ANA);
check("el estudio se publica con el permiso de la creación", eq((await journey(A)).refs, { studyId: GLUCOSA }) && entries.some((e) => e.op === "POST /api/v1/events" && e.hasGrant));
const registryFile = join(DIRS.data, "web-channel-registry.json");
check("el registro local del canal Web no se usa", !existsSync(registryFile), existsSync(DIRS.data) ? readdirSync(DIRS.data) : []);

section("trámites activos en /continuar y /mi-espacio");
await trace();
r = await ana.get("/continuar");
entries = await trace();
const listing = entries.filter((e) => e.call.startsWith("GET /api/v1/journeys?"));
check("/continuar consulta GET /journeys?active=true con acreditación", listing.length === 1 && listing[0].call.endsWith("?active=true") && listing[0].hasAssertion, ops(entries));
check("sin leer el detalle de cada trámite", !ops(entries).some((o) => o.startsWith("GET /api/v1/journeys/:id")), ops(entries));
check("muestra folio, estado y fecha, con enlace al trámite", r.text().includes(A) && r.text().includes("Folio:") && r.text().includes("En curso") && r.text().includes("Última actividad:") && eq(r.links("Continuar este trámite"), [`/tramite/${A}`]), r.text().slice(0, 200));
check("texto sin WhatsApp", r.text().includes("Tus trámites activos, también los que empezaste en la app móvil o en Call Center.") && !r.body.includes("WhatsApp"));
check("sin «Necesita un permiso nuevo»", !r.text().includes("Necesita un permiso nuevo"));
const main = r.main();
const details = /<details\b[^>]*>([\s\S]*?)<\/details>/.exec(main);
const opening = main.slice(main.indexOf("<details"), main.indexOf("<details") + 30);
check("el canje de código queda plegado bajo «Otra forma de continuar»", details !== null && clean(details[1]).includes("Otra forma de continuar") && details[1].includes('name="codigo"') && !opening.includes(" open"));
r = await ana.get("/mi-espacio");
check("/mi-espacio muestra los trámites activos", r.text().includes("Tus trámites activos") && r.text().includes(A) && eq(r.links("Continuar este trámite"), [`/tramite/${A}`]));

section("trámite creado en otro canal");
const { assertion: otherAssertion } = await orq(`/__test/assertion-for?sub=${ANA}&channel=demo-whatsapp`);
const [s, created] = await orqApi("POST", "/journeys", { key: KEY_OTHER, assertion: otherAssertion, body: { type: "APPOINTMENT" }, idem: secretOf("otro-canal-1") });
const X = created.id;
await orqApi("POST", "/events", {
  key: KEY_OTHER,
  grant: created.grant,
  body: { journeyId: X, externalEventId: "app-estudio-1", type: "JOURNEY_CONTEXT_UPDATED", schemaVersion: 1, occurredAt: new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z"), payload: { expectedVersion: 1, studyId: BIOMETRIA } },
});
check("otro canal crea un trámite para la misma paciente", s === 201 && (await journey(X)).subject === ANA);
r = await ana.get("/continuar");
check("aparece en su /continuar, sin código", r.text().includes(X) && r.text().includes(A));
await trace();
r = await ana.get(`/tramite/${X}`);
entries = await trace();
const grantCalls = entries.filter((e) => e.op === "POST /api/v1/journeys/:id/access-grants");
check("al abrirlo, el portal pide el permiso con access-grants y la acreditación", grantCalls.length === 1 && grantCalls[0].hasAssertion, ops(entries));
check("y muestra el estudio elegido en el otro canal", r.h2s().includes("Elige una clínica") && r.text().includes("Demo Biometría hemática"), r.h2s());
let rr = await ana.submit(`/tramite/${X}`, ALAMEDA);
check("la paciente continúa el trámite: elige la clínica", rr.status === 303 && (await journey(X)).refs.clinicId === ALAMEDA);
const history = await ana.get(`/tramite/${X}/historial`);
check("el historial se lee con el mismo permiso", history.status === 200 && history.text().includes("Trámite creado"));

section("dos pacientes no ven ni continúan trámites del otro");
r = await beto.get("/continuar");
check("Beto no ve los trámites de Ana", !r.body.includes(A) && !r.body.includes(X));
await trace();
r = await beto.get(`/tramite/${A}`);
entries = await trace();
check("abrir el de Ana por URL: 404", r.status === 404, r.status);
check("el portal pide permiso con la acreditación de Beto y el orquestador lo niega", eq(ops(entries), ["POST /api/v1/journeys/:id/access-grants"]) && entries[0].hasAssertion, ops(entries));
check("su historial también responde 404", (await beto.get(`/tramite/${A}/historial`)).status === 404);
await start(beto);
const own = ridOf((await beto.get("/continuar")).links("Continuar este trámite")[0]);
const form = (await beto.get(`/tramite/${own}`)).forms(GLUCOSA)[0];
const before = await journey(A);
await trace();
rr = await beto.postForm(`/tramite/${own}`, form, { replace: { id: A, version: String(before.version) } });
entries = await trace();
check("una acción de Beto con el identificador de Ana no lo modifica", eq(await journey(A), before) && !ops(entries).includes("POST /api/v1/events") && (await beto.follow(rr)).status === 404, ops(entries));
check("Ana tampoco ve el de Beto", !(await ana.get("/continuar")).body.includes(own) && (await ana.get(`/tramite/${own}`)).status === 404);

section("permiso vencido o revocado: se renueva solo");
await orq("/__test/grant-ttl?ms=2500");
const B = ridOf((await start(ana, GLUCOSA)).location);
await orq("/__test/grant-ttl?ms=300000");
await sleep(3000);
await trace();
r = await ana.get(`/tramite/${B}`);
entries = await trace();
check("permiso vencido: pide otro y el trámite se ve", r.h2s().includes("Elige una clínica") && ops(entries).filter((o) => o === "POST /api/v1/journeys/:id/access-grants").length === 1, ops(entries));
check("sin «Necesita un permiso nuevo»", !r.text().includes("Necesita un permiso nuevo"));
await orq(`/__test/revoke-grants?journey=${B}`);
await trace();
r = await ana.get(`/tramite/${B}`);
entries = await trace();
const count = (op) => ops(entries).filter((o) => o === op).length;
check("permiso revocado en el orquestador: 404, permiso nuevo y un solo reintento", r.h2s().includes("Elige una clínica") && count("POST /api/v1/journeys/:id/access-grants") === 1 && count("GET /api/v1/journeys/:id") === 2, ops(entries));

section("la acreditación falla: no se crea nada");
// Formulario abierto antes del fallo: el paciente pulsa «Empezar» cuando el orquestador ya rechaza su acreditación.
let page = await ana.get(`/tramite/nuevo?estudio=${GLUCOSA}`);
const startForm = page.forms("Empezar")[0];
await orq("/__test/reject-assertions?on=1");
const countBefore = (await journeys()).length;
await trace();
r = await ana.postForm(page.path, startForm);
entries = await trace();
const creations = entries.filter((e) => e.op === "POST /api/v1/journeys");
check("mensaje claro de identidad", r.status === 200 && r.text().includes("No pudimos verificar tu identidad"), r.text().slice(-150));
check("ningún trámite creado", (await journeys()).length === countBefore);
check("todos los envíos llevan acreditación: nunca un POST /journeys anónimo", creations.length === 2 && creations.every((e) => e.hasAssertion), ops(entries));
r = await ana.get("/continuar");
check("/continuar: aviso de identidad", r.text().includes("No pudimos verificar tu identidad"));
r = await ana.get(`/tramite/nuevo?estudio=${GLUCOSA}`);
check("/tramite/nuevo: aviso, sin botón para empezar", r.text().includes("No pudimos verificar tu identidad") && r.forms("Empezar").length === 0);
await orq("/__test/reject-assertions?on=0");

section("continuidad identificada en el trámite");
r = await ana.get(`/tramite/${B}`);
const continuity = /<section aria-labelledby="continuidad"[\s\S]*?<\/section>/.exec(r.main());
const continuityText = continuity ? clean(continuity[0]) : "";
check("dice que basta identificarse en la app móvil o en Call Center", continuityText.includes("Al identificarte allí verás tus trámites activos, sin necesidad de código."));
check("el código queda plegado bajo «Otra forma de continuar»", continuity !== null && /<details\b(?![^>]*\bopen\b)[^>]*>\s*<summary[^>]*>Otra forma de continuar<\/summary>/.test(continuity[0]));
check("sin WhatsApp en la página", !r.body.includes("WhatsApp"));

section("acreditaciones y permisos fuera de HTML, cookies, URL y logs");
const secrets = await orq("/__test/secrets");
const values = [...secrets.assertions, ...secrets.grants].filter(Boolean);
check("hay acreditaciones y permisos que buscar", secrets.assertions.length >= 3 && secrets.grants.length >= 3, `${secrets.assertions.length} ${secrets.grants.length}`);
const leaked = seen.reduce((sum, blob) => sum + values.filter((value) => blob.includes(value)).length, 0);
check("ninguno en HTML, cabeceras, cookies ni URL", leaked === 0, `${seen.length / 3} respuestas`);
check("ni la palabra X-Patient-Assertion", !seen.some((blob) => blob.toLowerCase().includes("x-patient-assertion")));
const log = readLog();
check("ninguno en el registro del servidor", values.filter((value) => log.includes(value)).length === 0);
check("el registro no nombra cabeceras secretas", !log.toLowerCase().includes("x-patient-assertion") && !log.toLowerCase().includes("x-journey-grant"));

section("registro mínimo");
check("al arrancar: modos activos", log.includes("[portal] trámites: orchestrator | identidad del paciente: assertion (emisor: simulación)"), log.slice(0, 300));
check("y el identificador público de la clave, nunca el secreto", log.includes(`clave del canal: ${CHANNEL_KEY_IDS.web}`) && !log.includes(channelKey("web").split(".")[1]));
check("el 404 del permiso negado queda con su código", log.includes("[orquestador] POST /journeys/:journeyId/access-grants: respuesta 404"));
check("la acreditación rechazada al crear queda con su código", log.includes("[orquestador] POST /journeys: respuesta 404"));
check("el error mostrado se avisa con su tipo", log.includes("[portal] error mostrado en acción: empezar trámite: identity-unavailable"));
finish();
