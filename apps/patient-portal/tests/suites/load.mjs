// Prueba de carga sin dependencias: conexiones concurrentes durante un tiempo fijo por escenario. Mide peticiones por
// segundo, latencias p50 y p95 y llamadas a la API general y al orquestador por petición. Comprueba que todas las
// respuestas son 200. Los servicios simulados responden con la latencia de STUB_LATENCY_MS (por defecto, 100 ms).
// LOAD_CONCURRENCY y LOAD_SECONDS ajustan la carga; por defecto, 20 conexiones y 12 segundos por escenario.
import http from "node:http";
import { Browser, assertWiredToStub, getJson, signIn } from "../lib/client.mjs";
import { HOST, IDS, PORTS } from "../lib/config.mjs";
import { check, finish, section } from "../lib/report.mjs";
import { testPassword } from "../lib/secrets.mjs";

const { GLUCOSA, ALAMEDA } = IDS;
const CONCURRENCY = Number(process.env.LOAD_CONCURRENCY ?? 20);
const SECONDS = Number(process.env.LOAD_SECONDS ?? 12);
const WARMUP = 2;

await assertWiredToStub();

section("preparación: una sesión y un trámite con estudio y clínica");
const ana = new Browser();
const signed = await signIn(ana, "ana@example.com", testPassword());
const page = await ana.get(`/tramite/nuevo?estudio=${GLUCOSA}`);
const created = await ana.postForm(page.path, page.forms("Empezar")[0]);
const rid = /\/tramite\/([0-9a-f-]{36})/.exec(created.location)[1];
await ana.submit(`/tramite/${rid}`, ALAMEDA);
check("sesión y trámite preparados", signed.status === 303 && (await ana.get(`/tramite/${rid}`)).status === 200);
// La cookie se queda en memoria: no se escribe ni se imprime.
const cookie = Object.entries(ana.cookies).map(([k, v]) => `${k}=${v}`).join("; ");

const agent = new http.Agent({ keepAlive: true, maxSockets: CONCURRENCY });
function get(path, withCookie) {
  return new Promise((resolve) => {
    const started = process.hrtime.bigint();
    const ms = () => Number(process.hrtime.bigint() - started) / 1e6;
    const req = http.request({ host: HOST, port: PORTS.portal, path, method: "GET", agent, headers: { Accept: "text/html", ...(withCookie ? { Cookie: cookie } : {}) } }, (res) => {
      res.resume();
      res.on("end", () => resolve({ status: res.statusCode, ms: ms() }));
    });
    req.on("error", () => resolve({ status: 0, ms: ms() }));
    req.end();
  });
}
const totalCalls = async (port) => Object.values((await getJson(port, "/__test/state")).calls ?? {}).reduce((a, b) => a + b, 0);
const percentile = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : NaN);

async function run(name, path, withCookie = false) {
  // Calentamiento: llena cachés y compila la ruta. No cuenta.
  const warmEnd = Date.now() + WARMUP * 1000;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => { while (Date.now() < warmEnd) await get(path, withCookie); }));
  const apiBefore = await totalCalls(PORTS.api);
  const orqBefore = await totalCalls(PORTS.orchestrator);
  const latencies = [];
  const statuses = {};
  const startedAt = Date.now();
  const end = startedAt + SECONDS * 1000;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (Date.now() < end) {
        const { status, ms } = await get(path, withCookie);
        latencies.push(ms);
        statuses[status] = (statuses[status] ?? 0) + 1;
      }
    }),
  );
  const elapsed = (Date.now() - startedAt) / 1000;
  const api = (await totalCalls(PORTS.api)) - apiBefore;
  const orq = (await totalCalls(PORTS.orchestrator)) - orqBefore;
  latencies.sort((a, b) => a - b);
  console.log(
    `      ${name.padEnd(34)} ${(latencies.length / elapsed).toFixed(0).padStart(6)} pet/s | p50 ${percentile(latencies, 50).toFixed(1).padStart(6)} ms | p95 ${percentile(latencies, 95).toFixed(1).padStart(6)} ms | API general ${(api / latencies.length).toFixed(3)}/pet | orquestador ${(orq / latencies.length).toFixed(3)}/pet`,
  );
  const codes = Object.keys(statuses);
  check(`${name}: todas las respuestas son 200`, latencies.length > 0 && codes.length === 1 && codes[0] === "200", statuses);
}

section(`carga: ${CONCURRENCY} conexiones, ${SECONDS} s por escenario tras ${WARMUP} s de calentamiento`);
await run("catálogo: /estudios", "/estudios");
await run("catálogo: /estudios/[id]", `/estudios/${GLUCOSA}`);
await run("catálogo: búsqueda", "/estudios/buscar?q=demo");
await run("/mi-espacio con sesión", "/mi-espacio", true);
await run("trámite: /tramite/[id] en revisión", `/tramite/${rid}`, true);
agent.destroy();
finish();
