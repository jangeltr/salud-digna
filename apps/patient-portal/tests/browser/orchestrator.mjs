// Modo orquestador en un navegador real sin interfaz, por el protocolo de depuración de Chrome.
// Solo habla con el portal bajo prueba.
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
const text = (el) => (el ? el.textContent.trim().replace(/\\s+/g, " ") : null);
const box = (el) => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, top: Math.round(r.top), bottom: Math.round(r.bottom) }; };
const byText = (selector, label) => [...document.querySelectorAll(selector)].find((el) => text(el) === label);
const h2s = () => [...document.querySelectorAll("main h2")].map(text);
const overflow = () => document.documentElement.scrollWidth - document.documentElement.clientWidth;
const controls = () => [...document.querySelectorAll("main button, main a")].filter((el) => el.getClientRects().length > 0).map((el) => ({ text: text(el).slice(0, 40), inline: getComputedStyle(el).display === "inline", ...box(el) }));
`;
async function ev(body) {
  const result = await send("Runtime.evaluate", { expression: `(() => { ${LIB} return (${body}); })()`, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}
async function waitFor(body, timeout = 20000) {
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
async function click(elementExpression) {
  await ev(`((${elementExpression}).scrollIntoView({ block: "center" }), true)`);
  await sleep(150);
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
// La política de permisos del portal impide leer el portapapeles. Se espía la escritura real:
// el espía anota el texto y llama a la función original, así que «Copiado.» sigue probando que el navegador la aceptó.
const SPY = `(() => { if (window.__spied) return true; const original = navigator.clipboard.writeText.bind(navigator.clipboard); navigator.clipboard.writeText = (value) => { window.__copied = value; return original(value); }; window.__spied = true; return true; })()`;
// Objetivos táctiles: se miden botones y enlaces con forma de botón. Los enlaces dentro de un párrafo quedan fuera.
const small = (items) => items.filter((item) => !item.inline && (item.h < 44 || item.w < 44));
const describe = (items) => items.map((item) => `${item.text} ${item.w}×${item.h}`).join(", ");

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setFocusEmulationEnabled", { enabled: true });
await send("Browser.grantPermissions", { origin: base, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] }).catch(() => undefined);

// ---------------------------------------------------------------------------
section("teléfono de 360 px: flujo con clics reales");
await viewport(360, 740, true);
await goto("/acceso");
await ev(`(() => { const f = q("main form"); f.querySelector("[name=email]").value = "beto@example.com"; f.querySelector("[name=password]").value = ${JSON.stringify(PASSWORD)}; f.requestSubmit(); return true; })()`);
check("acceso desde el navegador contra la API simulada", await waitFor(`location.pathname === "/mi-espacio"`));
await goto("/tramite/nuevo");
await click(`byText("main button", "Empezar un trámite nuevo") ?? byText("main button", "Empezar el trámite")`);
check("empezar el trámite lleva a /tramite/<id>", await waitFor(`/^\\/tramite\\/[0-9a-f-]{36}$/.test(location.pathname) && h2s().includes("Elige un estudio")`), await ev("location.pathname"));
const id = await ev(`location.pathname.split("/")[2]`);
await click(`byText("main button", "Elegir este estudio")`);
check("elegir estudio: paso clínica", await waitFor(`h2s().includes("Elige una clínica")`), (await ev("h2s()")).join());
await click(`byText("main button", "Elegir esta clínica")`);
check("elegir clínica: revisión", await waitFor(`h2s().includes("Revisa tu trámite")`), (await ev("h2s()")).join());
let state = await ev(`({ overflow: overflow(), controls: controls(), steps: [...document.querySelectorAll('nav[aria-label="Avance del trámite"] li')].map(text) })`);
check("avance con tres pasos", state.steps.length === 3 && state.steps[2].includes("Revisión"), state.steps.join(" | "));
check("revisión sin desbordamiento horizontal", state.overflow <= 0, `${state.overflow} px`);
check("botones y enlaces de la revisión de al menos 44 × 44 px", small(state.controls).length === 0, describe(small(state.controls)) || describe(state.controls));
await shot("orq-revision-360.png");

section("continuar en otro canal");
const statuses = `[...document.querySelectorAll('main [role="status"]')].map(text)`;
check("la sección se ofrece en la revisión", (await ev(`h2s().includes("Continuar en otro canal") && !!byText("main button", "Generar código de continuidad")`)) === true);
check("antes de pulsar no hay ningún código en la página", (await ev(`!document.body.innerText.includes("Tu código de continuidad")`)) === true);
await click(`byText("main button", "Generar código de continuidad")`);
check("al pulsar aparece el código", await waitFor(`document.body.innerText.includes("Tu código de continuidad") && !!q("main .font-mono.text-2xl")`), (await ev("h2s()")).join());
const code = await ev(`text(q("main .font-mono.text-2xl"))`);
check("código de 12 caracteres en grupos de cuatro", /^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(code ?? ""));
state = await ev(`({ overflow: overflow(), controls: controls(), expiry: /Vence a las \\d{2}:\\d{2}, hora del centro de México, en /.test(document.body.innerText), url: location.pathname + location.search, stored: Object.keys(localStorage).length + Object.keys(sessionStorage).length })`);
check("con su vencimiento", state.expiry);
check("la URL no cambia y el navegador no guarda nada", state.url === `/tramite/${id}` && state.stored === 0, `${state.url} almacenado=${state.stored}`);
check("sin desbordamiento y con objetivos de 44 px", state.overflow <= 0 && small(state.controls).length === 0, `${state.overflow} px ${describe(small(state.controls))}`);
await ev(SPY);
await click(`byText("main button", "Copiar código")`);
check("«Copiar código» anuncia «Copiado.»", await waitFor(`${statuses}.includes("Copiado.")`, 5000));
const copied = await ev(`window.__copied ?? null`);
check("el portapapeles contiene el código", copied === code, copied === code ? "coincide" : "distinto");
await shot("orq-continuidad-360.png");

await click(`byText("main button", "Enviar a confirmación")`);
check("enviar a confirmación: «Pendiente de confirmación»", await waitFor(`h2s().includes("Pendiente de confirmación")`), (await ev("h2s()")).join());
check("al cambiar de pantalla desaparece el «Copiado.» del código", (await ev(`!${statuses}.includes("Copiado.")`)) === true, (await ev(statuses)).join("|"));
state = await ev(`({ overflow: overflow(), controls: controls(), folio: text(q("main .font-mono")), other: document.body.innerText.includes("Puedes continuar en la app móvil o en Call Center."), notice: document.body.innerText.includes("Tu trámite se envió a confirmación.") })`);
check("muestra el folio del trámite", state.folio === id, state.folio === id ? "coincide con la URL" : "distinto");
check("texto de continuidad y aviso de envío", state.other && state.notice);
check("pendiente sin desbordamiento horizontal: el folio parte de línea", state.overflow <= 0, `${state.overflow} px`);
check("botones y enlaces de al menos 44 × 44 px", small(state.controls).length === 0, describe(small(state.controls)));

section("botón de copiar");
await ev(SPY);
await click(`byText("main button", "Copiar folio")`);
const announced = await waitFor(`[...document.querySelectorAll('main [role="status"]')].some((el) => text(el) === "Copiado.")`, 5000);
check("anuncia «Copiado.»", announced, await ev(`[...document.querySelectorAll('main [role="status"]')].map(text).join("|")`));
const clipboard = await ev(`window.__copied ?? null`);
check("el portapapeles contiene el folio", clipboard === id, clipboard === id ? "coincide" : String(clipboard).slice(0, 70));
await shot("orq-pendiente-360.png");

section("cancelar con confirmación previa");
check("antes de pedirlo no existe el botón que cancela", (await ev(`!byText("main button", "Sí, cancelar el trámite")`)) === true);
await click(`byText("main a", "Cancelar trámite")`);
check("pide confirmación en la misma página", await waitFor(`location.search === "?cancelar=1" && h2s().includes("¿Cancelar este trámite?")`), await ev("location.search"));
check("al abrir la confirmación de cancelar desaparece «Copiado.»", (await ev(`!${statuses}.includes("Copiado.")`)) === true, (await ev(statuses)).join("|"));
await sleep(400);
state = await ev(`({ overflow: overflow(), controls: controls(), visible: (() => { const r = q("#cancelar").getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; })() })`);
check("la confirmación queda a la vista", state.visible);
check("sus dos salidas miden al menos 44 × 44 px y no desbordan", small(state.controls).length === 0 && state.overflow <= 0, describe(small(state.controls)));
await shot("orq-cancelar-360.png");
await click(`byText("main a", "No, conservar el trámite")`);
check("«No, conservar el trámite» vuelve sin cancelar", await waitFor(`location.search === "" && !byText("main button", "Sí, cancelar el trámite") && h2s().includes("Pendiente de confirmación")`), await ev("location.search"));
await click(`byText("main a", "Cancelar trámite")`);
await waitFor(`!!byText("main button", "Sí, cancelar el trámite")`);
await click(`byText("main button", "Sí, cancelar el trámite")`);
check("«Sí, cancelar el trámite» lo cierra", await waitFor(`document.body.innerText.includes("Trámite cancelado.") && h2s().includes("Trámite cerrado")`), (await ev("h2s()")).join());
check("ya no ofrece cancelar", (await ev(`!byText("main a", "Cancelar trámite")`)) === true);

section("historial");
await click(`byText("main a", "Ver el historial del trámite")`);
check("abre /tramite/<id>/historial", await waitFor(`location.pathname === ${JSON.stringify(`/tramite/${id}/historial`)} && !!q("main ol")`), await ev("location.pathname"));
state = await ev(`({ overflow: overflow(), items: [...document.querySelectorAll("main ol > li")].map(text), controls: controls() })`);
check("línea de tiempo de creado a cancelado", state.items.length === 5 && state.items[0].startsWith("Trámite creado") && state.items[4].startsWith("Trámite cancelado"), state.items.map((item) => item.split(" En ")[0]).join(" > "));
check("cada evento con canal y fecha", state.items.every((item) => /En la web · .*\d{4}/.test(item)), state.items[0]);
check("historial sin desbordamiento y con objetivos de 44 px", state.overflow <= 0 && small(state.controls).length === 0, `${state.overflow} px ${describe(small(state.controls))}`);
await shot("orq-historial-360.png");

section("tengo un código de continuidad");
await goto("/continuar");
state = await ev(`({ overflow: overflow(), title: h2s().includes("Tengo un código de continuidad"), input: q("#codigo") ? box(q("#codigo")) : null, controls: controls() })`);
check("/continuar muestra el campo del código", state.title && state.input !== null);
check("campo y botón de al menos 44 px de alto, sin desbordamiento", state.input && state.input.h >= 44 && small(state.controls).length === 0 && state.overflow <= 0, `${state.input?.h} ${describe(small(state.controls))}`);
await ev(`(() => { const input = q("#codigo"); input.value = "abc"; input.form.requestSubmit(); return true; })()`);
check("un código mal escrito muestra el mensaje único junto al campo", await waitFor(`text(q("#codigo-error"))?.startsWith("El código no es válido, venció o ya se usó.")`), await ev(`text(q("#codigo-error"))`));
check("el campo vuelve vacío y queda marcado como inválido", (await ev(`q("#codigo").value === "" && q("#codigo").getAttribute("aria-invalid") === "true"`)) === true);
await shot("orq-canje-360.png");

section("escritorio de 1280 px");
await viewport(1280, 800, false);
await goto("/continuar");
state = await ev(`({ overflow: overflow(), h1: text(q("main h1")) })`);
check("/continuar carga sin desbordamiento", state.h1 === "Continuar" && state.overflow <= 0, `${state.h1} ${state.overflow} px`);
await shot("orq-continuar-1280.png");

console.log(`\nRESULTADO: ${results.filter(Boolean).length}/${results.length} comprobaciones correctas`);
await send("Browser.close").catch(() => undefined);
ws.close();
process.exit(results.every(Boolean) ? 0 : 1);
