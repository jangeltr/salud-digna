// Comprobaciones con el mismo formato en todas las suites: «ok» o «FALLA», y una línea final con el recuento
// que lee el lanzador. Nunca se imprimen claves, permisos, tokens, contraseñas ni códigos.
import { VERBOSE } from "./config.mjs";

const results = [];

function describe(detail) {
  if (detail === undefined || detail === null || detail === "") return "";
  return `  ->  ${typeof detail === "string" ? detail : JSON.stringify(detail)}`;
}

export function check(name, ok, detail = "") {
  results.push(Boolean(ok));
  if (VERBOSE || !ok) console.log(`${ok ? "ok    " : "FALLA "}${name}${describe(detail)}`);
}

export function section(title) {
  console.log(`--- ${title}`);
}

export function finish() {
  const passed = results.filter(Boolean).length;
  console.log(`\nRESULTADO: ${passed}/${results.length} comprobaciones correctas`);
  process.exit(passed === results.length ? 0 : 1);
}

/** Igualdad estructural, con las claves de los objetos en cualquier orden. */
export function eq(a, b) {
  return canonical(a) === canonical(b);
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
