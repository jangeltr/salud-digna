// Publicación: registro controlado, IP del cliente, límites, cabeceras, página de error y sesión vencida.
//   node tests/suites/publication.mjs abierto   -> portal con REGISTRATION_ENABLED=true y FORWARD_CLIENT_IP=true
//   node tests/suites/publication.mjs cerrado   -> portal con los valores por defecto de producción
// Las IP son de los rangos de documentación (RFC 5737). Incluye una espera real de 31 segundos.
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Browser, assertWiredToStub, clean, orq, signIn, stub } from "../lib/client.mjs";
import { DIRS, IDS, UUID } from "../lib/config.mjs";
import { check, eq, finish, section, sleep } from "../lib/report.mjs";
import { testPassword, testToken } from "../lib/secrets.mjs";

const PHASE = process.argv[2];
const FORMS = join(DIRS.work, "formulario-de-registro.json");
const PASSWORD = testPassword();
const WRONG_PASSWORD = "clave-equivocada-000";
const { GLUCOSA } = IDS;
const WRONG = "No pudimos iniciar sesión con esos datos.";
const TOO_MANY = "Demasiados intentos. Espera ";

const trace = () => stub("/__test/trace?clear=1");
const callsTo = (entries, fragment) => entries.filter((e) => e.call.includes(fragment));
/** Navegador que se presenta como si pasara por el proxy: lleva la cabecera X-Real-IP. */
const client = (ip, extra = {}) => new Browser({ headers: { ...extra, ...(ip ? { "X-Real-IP": ip } : {}) } });
const login = (browser, email, password = PASSWORD) => signIn(browser, email, password);
function alertOf(response) {
  const found = /role="alert"[^>]*>([\s\S]*?)<\/p>/.exec(response.body);
  return found ? clean(found[1]) : "";
}
const nonceOf = (response) => (/'nonce-([^']+)'/.exec(response.header("Content-Security-Policy") ?? "") ?? [null, ""])[1];
const probe = (prefix) => `${prefix}-${randomUUID().slice(0, 8)}`;

// =============================================================================================
if (PHASE === "abierto") {
  await assertWiredToStub();
  const anon = new Browser();

  section("registro encendido con REGISTRATION_ENABLED=true");
  const page = await anon.get("/registro");
  const forms = page.forms('name="firstName"');
  check("/registro existe", page.status === 200 && page.h1() === "Registro" && forms.length === 1, page.status);
  check("/acceso enlaza a «Crear cuenta»", eq((await anon.get("/acceso")).links("Crear cuenta"), ["/registro"]));
  writeFileSync(FORMS, JSON.stringify({ signup: forms[0] ?? "" }));
  await trace();
  const sent = await anon.postForm("/registro", forms[0], { fields: { firstName: "Prueba", lastName: "Sintética", email: "nueva@example.com", password: "clave-larga-de-prueba-01" } });
  check("encendido, el envío sí llega a la API general", callsTo(await trace(), "POST /api/v1/auth/register").length === 1, sent.status);

  section("FORWARD_CLIENT_IP=true: una única cabecera con la IP que escribió el proxy");
  const proxied = client("203.0.113.7", { "X-Test-Marker": "marca-del-navegador", "X-Portal-Client-IP": "198.51.100.99", "X-Forwarded-For": "198.51.100.77" });
  await trace();
  const r = await login(proxied, "ana@example.com");
  let entries = await trace();
  let calls = callsTo(entries, "POST /api/v1/auth/login");
  check("el acceso funciona", r.status === 303 && calls.length === 1, r.status);
  check("la API general recibe la IP de X-Real-IP", calls.length > 0 && calls[0].clientIp === "203.0.113.7", calls[0]?.clientIp ?? null);
  check("no la que el navegador puso en X-Portal-Client-IP ni en X-Forwarded-For", calls.length > 0 && !["198.51.100.99", "198.51.100.77"].includes(calls[0].clientIp) && !calls[0].headerNames.includes("x-forwarded-for"));
  const names = new Set(calls[0]?.headerNames ?? []);
  check("ninguna otra cabecera del navegador llega a la API", !["x-test-marker", "cookie", "x-real-ip", "origin", "referer"].some((n) => names.has(n)), [...names].sort());
  await proxied.get("/perfil");
  await proxied.get(`/estudios/buscar?q=${probe("sonda")}`);
  entries = await trace();
  const me = callsTo(entries, "GET /api/v1/auth/me");
  const catalog = callsTo(entries, "GET /api/v1/studies");
  check("también viaja en la lectura del perfil", me.length >= 1 && me.every((e) => e.clientIp === "203.0.113.7"), me.length);
  check("no viaja en las lecturas del catálogo, que se guardan en caché", catalog.length >= 1 && catalog.every((e) => e.clientIp === null), catalog.length);
  const bare = client(null, { "X-Portal-Client-IP": "198.51.100.99" });
  await trace();
  await login(bare, "beto@example.com");
  calls = callsTo(await trace(), "POST /api/v1/auth/login");
  check("sin la cabecera del proxy no se envía ninguna IP", calls.length === 1 && calls[0].clientIp === null, calls[0]?.clientIp ?? null);
  const odd = client("no-es-una-ip");
  await trace();
  await login(odd, "beto@example.com");
  calls = callsTo(await trace(), "POST /api/v1/auth/login");
  check("un valor que no es una IP tampoco se envía", calls.length === 1 && calls[0].clientIp === null);
  finish();
}

// =============================================================================================
await assertWiredToStub();
const SIGNUP = JSON.parse(readFileSync(FORMS, "utf8")).signup;

// Sesiones para las pruebas de topes, abiertas antes de tocar los límites de acceso.
const ana = client("203.0.113.50");
const beto = client("203.0.113.51");
await trace();
if ((await login(ana, "ana@example.com")).status !== 303 || (await login(beto, "beto@example.com")).status !== 303) throw new Error("acceso inicial");
let entries = await trace();

section("FORWARD_CLIENT_IP apagada por defecto");
check("la API general no recibe ninguna IP del cliente", entries.length >= 2 && entries.every((e) => e.clientIp === null), entries.length);
check("ni cabeceras del navegador", entries.every((e) => !["x-real-ip", "cookie", "x-forwarded-for"].some((n) => e.headerNames.includes(n))));

section("registro apagado por defecto en producción");
const anon = new Browser();
let page = await anon.get("/registro");
check("/registro responde no encontrado", page.status === 404, page.status);
const access = await anon.get("/acceso");
check("/acceso ya no enlaza a «Crear cuenta»", access.status === 200 && access.links("Crear cuenta").length === 0 && !access.body.includes("/registro"));
const home = await anon.get("/");
check("ni la portada ni el encabezado enlazan al registro", !home.body.includes("/registro"));
await trace();
const sent = await anon.postForm("/registro", SIGNUP, { fields: { firstName: "Prueba", lastName: "Sintética", email: "otra@example.com", password: "clave-larga-de-prueba-01" } });
check("la acción de servidor rechaza el envío: 404 y ninguna llamada a la API general", sent.status === 404 && (await trace()).length === 0, sent.status);

section("cabeceras de una respuesta en modo producción (página generada en cada petición)");
let r = await anon.get("/acceso");
const csp = r.header("Content-Security-Policy") ?? "";
const nonce = nonceOf(r);
const shown = ["Strict-Transport-Security", "Content-Security-Policy", "Permissions-Policy", "X-Robots-Tag", "X-Frame-Options", "X-Content-Type-Options", "Referrer-Policy", "Cache-Control", "X-Powered-By"];
if (process.env.VERBOSE === "1") console.log(`      ${shown.map((name) => `${name}: ${r.header(name)}`).join("\n      ")}`);
check("Strict-Transport-Security sin includeSubDomains", r.header("Strict-Transport-Security") === "max-age=15552000");
check("política de contenido activa, no en modo informe", csp !== "" && r.header("Content-Security-Policy-Report-Only") === null);
for (const directive of ["default-src 'self'", "'strict-dynamic'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'", "connect-src 'self'"]) {
  check(`la política incluye ${directive}`, csp.includes(directive));
}
check("sin 'unsafe-inline' ni 'unsafe-eval' en producción", !csp.includes("unsafe-inline") && !csp.includes("unsafe-eval"));
const scripts = [...r.body.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
check("todos los scripts de la página llevan el nonce de la cabecera", nonce.length >= 16 && scripts.length > 0 && scripts.every((tag) => tag.includes(`nonce="${nonce}"`)), `${scripts.length} scripts`);
check("sin estilos en línea en el HTML", !/<style\b|\sstyle=/.test(r.body));
const other = await anon.get("/acceso");
const otherNonce = nonceOf(other);
check("el nonce cambia en cada petición", otherNonce !== "" && otherNonce !== nonce);
const forced = await anon.get("/acceso", { headers: { "Content-Security-Policy": "script-src *", "x-nonce": "fijado-por-el-navegador" } });
const forcedCsp = forced.header("Content-Security-Policy") ?? "";
check("el navegador no puede fijar la política ni el nonce", !forcedCsp.includes("script-src *") && !forcedCsp.includes("fijado-por-el-navegador") && !forced.body.includes("fijado-por-el-navegador"));
const policy = r.header("Permissions-Policy") ?? "";
check("Permissions-Policy restrictiva: cámara, micrófono, ubicación y pagos apagados", ["camera", "microphone", "geolocation", "payment", "usb", "clipboard-read"].every((feature) => policy.includes(`${feature}=()`)));
check("solo permite copiar al portapapeles desde el propio portal", policy.includes("clipboard-write=(self)"));
check("X-Robots-Tag noindex", r.header("X-Robots-Tag") === "noindex, nofollow");
check("meta robots noindex en la página", /<meta name="robots" content="noindex, ?nofollow"/.test(r.body));
const robots = await anon.get("/robots.txt");
check("robots.txt excluye todo", robots.status === 200 && robots.body.replace(/\s+/g, " ").trim().toLowerCase() === "user-agent: * disallow: /", robots.body.slice(0, 60));
check("se conservan X-Frame-Options, nosniff, Referrer-Policy y no-store", r.header("X-Frame-Options") === "DENY" && r.header("X-Content-Type-Options") === "nosniff" && r.header("Referrer-Policy") === "strict-origin-when-cross-origin" && (r.header("Cache-Control") ?? "").includes("no-store"));
check("sin X-Powered-By", r.header("X-Powered-By") === null);
const inner = await ana.get("/perfil");
const missing = await anon.get("/no-existe");
check("las mismas cabeceras en una página protegida y en un 404", [inner, missing].every((x) => (x.header("Content-Security-Policy") ?? "").startsWith("default-src 'self'") && x.header("Strict-Transport-Security") && x.header("X-Robots-Tag")), `${inner.status} ${missing.status}`);

section("sesión vencida: un sitio ajeno no puede cerrar una sesión vigente");
const before = { ...ana.cookies };
r = await ana.get("/api/session/expired?destino=/perfil", { headers: { Referer: "https://sitio-ajeno.invalid/", "Sec-Fetch-Site": "cross-site" } });
check("con sesión vigente redirige al destino y no borra la cookie", r.status === 307 && (r.location ?? "").endsWith("/perfil") && r.setCookies.length === 0 && eq(ana.cookies, before), `${r.status} ${r.location}`);
check("y la sesión sigue sirviendo", (await ana.get("/perfil")).status === 200);
r = await ana.get("/api/session/expired?destino=https://sitio-ajeno.invalid/");
check("un destino externo se descarta", r.status === 307 && !(r.location ?? "").includes("sitio-ajeno"), r.location);
const victim = client("203.0.113.52");
await login(victim, "beto@example.com");
await stub(`/__test/revoke?token=${testToken("beto")}`);
r = await victim.get("/api/session/expired?destino=/perfil");
check("solo cuando la API da la sesión por inválida se borra la cookie", r.status === 307 && (r.location ?? "").includes("/acceso") && victim.token() === null, `${r.status} ${r.location}`);
await stub(`/__test/restore?token=${testToken("beto")}`);

section("página de error propia");
await stub("/__test/fail?op=clinics&mode=malformed&times=1");
r = await anon.get(`/clinicas/buscar?q=${probe("fallo")}`);
check("un dato inesperado del servicio da 500, no una página a medias", r.status === 500, r.status);
check("sin detalles técnicos: ni mensaje del error, ni traza, ni rutas de archivos", !/Objects are not valid|at [A-Za-z_$.]+ \(|node_modules|\.tsx?:\d+|digest|Error: /.test(r.body), r.body.length);
check("mantiene las cabeceras de seguridad", (r.header("Content-Security-Policy") ?? "").startsWith("default-src 'self'") && r.header("X-Robots-Tag") === "noindex, nofollow");
await stub("/__test/clear-failures");

section("límite de acceso por correo, con espera creciente");
const one = client("198.51.100.1");
await trace();
let messages = [];
for (let i = 0; i < 3; i++) messages.push(alertOf(await login(one, "ana@example.com", WRONG_PASSWORD)));
check("tres fallos: el aviso normal de credenciales", messages.every((m) => m.startsWith(WRONG)) && callsTo(await trace(), "/auth/login").length === 3, messages.at(-1));
r = await login(one, "ana@example.com", WRONG_PASSWORD);
check("cuarto fallo: aviso de espera de 30 segundos", alertOf(r) === `${TOO_MANY}30 segundos antes de volver a intentarlo.` && callsTo(await trace(), "/auth/login").length === 1, alertOf(r));
r = await login(one, "ana@example.com");
check("durante la espera ni la contraseña correcta entra, y no se llama a la API", r.status === 200 && alertOf(r).startsWith(TOO_MANY) && one.token() === null && (await trace()).length === 0, alertOf(r));
check("el aviso dice cuánto falta", /^Demasiados intentos\. Espera \d+ segundos antes de volver a intentarlo\.$/.test(alertOf(r)), alertOf(r));
r = await login(client("198.51.100.2"), "ana@example.com");
check("el límite por correo vale desde cualquier IP", alertOf(r).startsWith(TOO_MANY) && (await trace()).length === 0);
r = await login(client("198.51.100.2"), "ANA@Example.com");
check("y no distingue mayúsculas en el correo", alertOf(r).startsWith(TOO_MANY) && (await trace()).length === 0);

section("límite de acceso por IP del cliente");
const three = client("198.51.100.3");
await trace();
messages = [];
for (let n = 0; n < 5; n++) messages.push(alertOf(await login(three, `desconocido${n}@example.com`, WRONG_PASSWORD)));
check("cinco fallos con correos distintos desde una IP: aviso normal", messages.every((m) => m.startsWith(WRONG)) && callsTo(await trace(), "/auth/login").length === 5, messages.at(-1));
r = await login(three, "desconocido5@example.com", WRONG_PASSWORD);
check("sexto fallo desde esa IP: aviso de espera", alertOf(r) === `${TOO_MANY}30 segundos antes de volver a intentarlo.` && callsTo(await trace(), "/auth/login").length === 1, alertOf(r));
r = await login(three, "desconocido6@example.com", WRONG_PASSWORD);
check("otro correo desde la IP bloqueada: sin llamar a la API", alertOf(r).startsWith(TOO_MANY) && (await trace()).length === 0);
r = await login(three, "beto@example.com");
check("tampoco entra una cuenta válida desde esa IP", alertOf(r).startsWith(TOO_MANY) && three.token() === null && (await trace()).length === 0);
const four = client("198.51.100.4");
r = await login(four, "beto@example.com");
check("otra IP no está bloqueada", r.status === 303 && four.token() !== null, r.status);

section("un acceso correcto borra los fallos del correo");
const five = client("198.51.100.5");
for (let i = 0; i < 2; i++) await login(five, "beto@example.com", WRONG_PASSWORD);
check("dos fallos y después el acceso correcto", (await login(five, "beto@example.com")).status === 303);
await trace();
messages = [];
for (let i = 0; i < 3; i++) messages.push(alertOf(await login(client("198.51.100.6"), "beto@example.com", WRONG_PASSWORD)));
check("la cuenta vuelve a tener sus tres fallos libres", messages.every((m) => m.startsWith(WRONG)) && callsTo(await trace(), "/auth/login").length === 3, messages);

section("sin la cabecera del proxy");
const bare = new Browser();
await trace();
messages = [];
for (let n = 0; n < 7; n++) messages.push(alertOf(await login(bare, `sinproxy${n}@example.com`, WRONG_PASSWORD)));
check("no hay límite por IP: los siete intentos llegan a la API", messages.every((m) => m.startsWith(WRONG)) && callsTo(await trace(), "/auth/login").length === 7, messages.at(-1));
messages = [];
for (let i = 0; i < 3; i++) messages.push(alertOf(await login(bare, "sinproxy0@example.com", WRONG_PASSWORD)));
check("el límite por correo sigue activo", messages.at(-1).startsWith(TOO_MANY), messages);

section("tope de trámites por paciente y por hora");
page = await beto.get("/tramite/nuevo");
const startForm = page.forms("Empezar")[0];
await orq("/__test/reset-calls");
let created = 0;
for (let i = 0; i < 20; i++) {
  r = await beto.postForm("/tramite/nuevo", startForm);
  if (r.status === 303 && new RegExp(`/tramite/${UUID}`).test(r.location ?? "")) created++;
}
check("veinte trámites en una hora: todos se crean", created === 20 && (await orq("/__test/state")).calls["POST /api/v1/journeys"] === 20, created);
await orq("/__test/reset-calls");
r = await beto.postForm("/tramite/nuevo", startForm);
check("el vigésimo primero se rechaza sin llamar al orquestador", r.status === 200 && !("POST /api/v1/journeys" in (await orq("/__test/state")).calls), (await orq("/__test/state")).calls);
check("con un mensaje claro y el tiempo que falta", /Has empezado demasiados trámites en la última hora\. Podrás empezar otro en \d+ minutos\./.test(r.text()), r.text().slice(-140));
page = await ana.get(`/tramite/nuevo?estudio=${GLUCOSA}`);
r = await ana.postForm(page.path, page.forms("Empezar")[0]);
const journey = new RegExp(`/tramite/(${UUID})`).exec(r.location ?? "");
check("el tope es por paciente: Ana sí puede empezar el suyo", r.status === 303 && journey !== null, r.status);

section("tope de códigos de continuidad por paciente y por hora");
const path = journey ? `/tramite/${journey[1]}` : "/continuar";
page = await ana.get(path);
const codeForm = page.forms("Generar código de continuidad")[0];
await orq("/__test/reset-calls");
const EMIT = "POST /api/v1/journeys/:id/continuity-codes";
let issued = 0;
for (let i = 0; i < 30; i++) {
  r = await ana.postForm(path, codeForm);
  if (r.text().includes("Tu código de continuidad")) issued++;
}
check("treinta códigos en una hora: todos se emiten", issued === 30 && (await orq("/__test/state")).calls[EMIT] === 30, issued);
await orq("/__test/reset-calls");
r = await ana.postForm(path, codeForm);
check("el trigésimo primero se rechaza sin llamar al orquestador", !r.text().includes("Tu código de continuidad") && !(EMIT in (await orq("/__test/state")).calls), (await orq("/__test/state")).calls);
check("con un mensaje claro y el tiempo que falta", /Has generado demasiados códigos en la última hora\. Podrás generar otro en \d+ minutos\./.test(r.text()), r.text().slice(-140));

section("la espera crece con cada fallo nuevo (espera real de 31 segundos)");
await sleep(31_000);
await trace();
r = await login(one, "ana@example.com", WRONG_PASSWORD);
check("pasada la primera espera, el siguiente fallo impone 1 minuto", alertOf(r) === `${TOO_MANY}1 minuto antes de volver a intentarlo.` && callsTo(await trace(), "/auth/login").length === 1, alertOf(r));
finish();
