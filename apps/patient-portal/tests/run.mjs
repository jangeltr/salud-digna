#!/usr/bin/env node
// Lanzador de las pruebas del portal. Solo usa Node y lo que ya instaló el proyecto.
//
//   node tests/run.mjs [grupo...] [--sin-compilar] [--sin-navegador]
//
// Grupos: heredado, orquestador, identidad, arranque, publicacion, carga. Sin grupo, o con «todo», los ejecuta todos.
//
// Reglas que aplica:
// - Todo en 127.0.0.1 y en puertos configurables (TEST_PORTAL_PORT, TEST_API_PORT, TEST_ORCHESTRATOR_PORT,
//   TEST_BROWSER_PORT). Nunca el 5173. Si un puerto está ocupado, se detiene sin tocar el proceso que lo ocupa.
// - Solo cierra los procesos que arrancó.
// - Fija todas las variables que lee el portal, así nunca se usan las de .env.local: la API general y el
//   orquestador son siempre los simulados de tests/stubs.
// - Las credenciales son sintéticas y se generan en cada ejecución. Nada se escribe en .data ni en .env.local:
//   los datos van a una carpeta temporal que se borra al terminar.
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

process.env.TEST_RUN_SECRET ??= randomBytes(32).toString("base64url");
const { API_URL, BASE, HOST, ORCHESTRATOR_URL, PORTS } = await import("./lib/config.mjs");
const { assertionKey, channelKey } = await import("./lib/secrets.mjs");

const TESTS = dirname(fileURLToPath(import.meta.url));
const PORTAL = resolve(TESTS, "..");
const NEXT = join(PORTAL, "node_modules", "next", "dist", "bin", "next");
const GROUPS = ["heredado", "orquestador", "identidad", "arranque", "publicacion", "carga"];

// Un «--» suelto, el que añaden algunos gestores de paquetes al pasar argumentos, se ignora.
const args = process.argv.slice(2).filter((arg) => arg !== "--");
const flags = new Set(args.filter((a) => a.startsWith("--")));
const unknownFlag = [...flags].find((flag) => !["--sin-compilar", "--sin-navegador"].includes(flag));
let groups = args.filter((a) => !a.startsWith("--"));
if (groups.length === 0 || groups.includes("todo")) groups = GROUPS;
const unknown = groups.find((group) => !GROUPS.includes(group));
if (unknown || unknownFlag) {
  console.error(`Uso: node tests/run.mjs [${GROUPS.join("|")}|todo]... [--sin-compilar] [--sin-navegador]`);
  process.exit(2);
}

// --- carpetas temporales -----------------------------------------------------------------------------------
const ROOT = mkdtempSync(join(tmpdir(), "portal-pruebas-"));
const WORK = join(ROOT, "trabajo");
mkdirSync(WORK);
let cleaned = false;
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  for (const child of children) stopProcess(child);
  rmSync(ROOT, { recursive: true, force: true });
}
process.on("exit", cleanup);
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    cleanup();
    process.exit(130);
  });
}

// --- procesos propios ----------------------------------------------------------------------------------------
const children = new Set();
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function startProcess(command, commandArgs, { env, cwd = PORTAL, log }) {
  const child = spawn(command, commandArgs, {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
    windowsHide: true,
  });
  if (log) {
    const write = (chunk) => writeFileSync(log, chunk, { flag: "a" });
    child.stdout.on("data", write);
    child.stderr.on("data", write);
  } else {
    child.stdout.resume();
    child.stderr.resume();
  }
  children.add(child);
  child.on("exit", () => children.delete(child));
  return child;
}

/** Cierra un proceso arrancado aquí y todos los suyos. Nunca otro. */
function stopProcess(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  else {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      // Ya había terminado.
    }
  }
  children.delete(child);
}

function portInUse(port) {
  return new Promise((done) => {
    const socket = net.connect({ host: HOST, port });
    socket.once("connect", () => {
      socket.destroy();
      done(true);
    });
    socket.once("error", () => done(false));
  });
}

async function waitForPortFree(port) {
  for (let i = 0; i < 40; i++) {
    if (!(await portInUse(port))) return;
    await sleep(250);
  }
  throw new Error(`el puerto ${port} sigue ocupado después de cerrar el proceso de prueba`);
}

async function stop(child, port) {
  stopProcess(child);
  if (port) await waitForPortFree(port);
}

/** Espera a que una URL responda algo. Devuelve el código HTTP, o 0 si no llegó a responder. */
async function waitForHttp(url, seconds = 90) {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    try {
      const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5000) });
      await response.body?.cancel();
      return response.status;
    } catch {
      await sleep(500);
    }
  }
  return 0;
}

// --- servicios simulados -------------------------------------------------------------------------------------
function baseEnv(extra = {}) {
  return { ...process.env, NEXT_TELEMETRY_DISABLED: "1", ...extra };
}

async function startStubs({ latency } = {}) {
  const env = baseEnv(latency ? { STUB_LATENCY_MS: String(latency) } : { STUB_LATENCY_MS: "" });
  const api = startProcess(process.execPath, [join(TESTS, "stubs", "general-api.mjs")], { env });
  const orchestrator = startProcess(process.execPath, [join(TESTS, "stubs", "orchestrator.mjs")], { env });
  if (!(await waitForHttp(`http://${HOST}:${PORTS.api}/__test/state`, 30))) throw new Error("la API general simulada no arrancó");
  if (!(await waitForHttp(`http://${HOST}:${PORTS.orchestrator}/__test/state`, 30))) throw new Error("el orquestador simulado no arrancó");
  return async () => {
    await stop(api, PORTS.api);
    await stop(orchestrator, PORTS.orchestrator);
  };
}

// --- portal bajo prueba ----------------------------------------------------------------------------------------
const LOOPBACK = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//;

/**
 * Todas las variables que lee el portal, con valores de prueba. Un valor vacío cuenta como definido:
 * Next no lo sustituye por el de .env.local.
 */
function portalEnv(overrides = {}) {
  const env = baseEnv({
    API_BASE_URL: API_URL,
    REQUESTS_BACKEND: "legacy",
    ORCHESTRATOR_BASE_URL: ORCHESTRATOR_URL,
    ORCHESTRATOR_API_KEY: channelKey("web"),
    PORTAL_DATA_DIR: join(ROOT, "datos"),
    REGISTRATION_ENABLED: "",
    FORWARD_CLIENT_IP: "",
    CATALOG_CACHE_SECONDS: "",
    PATIENT_IDENTITY_MODE: "",
    PATIENT_ASSERTION_PROVIDER: "",
    PATIENT_ASSERTION_SIMULATOR_KEY: assertionKey(),
    ...overrides,
  });
  for (const name of ["API_BASE_URL", "ORCHESTRATOR_BASE_URL"]) {
    if (!LOOPBACK.test(env[name]) && !overrides.allowRemoteForStartupCheck) {
      throw new Error(`${name} no apunta a un servicio simulado local: las pruebas no llaman a servicios desplegados.`);
    }
  }
  delete env.allowRemoteForStartupCheck;
  return env;
}

function describe(env) {
  const identity = env.PATIENT_IDENTITY_MODE === "assertion" ? ` + identidad assertion (${env.PATIENT_ASSERTION_PROVIDER || "pending"})` : "";
  return `servidor: ${BASE} (next start, producción) | modo: ${env.REQUESTS_BACKEND}${identity} | API general: ${env.API_BASE_URL} (simulada) | orquestador: ${env.ORCHESTRATOR_BASE_URL} (simulado) | servicios desplegados: ninguno`;
}

function clearFetchCache() {
  rmSync(join(PORTAL, ".next", "cache", "fetch-cache"), { recursive: true, force: true });
}

async function startPortal(overrides, { log, freshData = true } = {}) {
  const env = portalEnv(overrides);
  if (freshData) rmSync(env.PORTAL_DATA_DIR, { recursive: true, force: true });
  mkdirSync(env.PORTAL_DATA_DIR, { recursive: true });
  clearFetchCache();
  const child = startProcess(process.execPath, [NEXT, "start", "--hostname", HOST, "--port", String(PORTS.portal)], { env, log });
  const status = await waitForHttp(`${BASE}/robots.txt`);
  if (status !== 200) throw new Error(`el portal bajo prueba no arrancó (robots.txt: ${status})`);
  console.log(`\n${describe(env)}`);
  return { env, stop: () => stop(child, PORTS.portal) };
}

async function build() {
  const stopStubs = await startStubs();
  const env = portalEnv();
  console.log(`compilación de producción contra la API simulada: ${env.API_BASE_URL} | servicios desplegados: ninguno`);
  clearFetchCache();
  const result = spawnSync(process.execPath, [NEXT, "build"], { cwd: PORTAL, env, encoding: "utf8", windowsHide: true });
  await stopStubs();
  if (result.status !== 0) {
    console.log((result.stdout + result.stderr).split("\n").filter((line) => /rror|Failed/.test(line)).slice(0, 20).join("\n"));
    throw new Error("la compilación falló");
  }
  console.log("compilación correcta");
}

// --- suites --------------------------------------------------------------------------------------------------
const summary = [];

/**
 * Fallos que se conocen y se esperan: no hacen fallar la ejecución, pero se muestran.
 * shell en modo orquestador: el aviso «Dejaste este trámite en…» sale del canal de la última actividad que da la
 * API general, y en ese modo el trámite vive en el orquestador.
 */
const KNOWN = {
  "shell · orquestador": ["otro canal conocido: se nombra WhatsApp", "canal sin nombre en el portal: se muestra «otro canal»"],
};

function runNode(script, scriptArgs, env) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [script, ...scriptArgs], { cwd: PORTAL, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let output = "";
    const collect = (chunk) => {
      output += chunk;
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("exit", (code) => done({ code, output }));
  });
}

async function suite(label, script, scriptArgs, env) {
  console.log(`\n################ ${label}`);
  const { code, output } = await runNode(join(TESTS, script), scriptArgs, env);
  const lines = output.split("\n").map((line) => line.replace(/\r$/, ""));
  const verbose = process.env.VERBOSE === "1";
  // Además de fallos y resultado, las líneas informativas sangradas: mediciones de carga y datos de la ejecución.
  for (const line of lines) if (verbose || /^(FALLA|ABORTADO|OMITIDA|AVISO|RESULTADO|Error|\s+at |\s{6}\S)/.test(line)) console.log(line);
  const result = lines.find((line) => line.startsWith("RESULTADO:"))?.replace(/^RESULTADO: /, "").replace(/ comprobaciones correctas$/, "") ?? "sin resultado";
  const failed = lines.filter((line) => line.startsWith("FALLA ")).map((line) => line.slice(6).split("  ->  ")[0]);
  const known = KNOWN[label] ?? [];
  const skipped = lines.some((line) => line.startsWith("OMITIDA"));
  let state;
  if (skipped) state = "omitida";
  else if (code === 0) state = "ok";
  else if (known.length > 0 && failed.length === known.length && failed.every((name) => known.includes(name))) state = "fallos conocidos";
  else state = "FALLA";
  summary.push({ label, result, state });
  console.log(`estado: ${state}`);
}

function suiteEnv(portal, extra = {}) {
  return baseEnv({
    TEST_DATA_DIR: portal.env.PORTAL_DATA_DIR,
    TEST_WORK_DIR: WORK,
    TEST_PORTAL_LOG: portal.log ?? "",
    PORTAL_MODE: portal.env.REQUESTS_BACKEND,
    ...extra,
  });
}

// --- navegador real sin interfaz ---------------------------------------------------------------------------------
function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  return candidates.find((path) => path && existsSync(path));
}

async function browserSuite(label, script, portal) {
  if (flags.has("--sin-navegador")) {
    console.log(`\n################ ${label}\nOMITIDA: --sin-navegador`);
    summary.push({ label, result: "—", state: "omitida" });
    return;
  }
  const chrome = findChrome();
  if (!chrome) {
    console.log(`\n################ ${label}\nAVISO: no se encontró Chrome ni Chromium (define CHROME_PATH). Prueba omitida.`);
    summary.push({ label, result: "—", state: "omitida" });
    return;
  }
  const profile = mkdtempSync(join(ROOT, "chrome-"));
  const child = startProcess(
    chrome,
    [
      "--headless=new",
      `--remote-debugging-port=${PORTS.browser}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-sync",
      "--disable-default-apps",
      "--mute-audio",
      "--hide-scrollbars",
      "about:blank",
    ],
    { env: baseEnv() },
  );
  if (!(await waitForHttp(`http://${HOST}:${PORTS.browser}/json/version`, 40))) {
    await stop(child, PORTS.browser);
    console.log(`\n################ ${label}\nAVISO: Chrome no abrió el puerto de depuración. Prueba omitida.`);
    summary.push({ label, result: "—", state: "omitida" });
    return;
  }
  await suite(label, script, [], suiteEnv(portal));
  await stop(child, PORTS.browser);
}

// --- grupos ----------------------------------------------------------------------------------------------------
function freshLog(name) {
  const log = join(ROOT, `${name}.log`);
  rmSync(log, { force: true });
  return log;
}

async function withPortal(overrides, options, body) {
  const portal = await startPortal(overrides, options);
  portal.log = options?.log;
  try {
    await body(portal);
  } finally {
    await portal.stop();
  }
}

const groupRunners = {
  async heredado() {
    const stopStubs = await startStubs();
    try {
      await withPortal({}, { log: freshLog("heredado") }, async (portal) => {
        await suite("flow · heredado", "suites/flow.mjs", [], suiteEnv(portal));
        await suite("shell · heredado", "suites/shell.mjs", [], suiteEnv(portal));
        await suite("cache · heredado", "suites/cache.mjs", [], suiteEnv(portal));
        await browserSuite("navegador · heredado", "browser/shell.mjs", portal);
      });
    } finally {
      await stopStubs();
    }
  },

  async orquestador() {
    const orchestrator = { REQUESTS_BACKEND: "orchestrator" };
    let stopStubs = await startStubs();
    try {
      // Paso previo: con el portal en modo heredado se guardan los formularios que el modo orquestador oculta.
      await withPortal({}, {}, async (portal) => {
        await suite("captura de formularios · heredado", "suites/capture.mjs", [], suiteEnv(portal));
      });
      await fetch(`http://${HOST}:${PORTS.api}/__test/trace?clear=1`).then((r) => r.body?.cancel());
      const log = freshLog("orquestador");
      await withPortal(orchestrator, { log }, async (portal) => {
        await suite("orquestador · orquestador", "suites/orchestrator.mjs", [], suiteEnv(portal));
        await browserSuite("navegador del orquestador · orquestador", "browser/orchestrator.mjs", portal);
      });
      // Reinicio: se conserva el registro del canal Web, se pierden los permisos en memoria.
      await withPortal(orchestrator, { log, freshData: false }, async (portal) => {
        await suite("reinicio · orquestador", "suites/orchestrator.mjs", ["reinicio"], suiteEnv(portal));
      });
    } finally {
      await stopStubs();
    }
    // Suites comunes en modo orquestador, con servicios simulados nuevos.
    stopStubs = await startStubs();
    try {
      await withPortal(orchestrator, { log: freshLog("comunes") }, async (portal) => {
        await suite("shell · orquestador", "suites/shell.mjs", [], suiteEnv(portal));
        await suite("cache · orquestador", "suites/cache.mjs", [], suiteEnv(portal));
        await browserSuite("navegador · orquestador", "browser/shell.mjs", portal);
      });
    } finally {
      await stopStubs();
    }
  },

  async identidad() {
    const stopStubs = await startStubs();
    try {
      for (const [phase, provider] of [
        ["simulador", "simulator"],
        ["pendiente", "pending"],
      ]) {
        const overrides = { REQUESTS_BACKEND: "orchestrator", PATIENT_IDENTITY_MODE: "assertion", PATIENT_ASSERTION_PROVIDER: provider };
        await withPortal(overrides, { log: freshLog(`identidad-${phase}`) }, async (portal) => {
          await suite(`identidad · emisor ${phase}`, "suites/identity.mjs", [phase], suiteEnv(portal));
        });
      }
    } finally {
      await stopStubs();
    }
  },

  async arranque() {
    console.log("\n################ arranques que deben negarse");
    const cases = [
      ["emisor de simulación con el orquestador en un dominio remoto", { PATIENT_IDENTITY_MODE: "assertion", PATIENT_ASSERTION_PROVIDER: "simulator", ORCHESTRATOR_BASE_URL: "https://orquestador.example/api/v1" }, "El proveedor de acreditaciones de simulación solo arranca con servicios en localhost o 127.0.0.1."],
      ["emisor de simulación con la API general remota", { PATIENT_IDENTITY_MODE: "assertion", PATIENT_ASSERTION_PROVIDER: "simulator", API_BASE_URL: "https://api.example/api/v1" }, "El proveedor de acreditaciones de simulación solo arranca con servicios en localhost o 127.0.0.1."],
      ["modo assertion con REQUESTS_BACKEND=legacy", { PATIENT_IDENTITY_MODE: "assertion", REQUESTS_BACKEND: "legacy" }, "PATIENT_IDENTITY_MODE=assertion requiere REQUESTS_BACKEND=orchestrator."],
      ["PATIENT_IDENTITY_MODE inválido", { PATIENT_IDENTITY_MODE: "jwt" }, "PATIENT_IDENTITY_MODE debe ser none o assertion."],
      ["emisor inválido", { PATIENT_IDENTITY_MODE: "assertion", PATIENT_ASSERTION_PROVIDER: "real" }, "PATIENT_ASSERTION_PROVIDER debe ser pending o simulator."],
      ["clave de simulación ausente", { PATIENT_IDENTITY_MODE: "assertion", PATIENT_ASSERTION_PROVIDER: "simulator", PATIENT_ASSERTION_SIMULATOR_KEY: "" }, "PATIENT_ASSERTION_SIMULATOR_KEY debe tener 32 bytes en base64url, sin relleno."],
    ];
    let passed = 0;
    let total = 0;
    const check = (name, ok, detail = "") => {
      total++;
      if (ok) passed++;
      else console.log(`FALLA ${name}${detail ? `  ->  ${detail}` : ""}`);
    };
    // Los dominios .example no existen: el servidor se niega a arrancar antes de llamar a ningún servicio.
    const stopStubs = await startStubs();
    try {
      for (const [name, overrides, message] of cases) {
        const log = freshLog("arranque");
        const env = portalEnv({ REQUESTS_BACKEND: "orchestrator", ...overrides, allowRemoteForStartupCheck: true });
        for (const url of [env.API_BASE_URL, env.ORCHESTRATOR_BASE_URL]) {
          if (!LOOPBACK.test(url) && !/^https:\/\/[a-z.]+\.example\//.test(url)) throw new Error("solo se admiten dominios .example en los arranques inválidos");
        }
        clearFetchCache();
        const child = startProcess(process.execPath, [NEXT, "start", "--hostname", HOST, "--port", String(PORTS.portal)], { env, log });
        const status = await waitForHttp(`${BASE}/acceso`, 60);
        await sleep(300);
        await stop(child, PORTS.portal);
        const text = existsSync(log) ? readFileSync(log, "utf8").replace(/\x1b\[[0-9;]*m/g, "") : "";
        check(`${name}: responde 500`, status === 500, String(status));
        check(`${name}: registra el motivo`, text.includes(message));
        check(`${name}: sin secretos en el registro`, !text.includes(assertionKey()) && !text.includes(channelKey("web").split(".")[1]));
      }
    } finally {
      await stopStubs();
    }
    console.log(`\nRESULTADO: ${passed}/${total} comprobaciones correctas`);
    summary.push({ label: "arranques inválidos", result: `${passed}/${total}`, state: passed === total ? "ok" : "FALLA" });
    console.log(`estado: ${passed === total ? "ok" : "FALLA"}`);
  },

  async publicacion() {
    const stopStubs = await startStubs();
    const orchestrator = { REQUESTS_BACKEND: "orchestrator" };
    try {
      const log = freshLog("publicacion");
      await withPortal({ ...orchestrator, REGISTRATION_ENABLED: "true", FORWARD_CLIENT_IP: "true" }, { log }, async (portal) => {
        await suite("publicación · registro y IP encendidos", "suites/publication.mjs", ["abierto"], suiteEnv(portal));
      });
      await withPortal(orchestrator, { log }, async (portal) => {
        await suite("publicación · valores de producción", "suites/publication.mjs", ["cerrado"], suiteEnv(portal));
        await browserSuite("navegador de publicación · orquestador", "browser/publication.mjs", portal);
      });
    } finally {
      await stopStubs();
    }
  },

  async carga() {
    for (const mode of ["legacy", "orchestrator"]) {
      const stopStubs = await startStubs({ latency: Number(process.env.STUB_LATENCY_MS ?? 100) });
      try {
        await withPortal({ REQUESTS_BACKEND: mode }, { log: freshLog(`carga-${mode}`) }, async (portal) => {
          await suite(`carga · ${mode === "legacy" ? "heredado" : "orquestador"}`, "suites/load.mjs", [], suiteEnv(portal));
        });
      } finally {
        await stopStubs();
      }
    }
  },
};

// --- ejecución ----------------------------------------------------------------------------------------------------
let exitCode = 0;
try {
  for (const [name, port] of Object.entries(PORTS)) {
    if (await portInUse(port)) throw new Error(`el puerto ${port} (${name}) está ocupado por otro proceso: no se toca. Elige otro con TEST_*_PORT.`);
  }
  if (!existsSync(NEXT)) throw new Error("no se encuentra Next en node_modules: ejecuta «pnpm install» primero.");
  console.log(`pruebas del portal | grupos: ${groups.join(", ")} | puertos: portal ${PORTS.portal}, API ${PORTS.api}, orquestador ${PORTS.orchestrator}, navegador ${PORTS.browser}`);
  console.log("credenciales sintéticas generadas para esta ejecución | carpeta temporal propia, que se borra al terminar");
  if (!flags.has("--sin-compilar")) await build();
  for (const group of groups) await groupRunners[group]();
} catch (error) {
  console.log(`\nABORTADO: ${error.message}`);
  exitCode = 2;
}

console.log("\n=== resumen");
for (const { label, result, state } of summary) console.log(`${label.padEnd(48)} ${result.padEnd(8)} ${state}`);
if (summary.some((row) => row.state === "FALLA")) exitCode = exitCode || 1;
const leftovers = [];
for (const [name, port] of Object.entries(PORTS)) if (await portInUse(port)) leftovers.push(`${name} ${port}`);
console.log(`puertos de prueba al terminar: ${leftovers.length ? `ocupados: ${leftovers.join(", ")}` : "libres"} | 5173: sin tocar`);
cleanup();
process.exit(exitCode);
