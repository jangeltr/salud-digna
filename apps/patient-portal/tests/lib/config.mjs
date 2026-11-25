// Puertos y direcciones de las pruebas. Todo en 127.0.0.1. El lanzador los fija; las suites solo los leen.
// El puerto 5173 está reservado al servidor de desarrollo y nunca se usa.

const RESERVED = 5173;

function port(name, fallback) {
  const raw = process.env[name];
  const value = raw === undefined || raw === "" ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < 1024 || value > 65535) throw new Error(`${name} debe ser un puerto entre 1024 y 65535.`);
  if (value === RESERVED) throw new Error(`${name}: el puerto ${RESERVED} es del servidor de desarrollo y las pruebas no lo usan.`);
  return value;
}

export const PORTS = {
  portal: port("TEST_PORTAL_PORT", 5183),
  api: port("TEST_API_PORT", 4010),
  orchestrator: port("TEST_ORCHESTRATOR_PORT", 4011),
  browser: port("TEST_BROWSER_PORT", 9333),
};

const distinct = new Set(Object.values(PORTS));
if (distinct.size !== Object.keys(PORTS).length) throw new Error("Los puertos de prueba deben ser distintos entre sí.");

export const HOST = "127.0.0.1";
export const BASE = `http://${HOST}:${PORTS.portal}`;
export const API_URL = `http://${HOST}:${PORTS.api}/api/v1`;
export const ORCHESTRATOR_URL = `http://${HOST}:${PORTS.orchestrator}/api/v1`;
export const VERBOSE = process.env.VERBOSE === "1";

/** Datos del catálogo y de las cuentas del simulador de la API general. Todos sintéticos. */
export const IDS = {
  GLUCOSA: "00000000-0000-4000-8000-000000000201",
  BIOMETRIA: "00000000-0000-4000-8000-000000000202",
  ALAMEDA: "00000000-0000-4000-8000-000000000101",
  MIRADOR: "00000000-0000-4000-8000-000000000102",
  UNKNOWN: "00000000-0000-4000-8000-000000000999",
  ANA_ACCOUNT: "00000000-0000-4000-8000-000000000901",
  BETO_ACCOUNT: "00000000-0000-4000-8000-000000000902",
};

export const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** Carpetas temporales que el lanzador crea y borra al terminar. */
export const DIRS = {
  data: process.env.TEST_DATA_DIR ?? "",
  work: process.env.TEST_WORK_DIR ?? "",
  portalLog: process.env.TEST_PORTAL_LOG ?? "",
};
