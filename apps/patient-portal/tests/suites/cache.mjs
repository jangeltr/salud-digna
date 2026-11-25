// Catálogo en caché, cookie indicadora, caché de sesión e índice del catálogo. Vale para los dos modos de trámites
// (PORTAL_MODE). Incluye una espera real de 61 segundos.
import { Browser, assertWiredToStub, signIn, stub } from "../lib/client.mjs";
import { IDS, UUID } from "../lib/config.mjs";
import { check, finish, section, sleep } from "../lib/report.mjs";
import { testPassword, testToken } from "../lib/secrets.mjs";

const { GLUCOSA, BIOMETRIA, ALAMEDA } = IDS;
const PASSWORD = testPassword();
const CACHE_SECONDS = Number(process.env.CATALOG_CACHE_SECONDS_EXPECTED ?? 300);
const SESSION = "__Host-portal-session";
const INDICATOR = "__Host-portal-signed-in";
const MODE = process.env.PORTAL_MODE ?? "legacy";
const UUID_RE = new RegExp(UUID, "g");

const calls = async () => (await stub("/__test/trace?clear=1")).map((e) => e.call.split("?")[0].replace(UUID_RE, "{id}"));
const count = (entries, fragment) => entries.filter((e) => e.includes(fragment)).length;
const login = (browser, email) => signIn(browser, email, PASSWORD);
const cookieLine = (response, name) => response.setCookies.find((c) => c.startsWith(`${name}=`)) ?? "";
function navLinks(page) {
  const head = /<header\b[\s\S]*?<\/header>/.exec(page.body);
  const nav = head ? /<nav\b[^>]*>[\s\S]*?<\/nav>/.exec(head[0]) : null;
  return nav ? [...nav[0].matchAll(/<a [^>]*href="([^"]*)"/g)].map((m) => m[1]) : [];
}

await assertWiredToStub();
const anon = new Browser();

section("catálogo servido desde caché");
const PUBLIC = `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}`;
const CATALOG = ["/", "/estudios", "/clinicas", `/estudios/${GLUCOSA}`];
for (const path of CATALOG) {
  const r = await anon.get(path);
  const csp = r.header("Content-Security-Policy") ?? "";
  check(`${path}: 200 con Cache-Control público de ${CACHE_SECONDS} s`, r.status === 200 && r.header("Cache-Control") === PUBLIC, r.header("Cache-Control"));
  check(`${path}: política sin nonce, con el resto de directivas`, !csp.includes("nonce-") && csp.includes("script-src 'self' 'unsafe-inline'") && csp.includes("frame-ancestors 'none'") && csp.includes("object-src 'none'"));
  check(`${path}: Next la sirve generada de antemano`, ["HIT", "MISS", "STALE"].includes(r.header("x-nextjs-cache")) || r.header("x-nextjs-prerender") === "1", r.header("x-nextjs-cache"));
}
await calls();
const again = [];
for (const path of CATALOG) again.push(await anon.get(path));
check("repetirlas no llama a la API general", (await calls()).length === 0 && again.every((r) => r.status === 200));

section("búsqueda y páginas siguientes, generadas en cada petición");
for (const path of ["/estudios/buscar?q=glu", "/clinicas/buscar?ciudad=Ciudad+Ejemplo", "/estudios/buscar?pagina=2"]) {
  const r = await anon.get(path);
  check(`${path}: privada, sin caché y con nonce`, r.status === 200 && (r.header("Cache-Control") ?? "").includes("no-store") && (r.header("Content-Security-Policy") ?? "").includes("'nonce-"), `${r.status} ${r.header("Cache-Control")}`);
}
for (const [old, next] of [
  ["/estudios?q=glu", "/estudios/buscar?q=glu"],
  ["/clinicas?ciudad=X&pagina=2", "/clinicas/buscar?ciudad=X&pagina=2"],
]) {
  const r = await anon.get(old);
  check(`enlace antiguo ${old}: redirige a la búsqueda`, r.status === 308 && r.location === next, `${r.status} ${r.location}`);
}
for (const [path, target] of [
  ["/estudios/buscar", "/estudios"],
  ["/clinicas/buscar", "/clinicas"],
]) {
  const r = await anon.get(path);
  check(`${path} sin filtros: vuelve a la página en caché`, [307, 303].includes(r.status) && (r.location ?? "").endsWith(target), `${r.status} ${r.location}`);
}
let r = await anon.get("/estudios/buscar?q=glu");
check("la búsqueda enlaza su formulario y su paginación a /estudios/buscar", r.body.includes('action="/estudios/buscar"'));
r = await anon.get("/");
check("el buscador de la portada apunta a /estudios/buscar", r.body.includes('action="/estudios/buscar"'));

section("la misma página para todos: nada del paciente en el catálogo en caché");
const ana = new Browser();
const signed = await login(ana, "ana@example.com");
check("acceso", signed.status === 303 && ana.token() !== null);
for (const path of CATALOG) {
  const mine = await ana.get(path);
  const theirs = await anon.get(path);
  check(`${path}: el HTML con sesión es idéntico al anónimo`, mine.body === theirs.body && mine.setCookies.length === 0);
}
check("ni el correo ni el nombre de la paciente aparecen", !(await ana.get("/")).body.includes("ana@example.com") && !navLinks(await ana.get("/")).includes("Ana"));

section("cookie indicadora");
const line = cookieLine(signed, INDICATOR);
const sessionLine = cookieLine(signed, SESSION);
const value = line ? line.split(";", 1)[0].split("=").slice(1).join("=") : "";
check("se crea al iniciar sesión, con el valor 1", value === "1", line.split(";", 1)[0].slice(0, 40));
check("sin ningún dato: ni el token ni identificadores", value === "1" && !line.includes(ana.token()));
const attrs = line.toLowerCase();
check("la lee el navegador: sin HttpOnly", !attrs.includes("httponly"));
check("Secure, SameSite=Lax y Path=/", attrs.includes("secure") && attrs.includes("samesite=lax") && attrs.includes("path=/"));
const maxAge = (text) => (/max-age=(\d+)/i.exec(text) ?? [null, null])[1];
check("vence con la sesión: el mismo Max-Age", maxAge(line) !== null && maxAge(line) === maxAge(sessionLine), `${maxAge(line)} ${maxAge(sessionLine)}`);
check("la cookie de sesión sigue siendo HttpOnly", sessionLine.toLowerCase().includes("httponly"));

section("encabezado");
check("en una página protegida lo decide el servidor, también sin JavaScript", navLinks(await ana.get("/mi-espacio")).includes("/mi-espacio") && !navLinks(await ana.get("/perfil")).includes("/acceso"));
const indicatorOnly = new Browser();
indicatorOnly.cookies[INDICATOR] = "1";
r = await indicatorOnly.get("/mi-espacio");
check("la cookie indicadora sola no abre nada: las rutas protegidas piden acceso", [302, 307].includes(r.status) && (r.location ?? "").includes("/acceso"), `${r.status} ${r.location}`);
r = await ana.get("/acceso?destino=/continuar");
check("«Acceso» con sesión abierta lleva al destino", r.status === 307 && (r.location ?? "").endsWith("/continuar"), `${r.status} ${r.location}`);

section("caché de sesión: una sola validación cada 60 segundos");
await calls();
for (const path of ["/mi-espacio", "/perfil", "/citas", "/ayuda", "/continuar", "/mi-espacio"]) {
  const page = await ana.get(path);
  if (page.status !== 200) throw new Error(`${path}: ${page.status}`);
}
let trace = await calls();
check("seis páginas protegidas seguidas: como mucho una llamada a /auth/me", count(trace, "/auth/me") <= 1, count(trace, "/auth/me"));

section("se invalida al cerrar sesión");
const oldToken = ana.token();
const perfil = await ana.get("/perfil");
const out = await ana.postForm("/perfil", perfil.forms("Cerrar sesión")[0]);
check("cerrar sesión borra las dos cookies", out.status === 303 && !(SESSION in ana.cookies) && !(INDICATOR in ana.cookies), Object.keys(ana.cookies).sort());
await calls();
const replay = new Browser();
replay.cookies[SESSION] = oldToken;
r = await replay.get("/mi-espacio");
check("la cookie anterior vuelve a validarse contra la API: el perfil guardado se borró", count(await calls(), "/auth/me") === 1, r.status);

section("se invalida ante un 401");
const BETO = testToken("beto");
const beto = new Browser();
await login(beto, "beto@example.com");
let page = await beto.get(`/tramite/nuevo?estudio=${GLUCOSA}`);
const created = await beto.postForm(page.path, page.forms("Empezar")[0]);
const rid = new RegExp(`/tramite/(${UUID})`).exec(created.location ?? "")[1];
const form = (await beto.get(`/tramite/${rid}`)).forms(ALAMEDA)[0];
await stub(`/__test/revoke?token=${BETO}`);
await calls();
r = await beto.get("/mi-espacio");
check("revocada en la API, la sesión aún abre páginas durante la caché (contrapartida documentada)", r.status === 200 && count(await calls(), "/auth/me") === 0);
const rr = await beto.postForm(`/tramite/${rid}`, form);
if (MODE === "legacy") {
  check("la primera operación con ese token recibe 401 y cierra la sesión", rr.status === 303 && (rr.location ?? "").includes("/acceso") && beto.token() === null, `${rr.status} ${rr.location}`);
  beto.cookies[SESSION] = BETO;
  await calls();
  r = await beto.get("/mi-espacio");
  check("ya no queda perfil guardado: la siguiente página valida y lleva a sesión vencida", [302, 307].includes(r.status) && (r.location ?? "").includes("/api/session/expired") && count(await calls(), "/auth/me") === 1, `${r.status} ${r.location}`);
  await beto.follow(r);
  check("la sesión vencida borra las dos cookies", !(SESSION in beto.cookies) && !(INDICATOR in beto.cookies), Object.keys(beto.cookies).sort());
} else {
  // Modo orquestador: ninguna operación del trámite lleva el token a la API general.
  check("modo orquestador: la operación no llega a la API general y la sesión sigue abierta (contrapartida documentada)", rr.status === 303 && !(rr.location ?? "").includes("/acceso") && beto.token() !== null, `${rr.status} ${rr.location}`);
}
await stub(`/__test/restore?token=${BETO}`);

section("índice del catálogo: ninguna llamada por elemento");
const CARLA = testToken("carla");
const carla = new Browser();
await login(carla, "carla@example.com");
for (const study of [GLUCOSA, BIOMETRIA, GLUCOSA]) {
  page = await carla.get(`/tramite/nuevo?estudio=${study}`);
  await carla.postForm(page.path, page.forms("Empezar")[0]);
}
await calls();
r = await carla.get("/continuar");
trace = await calls();
check("/continuar con tres trámites: ninguna llamada al catálogo", r.status === 200 && count(trace, "/studies") + count(trace, "/clinics") === 0, trace);
check("y sus nombres salen del índice", r.text().includes("Demo Glucosa") && r.text().includes("Demo Biometría hemática"));
// En modo orquestador la lista enlaza cada trámite; en el heredado, el trámite está en la API simulada.
const linked = new RegExp(`href="/tramite/(${UUID})"`).exec((await carla.get("/continuar")).body);
const first = linked ? linked[1] : (await stub("/__test/requests")).find((item) => item.owner === CARLA).id;
await carla.submit(`/tramite/${first}`, ALAMEDA);
await calls();
const review = await carla.get(`/tramite/${first}`);
trace = await calls();
check("el resumen del trámite: ninguna llamada al catálogo", count(trace, "/studies") + count(trace, "/clinics") === 0 && review.text().includes("Demo Clínica Alameda"));
await calls();
const filtered = await anon.get("/clinicas/buscar?ciudad=Ciudad+Ejemplo");
await anon.get("/clinicas/buscar?ciudad=Ciudad+Ejemplo&pagina=1");
check("el filtro por ciudad usa el índice ya cargado: ninguna llamada", count(await calls(), "/clinics") === 0 && filtered.status === 200 && filtered.text().includes("Demo Clínica Alameda"));
await calls();
const missing = await anon.get("/estudios/00000000-0000-4000-8000-00000000beef");
check("un estudio que no está en el índice completo: 404 sin llamar a la API", missing.status === 404 && count(await calls(), "/studies") === 0, missing.status);

section("la caché de sesión dura 60 segundos (espera real)");
await calls();
await carla.get("/mi-espacio");
check("dentro del plazo no se valida", count(await calls(), "/auth/me") === 0);
// Revocada en la API durante la espera: pasados los 60 segundos, la validación la detecta en cualquier modo.
await stub(`/__test/revoke?token=${CARLA}`);
await sleep(61_000);
r = await carla.get("/mi-espacio");
trace = await calls();
check("pasados 60 segundos se vuelve a validar una vez", count(trace, "/auth/me") === 1);
check("y una sesión revocada en la API deja de abrir páginas", [302, 307].includes(r.status) && (r.location ?? "").includes("/api/session/expired"), `${r.status} ${r.location}`);
await stub(`/__test/restore?token=${CARLA}`);

finish();
