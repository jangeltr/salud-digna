// Encabezado y carcasa en un navegador real sin interfaz, por el protocolo de depuración de Chrome.
// Sirve para los dos modos de trámites. Solo habla con el portal bajo prueba.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BASE, DIRS, PORTS } from "../lib/config.mjs";
import { testPassword } from "../lib/secrets.mjs";

const debugPort = PORTS.browser;
const base = BASE;
// Las capturas van a la carpeta temporal de la ejecución, que el lanzador borra al terminar.
const outDir = join(DIRS.work, "capturas");
mkdirSync(outDir, { recursive: true });
const PASSWORD = testPassword();

const results = [];
function check(name, ok, detail = "") {
  results.push(Boolean(ok));
  console.log((ok ? "ok    " : "FALLA ") + name + (detail !== "" ? `  ->  ${detail}` : ""));
}
const section = (title) => console.log(`--- ${title}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});
let nextId = 0;
const pending = new Map();
ws.onmessage = (message) => {
  const data = JSON.parse(message.data);
  const waiter = data.id && pending.get(data.id);
  if (!waiter) return;
  pending.delete(data.id);
  if (data.error) waiter.reject(new Error(data.error.message));
  else waiter.resolve(data.result);
};
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

const LIB = `
const q = (s) => document.querySelector(s);
const box = (el) => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left) }; };
const active = () => { const el = document.activeElement; const cs = getComputedStyle(el); return { tag: el.tagName.toLowerCase(), text: el.textContent.trim().replace(/\\s+/g, " ").slice(0, 40), outline: cs.outlineStyle + " " + cs.outlineWidth, offset: cs.outlineOffset }; };
const navShown = () => getComputedStyle(q("header nav")).display !== "none";
const links = () => [...document.querySelectorAll("header nav a")].map((a) => ({ text: a.textContent.trim(), href: a.getAttribute("href"), current: a.getAttribute("aria-current"), ...box(a) }));
const overflow = () => document.documentElement.scrollWidth - document.documentElement.clientWidth;
`;
async function ev(body) {
  const result = await send("Runtime.evaluate", { expression: `(() => { ${LIB} return (${body}); })()`, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}
async function waitFor(body, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      if (await ev(body)) return true;
    } catch {
      // La página puede estar a media navegación.
    }
    await sleep(100);
  }
  return false;
}
async function goto(path) {
  await send("Page.navigate", { url: base + path });
  const loaded = await waitFor(`document.readyState === "complete" && location.pathname === ${JSON.stringify(path.split("?")[0])}`);
  await sleep(400);
  return loaded;
}
const viewport = (width, height, mobile) => send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
async function key(name, code, vk, text) {
  const common = { key: name, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
  await send("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", ...common, ...(text ? { text } : {}) });
  await send("Input.dispatchKeyEvent", { type: "keyUp", ...common });
  await sleep(120);
}
const tab = () => key("Tab", "Tab", 9);
const enter = () => key("Enter", "Enter", 13, "\r");
const space = () => key(" ", "Space", 32, " ");
async function click(elementExpression) {
  const point = await ev(`(() => { const r = (${elementExpression}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  for (const type of ["mousePressed", "mouseReleased"]) {
    await send("Input.dispatchMouseEvent", { type, x: point.x, y: point.y, button: "left", clickCount: 1 });
  }
  await sleep(150);
}
async function shot(name) {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(outDir, name), Buffer.from(data, "base64"));
}
const linkByText = (text) => `[...document.querySelectorAll("header nav a")].find((a) => a.textContent.trim() === ${JSON.stringify(text)})`;
const sizes = (items) => items.map((l) => `${l.text} ${l.w}×${l.h}`).join(", ");
const allBig = (items) => items.length > 0 && items.every((l) => l.h >= 44 && l.w >= 44);

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setFocusEmulationEnabled", { enabled: true });

// ---------------------------------------------------------------------------
section("teléfono de 360 px, sin sesión");
await viewport(360, 740, true);
check("la página carga", await goto("/"));
let state = await ev(`({ overflow: overflow(), summary: box(q("header summary")), brand: box(q("header a")), nav: navShown(), header: box(q("header")) })`);
check("sin desbordamiento horizontal", state.overflow <= 0, `${state.overflow} px`);
check("el menú arranca plegado", state.nav === false);
check("«Menú» mide al menos 44 × 44 px", state.summary.w >= 44 && state.summary.h >= 44, `${state.summary.w}×${state.summary.h}`);
check("el nombre del portal y «Menú» comparten fila", Math.abs(state.summary.top - state.brand.top) <= 1, `encabezado plegado de ${state.header.h} px`);

await tab();
let focus = await ev("active()");
check("Tab 1: «Saltar al contenido»", focus.text === "Saltar al contenido", focus.text);
await tab();
focus = await ev("active()");
check("Tab 2: nombre del portal", focus.tag === "a" && focus.text === "Portal del Paciente", focus.text);
await tab();
focus = await ev("active()");
check("Tab 3: «Menú», con recuadro de foco visible y por dentro", focus.tag === "summary" && focus.text === "Menú" && focus.outline === "solid 3px" && focus.offset === "-3px", `${focus.tag} ${focus.outline} ${focus.offset}`);
await enter();
check("Intro despliega el menú", await ev(`navShown() && q("header details").open`));
await tab();
focus = await ev("active()");
check("Tab siguiente: primer enlace, con recuadro de foco", focus.text === "Estudios" && focus.outline === "solid 3px", `${focus.text} ${focus.outline}`);
await tab();
await tab();
focus = await ev("active()");
check("el último enlace sin sesión es «Acceso»", focus.text === "Acceso", focus.text);
let items = await ev("links()");
check("enlaces sin sesión: Estudios, Clínicas, Acceso", items.map((l) => l.text).join() === "Estudios,Clínicas,Acceso", items.map((l) => l.text).join());
check("cada enlace mide al menos 44 × 44 px", allBig(items), sizes(items));
state = await ev(`({ main: box(q("main")), header: box(q("header")), overflow: overflow() })`);
check("el menú abierto empuja el contenido, no lo tapa", state.main.top >= state.header.bottom, `encabezado ${state.header.h} px, contenido desde ${state.main.top}`);
check("sin desbordamiento con el menú abierto", state.overflow <= 0, `${state.overflow} px`);
await shot("telefono-360-sin-sesion.png");

await ev(`(q("header summary").focus(), true)`);
await space();
check("Espacio pliega el menú", (await ev("navShown()")) === false);
await click(`q("header summary")`);
check("un toque despliega el menú", await ev("navShown()"));
await click(linkByText("Clínicas"));
check("al elegir un enlace cambia la página", await waitFor(`location.pathname === "/clinicas"`));
await sleep(300);
state = await ev(`({ nav: navShown(), open: q("header details").open, current: links().find((l) => l.current)?.text })`);
check("tras navegar el menú queda plegado", state.nav === false && state.open === false, JSON.stringify(state));
check("el enlace de la página abierta queda marcado", state.current === "Clínicas", state.current);
await click(`q("header summary")`);
await click(linkByText("Clínicas"));
await sleep(300);
check("el enlace a la página ya abierta también pliega el menú", (await ev("navShown()")) === false);

// ---------------------------------------------------------------------------
section("teléfono de 360 px, con sesión");
await goto("/acceso");
await ev(`(() => { const f = q("main form"); f.querySelector("[name=email]").value = "ana@example.com"; f.querySelector("[name=password]").value = ${JSON.stringify(PASSWORD)}; f.requestSubmit(); return true; })()`);
const signedIn = await waitFor(`location.pathname === "/mi-espacio"`, 20000);
check("acceso desde el navegador contra la API simulada", signedIn, await ev("location.pathname + location.search"));
await sleep(400);
check("con sesión el menú también arranca plegado", (await ev("navShown()")) === false);
await click(`q("header summary")`);
items = await ev("links()");
const expected = "Estudios,Clínicas,Mi espacio,Continuar,Citas,Ayuda,Perfil";
check("el menú da acceso a todas las secciones", items.map((l) => l.text).join() === expected, items.map((l) => l.text).join());
check("cada enlace mide al menos 44 × 44 px", allBig(items), sizes(items));
check("un enlace por fila", new Set(items.map((l) => l.top)).size === items.length);
state = await ev(`({ overflow: overflow(), header: box(q("header")), main: box(q("main")), current: links().find((l) => l.current)?.text })`);
check("sin desbordamiento horizontal", state.overflow <= 0, `${state.overflow} px`);
check("el contenido queda debajo del menú abierto", state.main.top >= state.header.bottom, `encabezado abierto de ${state.header.h} px`);
check("«Mi espacio» marcado como página actual", state.current === "Mi espacio", state.current);
await shot("telefono-360-con-sesion.png");
await ev(`(q("header summary").focus(), true)`);
for (const label of expected.split(",")) {
  await tab();
  focus = await ev("active()");
  if (focus.text !== label) {
    check(`teclado: el foco llega a «${label}»`, false, focus.text);
  }
}
check("teclado: Tab recorre los siete enlaces en orden", focus.text === "Perfil", focus.text);
await enter();
check("teclado: Intro sobre un enlace abre su sección", await waitFor(`location.pathname === "/perfil"`));
await sleep(300);
check("tras navegar con teclado el menú queda plegado", (await ev("navShown()")) === false);

section("teléfono de 320 px, con sesión");
await viewport(320, 568, true);
await goto("/citas");
state = await ev(`({ overflow: overflow(), summary: box(q("header summary")), brand: box(q("header a")) })`);
check("sin desbordamiento horizontal", state.overflow <= 0, `${state.overflow} px`);
check("el nombre del portal y «Menú» siguen en la misma fila", Math.abs(state.summary.top - state.brand.top) <= 1);
await click(`q("header summary")`);
items = await ev("links()");
check("cada enlace mide al menos 44 × 44 px", allBig(items), sizes(items));

// ---------------------------------------------------------------------------
section("escritorio de 1280 px, con sesión");
await viewport(1280, 800, false);
await goto("/continuar");
state = await ev(`({ toggle: getComputedStyle(q("header details")).display, nav: navShown(), overflow: overflow(), brand: box(q("header a")), header: box(q("header")) })`);
items = await ev("links()");
check("el botón «Menú» no existe en pantallas anchas", state.toggle === "none", state.toggle);
check("la navegación está siempre visible", state.nav === true);
check("muestra las siete secciones", items.map((l) => l.text).join() === expected, items.map((l) => l.text).join());
check("cada enlace mide al menos 44 px de alto y de ancho", allBig(items), sizes(items));
check("sin desbordamiento horizontal", state.overflow <= 0, `${state.overflow} px`);
const rows = new Set(items.map((l) => l.top)).size;
console.log(`      disposición: enlaces en ${rows} fila(s); ${items[0].top === state.brand.top ? "junto al nombre" : "debajo del nombre"}; encabezado de ${state.header.h} px`);
await tab();
await tab();
await tab();
focus = await ev("active()");
check("teclado: tras el nombre, Tab va directo al primer enlace", focus.text === "Estudios" && focus.outline === "solid 3px" && focus.offset === "-3px", `${focus.text} ${focus.outline} ${focus.offset}`);
await shot("escritorio-1280-con-sesion.png");

section("ancho de 640 px, donde cambia el diseño");
await viewport(640, 800, false);
await goto("/continuar");
state = await ev(`({ toggle: getComputedStyle(q("header details")).display, nav: navShown(), overflow: overflow() })`);
check("a 640 px la lista ya está visible y sin desbordamiento", state.toggle === "none" && state.nav && state.overflow <= 0, JSON.stringify(state));
await viewport(639, 800, false);
await sleep(200);
state = await ev(`({ toggle: getComputedStyle(q("header details")).display, nav: navShown() })`);
check("a 639 px vuelve el botón «Menú»", state.toggle !== "none" && state.nav === false, JSON.stringify(state));

// ---------------------------------------------------------------------------
section("teléfono de 360 px, con JavaScript desactivado");
await viewport(360, 740, true);
await send("Emulation.setScriptExecutionDisabled", { value: true });
await goto("/");
items = await ev("links()");
check("sin JavaScript, la portada en caché muestra «Acceso» aunque haya sesión", items.map((l) => l.text).join() === "Estudios,Clínicas,Acceso", items.map((l) => l.text).join());
await goto("/mi-espacio");
check("el menú arranca plegado", (await ev("navShown()")) === false);
await tab();
await tab();
await tab();
focus = await ev("active()");
await enter();
check("sin JavaScript, Intro sobre «Menú» despliega la lista", focus.tag === "summary" && (await ev("navShown()")), focus.tag);
items = await ev("links()");
check("sin JavaScript se ven las siete secciones", items.map((l) => l.text).join() === expected, items.map((l) => l.text).join());
await click(linkByText("Ayuda"));
check("sin JavaScript el enlace navega", await waitFor(`location.pathname === "/ayuda" && document.readyState === "complete"`));
check("y la página nueva llega con el menú plegado", (await ev("navShown()")) === false);
await send("Emulation.setScriptExecutionDisabled", { value: false });

console.log(`\nRESULTADO: ${results.filter(Boolean).length}/${results.length} comprobaciones correctas`);
await send("Browser.close").catch(() => undefined);
ws.close();
process.exit(results.every(Boolean) ? 0 : 1);
