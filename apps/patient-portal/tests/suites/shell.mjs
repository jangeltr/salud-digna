// Carcasa del portal sin JavaScript: sin rastro de la PWA, encabezado único con y sin sesión y aviso de continuidad.
// En modo orquestador fallan las dos últimas comprobaciones, que dependen del canal de la API general: ver README.
import { Browser, assertWiredToStub, clean, signIn, stub } from "../lib/client.mjs";
import { IDS } from "../lib/config.mjs";
import { check, eq, finish, section } from "../lib/report.mjs";
import { testPassword } from "../lib/secrets.mjs";

const { GLUCOSA } = IDS;
const ACCOUNT = ["/mi-espacio", "/continuar", "/citas", "/ayuda", "/perfil"];

function header(page) {
  const found = /<header\b[\s\S]*?<\/header>/.exec(page.body);
  return found ? found[0] : "";
}
function navLinks(page) {
  const nav = /<nav\b[^>]*>[\s\S]*?<\/nav>/.exec(header(page));
  return nav ? [...nav[0].matchAll(/<a [^>]*href="([^"]*)"/g)].map((m) => m[1]) : [];
}
/** GET sin decodificar, para recursos que no son HTML. */
async function raw(browser, path) {
  const r = await browser.get(path);
  return [r.status, r.header("Content-Type") ?? ""];
}

await assertWiredToStub();
const anon = new Browser();

section("sin rastro de la PWA");
const home = await anon.get("/");
const head = /<head>[\s\S]*?<\/head>/.exec(home.body)[0];
check("inicio responde 200", home.status === 200, home.status);
check("el HTML no enlaza ningún manifiesto", !home.body.includes('rel="manifest"'));
check("el HTML no menciona standalone ni el modo instalado", !/standalone|instalad|manifest/i.test(home.body));
for (const path of ["/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon-maskable-512.png"]) {
  const [status] = await raw(anon, path);
  check(`${path} ya no existe (404)`, status === 404, status);
}
const icon = /<link rel="icon" href="([^"]+)"/.exec(head);
check("el icono de pestaña sigue enlazado", icon !== null);
if (icon) {
  const [status, type] = await raw(anon, icon[1].replaceAll("&amp;", "&"));
  check("el icono de pestaña responde 200 con image/png", status === 200 && type.startsWith("image/png"), `${status} ${type}`);
}
const sheets = [...home.body.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
let css = "";
for (const href of sheets) css += (await anon.get(href.replaceAll("&amp;", "&"))).body;
check("hay hoja de estilos compilada", css.length > 1000, css.length);
check("el CSS no contiene display-mode ni standalone", !/display-mode|standalone/.test(css));
check("el CSS no contiene la utilidad de la barra inferior", !css.includes("safe-area-inset-bottom"));

section("encabezado sin sesión");
const h = header(home);
check("una sola navegación en la página, con etiqueta", (home.body.match(/<nav\b/g) ?? []).length === 1 && h.includes('aria-label="Principal"'));
check("no queda la barra inferior", !home.body.includes('aria-label="Aplicación"'));
check("enlaces sin sesión: Estudios, Clínicas y Acceso", eq(navLinks(home), ["/estudios", "/clinicas", "/acceso"]), navLinks(home));
const summary = /<details\b[^>]*>\s*<summary\b([^>]*)>([\s\S]*?)<\/summary>\s*<\/details>/.exec(h);
check("botón «Menú» nativo (details/summary) antes de la navegación", summary !== null && clean(summary[2]) === "Menú" && h.indexOf("<details") < h.indexOf("<nav"));
check("el botón mide al menos 44 px por sus clases", summary !== null && summary[0].includes("min-h-11") && summary[0].includes("min-w-11"));
const anchors = [.../<nav\b[\s\S]*?<\/nav>/.exec(h)[0].matchAll(/<a [^>]*class="([^"]*)"[^>]*>/g)].map((m) => m[1]);
check("cada enlace del menú lleva min-h-11 y min-w-11", anchors.length > 0 && anchors.every((c) => c.includes("min-h-11") && c.includes("min-w-11")), anchors.slice(0, 1));
check("el menú arranca plegado en teléfono y visible desde 640 px", /<nav [^>]*class="[^"]*\bhidden\b[^"]*peer-open:block[^"]*sm:block/.test(h));
for (const path of [...ACCOUNT, "/tramite/nuevo"]) {
  const r = await anon.get(path);
  check(`${path} sin sesión lleva a /acceso con el destino`, [302, 307].includes(r.status) && (r.location ?? "").endsWith(`/acceso?destino=${path.replaceAll("/", "%2F")}`), `${r.status} ${r.location}`);
}

section("encabezado con sesión");
const ana = new Browser();
const signed = await signIn(ana, "ana@example.com", testPassword());
check("acceso contra la API simulada", signed.status === 303 && ana.token() !== null, signed.status);
const page = await ana.get("/mi-espacio");
const expected = ["/estudios", "/clinicas", ...ACCOUNT];
check("con sesión el encabezado enlaza todas las secciones", eq(navLinks(page), expected), navLinks(page));
check("con sesión no aparece «Acceso»", !navLinks(page).includes("/acceso"));
const homeCached = await ana.get("/");
check("sin JavaScript, la portada en caché muestra «Acceso» también con sesión", eq(navLinks(homeCached), ["/estudios", "/clinicas", "/acceso"]), navLinks(homeCached));
const via = await ana.get("/acceso");
check("y «Acceso» con sesión abierta lleva al área personal", via.status === 307 && (via.location ?? "").endsWith("/mi-espacio"), `${via.status} ${via.location}`);
for (const path of expected) {
  const p = await ana.get(path);
  const current = /<a [^>]*aria-current="page"[^>]*href="([^"]*)"|<a [^>]*href="([^"]*)"[^>]*aria-current="page"/.exec(header(p));
  const marked = current ? (current[1] ?? current[2]) : null;
  check(`${path} responde 200 y marca su enlace como página actual`, p.status === 200 && marked === path, `${p.status} ${marked}`);
}
check("la sección interior marca su enlace con aria-current=true", /aria-current="true"[^>]*href="\/estudios"|href="\/estudios"[^>]*aria-current="true"/.test(header(await ana.get(`/estudios/${GLUCOSA}`))));
const perfil = await ana.get("/perfil");
check("cerrar sesión sigue disponible en /perfil", perfil.forms("Cerrar sesión").length === 1);

section("aviso de continuidad sin el canal retirado");
const start = await ana.get(`/tramite/nuevo?estudio=${GLUCOSA}`);
const created = await ana.postForm(start.path, start.forms("Empezar")[0]);
const rid = /\/tramite\/([0-9a-f-]{36})/.exec(created.location ?? "")[1];
await stub(`/__test/other-channel?id=${rid}&minutesAgo=120`);
check("otro canal conocido: se nombra WhatsApp", (await ana.get(`/tramite/${rid}`)).text().includes("Dejaste este trámite en WhatsApp hace 2 horas."));
await stub(`/__test/other-channel?id=${rid}&channel=MOBILE&minutesAgo=120`);
const text = (await ana.get(`/tramite/${rid}`)).text();
const notices = text.match(/Dejaste[^.]*\./g) ?? [];
check("canal sin nombre en el portal: se muestra «otro canal»", text.includes("Dejaste este trámite en otro canal hace 2 horas.") && !notices.some((s) => s.includes("la app")), notices);

finish();
