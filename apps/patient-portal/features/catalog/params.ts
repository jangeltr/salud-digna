// Límites de los listados en docs/openapi.json: `q` hasta 100 caracteres y `page` entre 1 y 10 000.
export const LIMITS = { text: 100, maxPage: 10_000 } as const;

/** Tarjetas por página en el portal. El contrato admite `limit` entre 1 y 100. */
export const PAGE_SIZE = 12;

type RawParam = string | string[] | undefined;

/** Texto de búsqueda saneado: primer valor, sin espacios sobrantes y recortado al máximo del contrato. */
export function readText(value: RawParam): string {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first !== "string") return "";
  return first.replace(/\s+/g, " ").trim().slice(0, LIMITS.text).trim();
}

/** Número de página válido. Cualquier valor fuera de rango vuelve a la primera página. */
export function readPage(value: RawParam): number {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first !== "string" || !/^\d{1,5}$/.test(first)) return 1;
  const page = Number(first);
  return page >= 1 && page <= LIMITS.maxPage ? page : 1;
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

const pesos = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

/**
 * El precio llega como cadena decimal, por ejemplo "120.00". Solo se le da formato para mostrarlo.
 * Si no cumple el patrón del contrato se muestra tal cual.
 */
export function formatPrice(price: string): string {
  if (!/^\d+\.\d{2}$/.test(price)) return price;
  return `${pesos.format(price as `${number}`)} MXN`;
}

/** Compara ciudades sin distinguir mayúsculas ni acentos. */
export function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Construye la URL de un listado conservando solo los filtros con valor. */
export function listHref(path: string, filters: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(filters)) {
    if (value === undefined || value === "" || (name === "pagina" && value === 1)) continue;
    search.set(name, String(value));
  }
  return search.size > 0 ? `${path}?${search}` : path;
}
