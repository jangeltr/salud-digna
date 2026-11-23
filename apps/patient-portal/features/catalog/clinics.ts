import "server-only";
import { listClinics, type Clinic } from "@/lib/api/catalog";
import type { ApiFailure } from "@/lib/api/client";
import { PAGE_SIZE, normalizeText } from "./params";

// El contrato no filtra por ciudad. Con ese filtro, el portal recorre el listado de la API
// en páginas del tamaño máximo y filtra los resultados en el servidor.
const SCAN_PAGE_SIZE = 100;
const MAX_SCAN_PAGES = 5;

/** Clínicas revisadas como máximo al filtrar por ciudad. */
export const CITY_SCAN_LIMIT = SCAN_PAGE_SIZE * MAX_SCAN_PAGES;

export type ClinicSearch = {
  ok: true;
  items: Clinic[];
  hasMore: boolean;
  /** El filtro por ciudad alcanzó el tope de clínicas revisadas y puede faltar alguna. */
  truncated: boolean;
};

type Search = { q: string; city: string; page: number };

export async function searchClinics({ q, city, page }: Search): Promise<ClinicSearch | ApiFailure> {
  const name = q || undefined;

  if (!city) {
    const result = await listClinics({ page, limit: PAGE_SIZE, q: name });
    if (!result.ok) return result;
    return { ok: true, items: result.data.items, hasMore: result.data.hasMore, truncated: false };
  }

  const wanted = normalizeText(city);
  const start = (page - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const matches: Clinic[] = [];
  let truncated = false;

  for (let scanPage = 1; scanPage <= MAX_SCAN_PAGES; scanPage++) {
    const result = await listClinics({ page: scanPage, limit: SCAN_PAGE_SIZE, q: name });
    if (!result.ok) return result;

    for (const clinic of result.data.items) {
      if (normalizeText(clinic.city).includes(wanted)) matches.push(clinic);
    }

    // Basta con una coincidencia de más para saber si existe otra página.
    if (matches.length > end || !result.data.hasMore) break;
    if (scanPage === MAX_SCAN_PAGES) truncated = true;
  }

  return { ok: true, items: matches.slice(start, end), hasMore: matches.length > end, truncated };
}
