// Trámite guiado contra la API general simulada, en modo heredado: pasos, horarios, nota, vuelta atrás, selección sin
// cambios, conflicto de versión, pausa, código de asistencia, confirmación, creación incierta, errores, otro paciente
// y sesión vencida.
import { Browser, assertWiredToStub, signIn, stub } from "../lib/client.mjs";
import { IDS } from "../lib/config.mjs";
import { check, eq, finish, section } from "../lib/report.mjs";
import { testPassword, testToken } from "../lib/secrets.mjs";

const { GLUCOSA, BIOMETRIA, ALAMEDA, MIRADOR } = IDS;
const PASSWORD = testPassword();
const ANA = testToken("ana");
const SLOT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00-06:00$/;
const UUID_ANY = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

const calls = async () => (await stub("/__test/state")).calls;
const reqs = async (owner) => (await stub("/__test/requests")).filter((r) => owner === undefined || r.owner === owner);
const req = async (rid) => (await stub("/__test/requests")).find((r) => r.id === rid);
async function login(browser, email) {
  const r = await signIn(browser, email, PASSWORD);
  if (r.status !== 303) throw new Error(`acceso ${r.status}`);
}
const ridOf = (location) => /\/tramite\/([0-9a-f-]{36})/.exec(location)[1];
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

await assertWiredToStub();
const ana = new Browser();
await login(ana, "ana@example.com");

section("inicio del trámite");
await stub("/__test/reset-calls");
let r = await ana.get(`/tramite/nuevo?estudio=${GLUCOSA}`);
let c = await calls();
check("/tramite/nuevo: 200, muestra el estudio y no crea nada al cargar", r.status === 200 && r.text().includes("Demo Glucosa") && (await reqs()).length === 0 && !has(c, "POST /api/v1/requests"), `${r.status} ${JSON.stringify(c)}`);
check("consulta los pendientes al cargar", (await calls())["GET /api/v1/requests/pending"] === 1, await calls());
check("sin pendientes, ofrece empezar el trámite", r.text().includes("Empezar el trámite") && !r.text().includes("abierto"));
await stub("/__test/reset-calls");
r = await ana.postForm(r.path, r.forms("Empezar")[0]);
const A = r.location ? ridOf(r.location) : null;
check("crear: 303 a /tramite/<id>", r.status === 303 && A !== null, `${r.status} ${r.location}`);
let a = await req(A);
check("el estudio válido queda guardado en el contexto", eq(a.context, { studyId: GLUCOSA }) && a.currentStep === "SELECT_CLINIC" && a.version === 2 && (await calls())["POST /api/v1/requests"] === 1, a.context);
const trail = [[a.status, a.currentStep]];

section("pasos guiados por la API");
const P = `/tramite/${A}`;
r = await ana.get(P);
check("paso clínica según currentStep", r.status === 200 && r.h2s().includes("Elige una clínica") && r.text().includes("Llevas elegido: Demo Glucosa"), r.h2s());
check("sin aviso de continuidad cuando la actividad es reciente y en la web", !r.text().includes("Dejaste este trámite"));
console.log(`      Cache-Control de /tramite/[id]: ${r.header("Cache-Control")}`);
check("la página del trámite no es almacenable", (r.header("Cache-Control") ?? "").includes("no-store"));
for (const bad of ["revision", "REVIEW", "clinica", "horario", "confirmada"]) {
  const rr = await ana.get(`${P}?cambiar=${bad}`);
  check(`la URL no adelanta pasos (cambiar=${bad})`, rr.h2s().includes("Elige una clínica") && !rr.h2s().includes("Revisa tu cita"), rr.h2s());
}
r = await ana.submit(P, ALAMEDA);
a = await req(A);
trail.push([a.status, a.currentStep]);
check("elegir clínica: PATCH con la versión vigente y paso fecha", r.status === 303 && a.context.clinicId === ALAMEDA && a.currentStep === "SELECT_DATETIME", `${r.status} ${a.currentStep}`);
r = await ana.get(P);
const slots = r.forms('name="scheduledAt"').map((f) => r.hidden(f, "scheduledAt"));
const dayLinks = [...r.body.matchAll(/href="([^"]*dia=[^"]*)"/g)].map((m) => m[1]);
check("horarios: etiqueta de demostración visible", r.text().includes("Horarios de demostración"));
check("horarios en ISO 8601 con zona explícita de Ciudad de México", slots.length > 0 && slots.every((s) => SLOT.test(s)), slots.slice(0, 2));
check("rejilla: como máximo 14 días y 20 horarios por día", dayLinks.length >= 1 && dayLinks.length <= 14 && slots.length <= 20, `días=${dayLinks.length} horarios=${slots.length}`);
const times = slots.map((s) => s.slice(11, 16));
check("rejilla entre 08:00 y 17:30, cada 30 minutos", times.every((t) => t >= "08:00" && t <= "17:30" && ["00", "30"].includes(t.slice(3))), times.slice(0, 3));
const lastDay = dayLinks.at(-1).replaceAll("&amp;", "&");
let rr = await ana.get(lastDay);
const far = rr.forms('name="scheduledAt"').map((f) => rr.hidden(f, "scheduledAt"));
check("otro día de la rejilla ofrece sus 20 horarios", far.length === 20 && far[0].slice(11, 16) === "08:00" && far.at(-1).slice(11, 16) === "17:30", `${far.length} ${far[0] ?? ""}`);
await stub("/__test/reset-calls");
let form = r.forms('name="scheduledAt"')[0];
rr = await ana.postForm(P, form, { replace: { scheduledAt: "2099-01-05T10:30:00-06:00" } });
check("horario fuera de la rejilla: rechazado sin llamar a la API", rr.status === 303 && rr.location.includes("aviso=invalido") && !has(await calls(), "PATCH /api/v1/requests/{id}/context"), `${rr.location}`);
r = await ana.postForm(P, form);
a = await req(A);
trail.push([a.status, a.currentStep]);
check("elegir horario: paso revisión", r.status === 303 && a.currentStep === "REVIEW" && a.status === "PENDING_CONFIRMATION", `${a.status} ${a.currentStep}`);

section("revisión");
await stub("/__test/reset-calls");
r = await ana.get(P);
let t = r.text();
check("resumen con estudio, clínica, fecha y precio", ["Demo Glucosa", "Demo Clínica Alameda", "$120.00 MXN", "Horarios de demostración"].every((x) => t.includes(x)) && r.h2s().includes("Revisa tu cita"));
check("dos salidas: confirmar y pedir ayuda", r.forms("Confirmar mi cita").length === 1 && r.forms("Pedir ayuda a un asesor").length === 1);
c = await calls();
check("cargar la revisión no genera código de asistencia", !has(c, "POST /api/v1/requests/{id}/assistance-code") && !t.includes("Tu código de asistencia"), c);
check("aviso de no incluir datos clínicos en la nota", t.includes("No incluyas datos clínicos") && r.body.toLowerCase().includes('maxlength="500"'));
rr = await ana.submit(P, 'name="notes"', { fields: { notes: "Prefiero el turno de la mañana." } });
check("guardar nota", rr.status === 303 && rr.location.includes("aviso=nota") && (await req(A)).context.notes === "Prefiero el turno de la mañana.");
check("la nota aparece en el resumen", (await ana.follow(rr)).text().includes("Nota guardada."));
await stub("/__test/reset-calls");
rr = await ana.submit(P, 'name="notes"', { fields: { notes: "x".repeat(501) } });
check("nota de más de 500 caracteres: rechazada sin llamar a la API", (rr.location ?? "").includes("aviso=invalido") && !has(await calls(), "PATCH /api/v1/requests/{id}/context"));
rr = await ana.submit(P, 'name="notes"', { fields: { notes: "   " } });
check("nota vacía: se envía null y se quita", !has((await req(A)).context, "notes"));

section("volver a un paso anterior");
r = await ana.get(`${P}?cambiar=estudio`);
check("cambiar estudio: avisa que borra clínica y horario", r.text().includes("Si cambias el estudio se borran la clínica y el horario") && r.h2s().includes("Elige un estudio"));
check("sin elegir nada, el contexto sigue intacto", (await req(A)).context.clinicId === ALAMEDA && (await req(A)).currentStep === "REVIEW");
rr = await ana.postForm(r.path, r.forms(BIOMETRIA)[0]);
a = await req(A);
trail.push([a.status, a.currentStep]);
check("al elegir otro estudio la API borra clínica y horario", eq(a.context, { studyId: BIOMETRIA }) && a.currentStep === "SELECT_CLINIC", a.context);
await ana.submit(P, MIRADOR);
r = await ana.get(P);
await ana.postForm(P, r.forms('name="scheduledAt"')[0]);
r = await ana.get(`${P}?cambiar=clinica`);
check("cambiar clínica: avisa que borra el horario", r.text().includes("Si cambias la clínica se borra el horario") && r.h2s().includes("Elige una clínica"));
r = await ana.get(`${P}?cambiar=horario`);
check("cambiar horario: vuelve a la rejilla sin borrar el actual", r.h2s().includes("Elige fecha y hora") && (await req(A)).currentStep === "REVIEW");
a = await req(A);
trail.push([a.status, a.currentStep]);

section("elegir otra vez lo mismo no escribe nada");
// La pantalla oculta el botón de la opción elegida: se envía el formulario de otra opción con el valor vigente,
// primero con la versión actual y después con una antigua, como desde otra pestaña.
for (const [label, other, value, key] of [
  ["clinica", ALAMEDA, MIRADOR, "clinicId"],
  ["estudio", GLUCOSA, BIOMETRIA, "studyId"],
]) {
  r = await ana.get(`${P}?cambiar=${label}`);
  check(`misma ${label}: la pantalla no ofrece botón para la opción elegida`, r.forms(value).length === 0 && r.forms(other).length === 1);
  for (const stale of [false, true]) {
    const before = await req(A);
    const replace = { [key]: value, ...(stale ? { version: String(before.version - 1) } : {}) };
    await stub("/__test/reset-calls");
    rr = await ana.postForm(r.path, r.forms(other)[0], { replace });
    const after = await req(A);
    const all = await calls();
    const writes = Object.keys(all).filter((k) => !k.startsWith("GET "));
    const tag = `misma ${label}${stale ? " con versión antigua" : ""}`;
    check(`${tag}: vuelve al trámite sin aviso`, rr.status === 303 && rr.location.endsWith(P), rr.location);
    check(`${tag}: ninguna escritura en la API`, writes.length === 0, all);
    check(`${tag}: contexto, versión e historial intactos`, eq(after.context, before.context) && after.version === before.version && eq(after.events, before.events), `${before.version} -> ${after.version}`);
  }
}

section("conflicto de versión y continuidad");
r = await ana.get(P);
const staleForm = r.forms("Confirmar mi cita")[0];
await stub(`/__test/other-channel?id=${A}&clinic=${ALAMEDA}&minutesAgo=120`);
let before = await req(A);
rr = await ana.postForm(P, staleForm);
check("409: redirige al trámite con el aviso de cambio", rr.status === 303 && rr.location.endsWith(`${P}?aviso=cambio`), `${rr.status} ${rr.location}`);
let after = await req(A);
check("409: la acción con versión vieja no se aplicó", after.status === before.status && after.version === before.version && (await stub("/__test/state")).appointments === 0);
let page = await ana.follow(rr);
check("409: muestra el mensaje y el estado actual leído de la API", page.text().includes("Tu trámite cambió desde otro canal") && page.h2s().includes("Elige fecha y hora"), page.h2s());
check("aviso de continuidad con canal y tiempo", page.text().includes("Dejaste este trámite en WhatsApp hace 2 horas."), (page.text().match(/Dejaste[^.]*\./) ?? [])[0]);
check("el reenvío exige una acción nueva del paciente", page.forms("Confirmar mi cita").length === 0 && page.forms('name="scheduledAt"').length > 0);

section("pausa y reanudación");
rr = await ana.submit(P, "Guardar y continuar después");
a = await req(A);
check("guardar y continuar después: pausa y lleva a /continuar", rr.status === 303 && rr.location.endsWith("/continuar?aviso=guardado") && a.events.includes("REQUEST_PAUSED"), rr.location);
check("la pausa conserva el contexto y el trámite sigue abierto", a.context.clinicId === ALAMEDA && a.status === "IN_PROGRESS");
page = await ana.follow(rr);
check("/continuar lista el trámite con su paso y canal", page.text().includes("Tu trámite quedó guardado") && page.text().includes("Siguiente paso: Fecha y hora") && page.text().includes("Demo Biometría hemática"), page.text().slice(0, 160));
await stub(`/__test/other-channel?id=${A}`);
rr = await ana.submit("/continuar", "Continuar este trámite");
a = await req(A);
check("continuar: llama a resume, cambia el canal a WEB y abre el trámite", rr.status === 303 && rr.location.endsWith(P) && a.events.includes("REQUEST_RESUMED") && a.lastChannel === "WEB", `${rr.location} ${a.lastChannel}`);
r = await ana.get(P);
await ana.postForm(P, r.forms('name="scheduledAt"')[0]);
a = await req(A);
trail.push([a.status, a.currentStep]);

section("código de asistencia");
await stub("/__test/reset-calls");
r = await ana.get(P);
rr = await ana.postForm(P, r.forms("Pedir ayuda a un asesor")[0]);
const code = (await stub("/__test/state")).lastCode;
check("el código solo se pide al pulsar el botón", (await calls())["POST /api/v1/requests/{id}/assistance-code"] === 1 && rr.status === 200);
check("muestra el código, su vencimiento y que es de un solo uso", Boolean(code) && rr.body.includes(code) && rr.text().includes("Es de un solo uso") && rr.text().includes("Vence a las"));
check("el código no viaja en la URL ni en cabeceras de redirección", rr.location === null && !rr.path.includes(code));
check("la respuesta con el código no es almacenable", (rr.header("Cache-Control") ?? "").includes("no-store"), rr.header("Cache-Control"));
check("al recargar, el código ya no está: no se guarda", !(await ana.get(P)).body.includes(code));

section("confirmación");
r = await ana.get(P);
const confirmForm = r.forms("Confirmar mi cita")[0];
rr = await ana.postForm(P, confirmForm);
a = await req(A);
trail.push([a.status, a.currentStep]);
check("confirmar: 303 al trámite, ya completado", rr.status === 303 && rr.location.endsWith(P) && a.status === "COMPLETED" && a.currentStep === "CONFIRMED", a.status);
page = await ana.follow(rr);
const apt = /href="\/citas\/([0-9a-f-]{36})"/.exec(page.body);
check("muestra Cita confirmada con enlace al detalle de la cita", page.h2s().includes("Cita confirmada") && apt !== null && (await stub("/__test/state")).appointments === 1);
rr = await ana.postForm(P, confirmForm);
check("reintentar la confirmación no duplica la cita", (await stub("/__test/state")).appointments === 1 && (await ana.follow(rr)).h2s().includes("Cita confirmada"));
check("un trámite cerrado no ofrece pausa ni cambios", page.forms("Guardar y continuar después").length === 0 && (await ana.get(`${P}?cambiar=estudio`)).h2s().includes("Cita confirmada"));

section("crear con respuesta incierta");
const n = (await reqs(ANA)).length;
r = await ana.get("/tramite/nuevo");
check("con uno abierto no se crea otro sin pedirlo", r.status === 200 && (await reqs(ANA)).length === n);
await stub("/__test/fail?op=create&mode=after");
rr = await ana.postForm(r.path, r.forms("Empezar")[0]);
check("respuesta incierta pero creado: consulta pendientes y sigue con ese trámite, sin duplicar", rr.status === 303 && (rr.location ?? "").includes("/tramite/") && (await reqs(ANA)).length === n + 1, `${rr.status} ${rr.location} total=${(await reqs(ANA)).length}`);
const B = ridOf(rr.location);
r = await ana.get(`/tramite/nuevo?estudio=${GLUCOSA}`);
check("con un trámite abierto ofrece continuarlo o empezar otro", r.text().includes("Tienes un trámite abierto") && r.forms("Continuar este trámite").length === 1 && r.forms("Empezar un trámite nuevo").length === 1);
await stub("/__test/fail?op=create&mode=before");
rr = await ana.postForm(r.path, r.forms("Empezar")[0]);
check("respuesta incierta y no creado: lo dice y permite reintentar", rr.status === 200 && rr.text().includes("no se creó") && rr.forms("Empezar").length === 1 && (await reqs(ANA)).length === n + 1, rr.text().slice(-140));
await stub("/__test/fail?op=create&mode=after");
await stub("/__test/fail?op=pending&mode=500");
rr = await ana.postForm(r.path, r.forms("Empezar")[0]);
check("sin poder consultar pendientes: bloquea otro intento y manda a revisarlos", rr.status === 200 && rr.text().includes("No pudimos confirmar si el trámite se creó") && rr.forms("Empezar").length === 0 && rr.links("Revisar mis trámites").join("").includes("/tramite/nuevo"), rr.text().slice(-160));
await stub("/__test/clear-failures");

section("errores de la API");
r = await ana.get(`/tramite/${B}`);
await stub("/__test/fail?op=context&mode=400");
rr = await ana.postForm(r.path, r.forms(GLUCOSA)[0]);
page = await ana.follow(rr);
check("400: mensaje genérico, sin el texto crudo de la API", rr.location.includes("aviso=invalido") && page.text().includes("No pudimos guardar ese cambio") && !page.body.includes("CRUDO"));
await stub("/__test/fail?op=context&mode=500");
rr = await ana.postForm(r.path, r.forms(GLUCOSA)[0]);
check("5xx: aviso de servicio y vuelta al estado guardado", rr.location.includes("aviso=servicio") && (await ana.follow(rr)).text().includes("El servicio no respondió"));
for (const bad of ["abc", "123", `${A}0`]) {
  await stub("/__test/reset-calls");
  rr = await ana.get(`/tramite/${bad}`);
  c = await calls();
  check(`id no UUID '${bad.slice(0, 8)}': 404 sin llamar a la API de trámites`, rr.status === 404 && !Object.keys(c).some((k) => k.includes("requests")), `${rr.status} ${JSON.stringify(c)}`);
}

section("un paciente no ve ni modifica el trámite de otro");
const beto = new Browser();
await login(beto, "beto@example.com");
const missing = await beto.get("/tramite/00000000-0000-4000-8000-00000000dead");
const other = await beto.get(`/tramite/${B}`);
check("trámite ajeno: 404", other.status === 404 && other.text().includes("Página no encontrada"), other.status);

/**
 * HTML sin lo que cambia en cada respuesta: identificadores, nonce y el orden de los fragmentos del flujo de React.
 * La sesión y el trámite se leen en paralelo, y el fragmento del 404 puede llegar antes o después que los metadatos.
 */
function flightFree(response, body) {
  const found = /'nonce-([^']+)'/.exec(response.header("Content-Security-Policy") ?? "");
  if (found) body = body.replaceAll(found[1], "NONCE");
  const chunks = [...body.matchAll(/self\.__next_f\.push\(([\s\S]*?)\)<\/script>/g)].map((m) => m[1]);
  const rest = body.replace(/self\.__next_f\.push\([\s\S]*?\)<\/script>/g, "");
  const lines = chunks.flatMap((chunk) => chunk.split("\\n")).sort();
  return (rest + lines.join("\n")).replace(UUID_ANY, "ID");
}
const same = (response) => flightFree(response, response.body);

check("404 idéntico para trámite ajeno e inexistente", other.status === missing.status && same(other) === same(missing));
check("el trámite ajeno no aparece en los pendientes del otro paciente", (await beto.get("/continuar")).text().includes("No tienes trámites abiertos"));
r = await beto.get("/tramite/nuevo");
rr = await beto.postForm(r.path, r.forms("Empezar")[0]);
const BETO = ridOf(rr.location);
const own = await beto.get(`/tramite/${BETO}`);
before = await req(B);
rr = await beto.postForm(`/tramite/${B}`, own.forms(GLUCOSA)[0], { replace: { id: B, version: String(before.version) } });
check("POST sobre un trámite ajeno: no lo modifica y termina en 404", eq(await req(B), before) && (await beto.follow(rr)).status === 404, `${rr.status} ${rr.location}`);
const pause = own.forms("Guardar y continuar después")[0];
rr = await beto.postForm(`/tramite/${B}`, pause, { replace: { id: B, version: String(before.version) } });
check("pausa sobre un trámite ajeno: sin efecto", eq(await req(B), before) && (await beto.follow(rr)).status === 404);
await stub("/__test/reset-calls");
rr = await beto.postForm(`/tramite/${B}`, own.forms(GLUCOSA)[0], { replace: { id: "no-es-uuid" } });
c = await calls();
check("acción con id inválido: no llega a la API", rr.status === 303 && !Object.keys(c).some((k) => k.startsWith("PATCH") || k.startsWith("POST")), `${rr.location} ${JSON.stringify(c)}`);
const anon = new Browser();
rr = await anon.get(`/tramite/${B}`);
check("sin sesión: el trámite redirige a /acceso con el destino", [302, 307].includes(rr.status) && rr.location.includes(`destino=%2Ftramite%2F${B}`), rr.location);
rr = await anon.postForm(`/tramite/${B}`, own.forms(GLUCOSA)[0], { replace: { id: B } });
check("POST sin sesión: no modifica nada", eq(await req(B), before), `${rr.status} ${rr.location}`);

section("sesión vencida");
r = await ana.get(`/tramite/${B}`);
form = r.forms(GLUCOSA)[0];
await stub(`/__test/revoke?token=${ANA}`);
rr = await ana.postForm(r.path, form);
check("401 en una acción: borra la cookie y lleva a /acceso con el destino", rr.status === 303 && rr.location.includes(`/acceso?destino=%2Ftramite%2F${B}`) && ana.token() === null, `${rr.status} ${rr.location}`);
ana.cookies = { "__Host-portal-session": ANA };
rr = await ana.get(`/tramite/${B}`);
check("401 al cargar: flujo de sesión vencida", [302, 307].includes(rr.status) && rr.location.includes("/api/session/expired?destino="), `${rr.status} ${rr.location}`);
const end = await ana.follow(rr);
check("sesión vencida: termina en /acceso sin cookie", end.h1() === "Acceso" && ana.token() === null);
await stub(`/__test/restore?token=${ANA}`);

console.log("\nrecorrido del trámite A (status, currentStep):");
for (const [status, step] of trail) console.log(`   ${status.padEnd(22)} ${step}`);
finish();
