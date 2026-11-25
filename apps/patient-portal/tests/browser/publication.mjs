// Publicación en un navegador real sin interfaz: la política de contenido no rompe nada, y la página de error.
// Solo habla con el portal bajo prueba y con la API general simulada.
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
const stubPort = PORTS.api;

const results = [];
function check(name, ok, detail = "") {
  results.push(Boolean(ok));
  console.log((ok ? "ok    " : "FALLA ") + name + (detail !== "" ? `  ->  ${detail}` : ""));
}
const section = (title) => console.log(`--- ${title}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const stub = (path) => fetch(`http://127.0.0.1:${stubPort}${path}`).then((r) => r.json());

const target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});
let nextId = 0;
const pending = new Map();
// Todo lo que el navegador anota como error: aquí aparecen las infracciones de la política de contenido.
const browserErrors = [];
ws.onmessage = (message) => {
  const data = JSON.parse(message.data);
  if (data.method === "Log.entryAdded" && ["error", "warning"].includes(data.params.entry.level)) browserErrors.push(`${data.params.entry.source}: ${data.params.entry.text}`.slice(0, 220));
  if (data.method === "Runtime.exceptionThrown") browserErrors.push(`excepción: ${data.params.exceptionDetails.exception?.description ?? data.params.exceptionDetails.text}`.slice(0, 220));
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
const byText = (selector, label) => [...document.querySelectorAll(selector)].find((el) => text(el) === label);
const h2s = () => [...document.querySelectorAll("main h2")].map(text);
const statuses = () => [...document.querySelectorAll('main [role="status"]')].map(text);
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
  await sleep(500);
  return loaded;
}
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
// Infracciones que el propio documento conoce. Se reinicia en cada página, así que se va acumulando aquí.
const domViolations = [];
async function collect(label) {
  const found = await ev(`(window.__csp ?? []).splice(0)`).catch(() => []);
  for (const item of found) domViolations.push(`${label}: ${item}`);
}

await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");
await send("Emulation.setFocusEmulationEnabled", { enabled: true });
await send("Emulation.setDeviceMetricsOverride", { width: 360, height: 740, deviceScaleFactor: 2, mobile: true });
await send("Page.addScriptToEvaluateOnNewDocument", { source: `window.__csp = []; document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(e.effectiveDirective + " <- " + (e.blockedURI || "en línea")));` });

// ---------------------------------------------------------------------------
section("la política de contenido deja funcionar la aplicación");
check("la portada carga", await goto("/"));
const csp = await ev(`fetch(location.href, { method: "HEAD" }).then((r) => r.headers.get("content-security-policy"))`);
check("la portada en caché lleva la política sin nonce", (csp ?? "").includes("script-src 'self' 'unsafe-inline'") && !/nonce-|unsafe-eval/.test(csp ?? ""));
const dynamicCsp = await ev(`fetch("/acceso", { method: "HEAD" }).then((r) => r.headers.get("content-security-policy"))`);
check("una página generada en cada petición lleva la política con nonce", /'nonce-[^']{16,}'/.test(dynamicCsp ?? "") && !/unsafe-inline|unsafe-eval/.test(dynamicCsp ?? ""));
await click(`q("header summary")`);
await click(`byText("header nav a", "Clínicas")`);
check("el JavaScript del portal se ejecuta: navegar pliega el menú", await waitFor(`location.pathname === "/clinicas" && getComputedStyle(q("header nav")).display === "none"`), await ev("location.pathname"));
await collect("clinicas");

await goto("/acceso");
check("sin enlace a «Crear cuenta» con el registro apagado", (await ev(`!byText("main a", "Crear cuenta")`)) === true);
await ev(`(() => { const f = q("main form"); f.querySelector("[name=email]").value = "carla@example.com"; f.querySelector("[name=password]").value = ${JSON.stringify(PASSWORD)}; f.requestSubmit(); return true; })()`);
check("acceso con el formulario hidratado", await waitFor(`location.pathname === "/mi-espacio"`), await ev("location.pathname"));
await collect("acceso");

await goto("/estudios");
await click(`q('main a[href^="/estudios/"]')`);
await waitFor(`/^\\/estudios\\/[0-9a-f-]{36}$/.test(location.pathname)`);
await click(`byText("main a", "Agendar este estudio")`);
await waitFor(`location.pathname === "/tramite/nuevo"`);
await sleep(400);
await click(`byText("main button", "Empezar un trámite nuevo") ?? byText("main button", "Empezar el trámite")`);
check("empezar el trámite desde un estudio", await waitFor(`/^\\/tramite\\/[0-9a-f-]{36}$/.test(location.pathname) && h2s().includes("Elige una clínica")`), (await ev("h2s()")).join());
await collect("tramite");
await click(`byText("main button", "Generar código de continuidad")`);
check("generar el código de continuidad", await waitFor(`document.body.innerText.includes("Tu código de continuidad")`));
await ev(`(() => { const original = navigator.clipboard.writeText.bind(navigator.clipboard); navigator.clipboard.writeText = (value) => { window.__copied = value; return original(value); }; return true; })()`);
await click(`byText("main button", "Copiar código")`);
check("copiar al portapapeles sigue permitido por Permissions-Policy", await waitFor(`statuses().includes("Copiado.")`, 5000), (await ev("statuses()")).join("|"));
const readBlocked = await ev(`navigator.clipboard.readText().then(() => "permitido", () => "bloqueado")`);
check("leer el portapapeles queda bloqueado", readBlocked === "bloqueado", readBlocked);
await click(`byText("main button", "Elegir esta clínica")`);
check("elegir clínica y llegar a la revisión", await waitFor(`h2s().includes("Revisa tu trámite")`), (await ev("h2s()")).join());
await click(`byText("main button", "Enviar a confirmación")`);
check("enviar a confirmación", await waitFor(`h2s().includes("Pendiente de confirmación")`));
await click(`byText("main a", "Cancelar trámite")`);
check("abrir la confirmación de cancelar", await waitFor(`h2s().includes("¿Cancelar este trámite?")`));
await click(`byText("main button", "Sí, cancelar el trámite")`);
check("cancelar el trámite", await waitFor(`h2s().includes("Trámite cerrado")`));
await collect("flujo");
await click(`byText("main a", "Ver el historial del trámite")`);
check("historial", await waitFor(`location.pathname.endsWith("/historial") && !!q("main ol")`));
await collect("historial");
await goto("/continuar");
await ev(`(() => { const input = q("#codigo"); input.value = "abc"; input.form.requestSubmit(); return true; })()`);
check("canje con código inválido: mensaje junto al campo", await waitFor(`text(q("#codigo-error"))?.startsWith("El código no es válido")`));
await collect("continuar");
await shot("pub-continuar-360.png");

section("aviso del límite de acceso");
await goto("/perfil");
await click(`byText("main button", "Cerrar sesión")`);
await waitFor(`location.pathname === "/acceso"`);
for (let attempt = 1; attempt <= 4; attempt++) {
  await ev(`(() => { const f = q("main form"); f.querySelector("[name=email]").value = "limite-navegador@example.com"; f.querySelector("[name=password]").value = "clave-equivocada-000"; f.requestSubmit(); return true; })()`);
  await waitFor(`!!q('main [role="alert"]') && !q("main button[disabled]")`, 8000);
  await sleep(300);
}
const limitMessage = await ev(`text(q('main [role="alert"]'))`);
check("al cuarto fallo el paciente ve cuánto debe esperar", /^Demasiados intentos\. Espera \d+ segundos antes de volver a intentarlo\.$/.test(limitMessage ?? ""), limitMessage ?? "");
await collect("limite");
await shot("pub-limite-360.png");

section("página de error propia");
await stub("/__test/fail?op=clinics&mode=malformed&times=1");
await send("Page.navigate", { url: `${base}/clinicas/buscar?q=fallo-navegador-${Date.now()}` });
check("muestra «Algo salió mal»", await waitFor(`location.pathname === "/clinicas/buscar" && text(q("main h1")) === "Algo salió mal"`, 15000), await ev(`text(q("h1"))`));
const shown = await ev(`document.body.innerText`);
check("sin detalles técnicos a la vista", !/Objects are not valid|digest|at \w+ \(|node_modules|\.tsx|Error:/.test(shown), shown.replace(/\s+/g, " ").slice(0, 160));
check("ofrece reintentar y volver al inicio", (await ev(`!!byText("main button", "Reintentar") && byText("main a", "Volver al inicio")?.getAttribute("href") === "/"`)) === true);
check("conserva el encabezado y el aviso de prototipo", (await ev(`!!q("header") && document.body.innerText.includes("Prototipo")`)) === true);
await shot("pub-error-360.png");
await stub("/__test/clear-failures");
// Un error de pintado deja en la consola el aviso propio de React, que no es una infracción de la política.
// Solo cuentan las infracciones de la política de contenido. El aviso de Permissions-Policy lo provoca esta prueba al intentar leer el portapapeles.
const afterError = browserErrors.splice(0).filter((entry) => /Content Security Policy|Refused to/i.test(entry));
await collect("error");

section("infracciones de la política de contenido en todo el recorrido");
check("ninguna infracción anotada por los documentos", domViolations.length === 0, domViolations.slice(0, 4).join(" | "));
check("ninguna infracción en la consola del navegador", afterError.length === 0, afterError.slice(0, 3).join(" | "));
// Comprobación de que la política se aplica de verdad: en una página con nonce, un manejador en línea queda bloqueado.
const tryInline = `(() => { const b = document.createElement("button"); b.setAttribute("onclick", "window.__inline = 1"); document.body.appendChild(b); b.click(); return window.__inline === 1 ? "ejecutado" : "bloqueado"; })()`;
await goto("/acceso");
const inline = await ev(tryInline);
await sleep(300);
const recorded = await ev(`(window.__csp ?? []).length`);
check("la política se aplica: un script en línea queda bloqueado y anotado", inline === "bloqueado" && recorded >= 1, `${inline}, ${recorded} infracción`);
// En el catálogo servido desde caché la política va sin nonce y admite scripts en línea, por diseño.
await goto("/");
check("en la portada en caché, la variante sin nonce admite scripts en línea", (await ev(tryInline)) === "ejecutado");
await goto("/estudios");
check("y aun así bloquea los recursos de otros orígenes", (await ev(`new Promise((done) => { const s = document.createElement("script"); s.src = "https://ejemplo-ajeno.invalid/x.js"; s.onerror = () => done("bloqueado"); s.onload = () => done("cargado"); document.head.appendChild(s); setTimeout(() => done("sin respuesta"), 3000); })`)) === "bloqueado" && (await ev(`(window.__csp ?? []).some((v) => v.startsWith("script-src"))`)) === true);

console.log(`\nRESULTADO: ${results.filter(Boolean).length}/${results.length} comprobaciones correctas`);
await send("Browser.close").catch(() => undefined);
ws.close();
process.exit(results.every(Boolean) ? 0 : 1);
