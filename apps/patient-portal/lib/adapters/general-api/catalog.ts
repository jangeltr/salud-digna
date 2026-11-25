import "server-only";
import { failure, success, type Result } from "@/lib/domain/errors";
import type { Clinic, Study } from "@/lib/domain/model";
import { CATALOG_CACHE_SECONDS } from "@/lib/cache-settings";
import { apiRequest } from "./client";
import { toFailure } from "./failures";
import type { components } from "./schema";

type Schemas = components["schemas"];

/**
 * Índice del catálogo: todos los estudios y clínicas, por identificador, en un solo caché.
 * Lo comparten el detalle de un estudio, el resumen del trámite, las listas de «Continuar»,
 * el historial y el filtro por ciudad. Buscar un elemento no hace ninguna llamada por elemento:
 * el índice se carga entero, en páginas del tamaño máximo, y se renueva cada `CATALOG_CACHE_SECONDS`.
 *
 * Las páginas del índice usan siempre las mismas URL, así que la caché de datos de Next las comparte
 * con cualquier otra lectura idéntica. La API solo devuelve registros activos, también por identificador,
 * así que un identificador que no está en el índice completo no existe. Solo si el índice llegó al tope,
 * o no se pudo cargar, se pide por separado.
 */
const PAGE_SIZE = 100;
const MAX_PAGES = 10;
const MAX_CLINIC_PAGES = 5;

/** Tope de clínicas del índice. También limita el filtro por ciudad. */
export const CLINIC_INDEX_LIMIT = PAGE_SIZE * MAX_CLINIC_PAGES;

export type CatalogIndex<Item> = { byId: Map<string, Item>; items: Item[]; truncated: boolean };

export function toStudy(dto: Schemas["StudyDto"]): Study {
  return { id: dto.id, name: dto.name, description: dto.description ?? undefined, price: dto.price };
}

export function toClinic(dto: Schemas["ClinicDto"]): Clinic {
  return { id: dto.id, name: dto.name, address: dto.address, city: dto.city, state: dto.state };
}

type Loaded<Item> = { index: CatalogIndex<Item>; expiresAt: number };
type Slot<Item> = { loaded?: Loaded<Item>; pending?: Promise<Result<CatalogIndex<Item>>> };

// En `globalThis` para que todas las copias del módulo que cargue Next compartan el índice.
function slot<Item>(name: string): Slot<Item> {
  const key = Symbol.for(`salud-digna.patient-portal.catalog-${name}`);
  const holder = globalThis as Record<symbol, Slot<Item> | undefined>;
  holder[key] ??= {};
  return holder[key];
}

async function loadPages<Dto, Item>(
  path: "/studies" | "/clinics",
  maxPages: number,
  toItem: (dto: Dto) => Item & { id: string },
): Promise<Result<CatalogIndex<Item>>> {
  const items: (Item & { id: string })[] = [];
  let truncated = false;
  for (let page = 1; page <= maxPages; page++) {
    const result = await apiRequest<{ items: Dto[]; hasMore: boolean }>({
      method: "GET",
      path,
      query: { page, limit: PAGE_SIZE },
      revalidate: CATALOG_CACHE_SECONDS,
    });
    if (!result.ok) return toFailure(result);
    items.push(...result.data.items.map(toItem));
    if (!result.data.hasMore) break;
    if (page === maxPages) truncated = true;
  }
  return success({ byId: new Map(items.map((item) => [item.id, item])), items, truncated });
}

/** Índice vigente. Varias peticiones simultáneas comparten una sola carga. */
async function cachedIndex<Item>(name: string, load: () => Promise<Result<CatalogIndex<Item>>>): Promise<Result<CatalogIndex<Item>>> {
  const current = slot<Item>(name);
  if (current.loaded && current.loaded.expiresAt > Date.now()) return success(current.loaded.index);
  current.pending ??= load().then((result) => {
    if (result.ok) current.loaded = { index: result.data, expiresAt: Date.now() + CATALOG_CACHE_SECONDS * 1000 };
    current.pending = undefined;
    return result;
  });
  return current.pending;
}

export function studyIndex(): Promise<Result<CatalogIndex<Study>>> {
  return cachedIndex("studies", () => loadPages("/studies", MAX_PAGES, toStudy));
}

export function clinicIndex(): Promise<Result<CatalogIndex<Clinic>>> {
  return cachedIndex("clinics", () => loadPages("/clinics", MAX_CLINIC_PAGES, toClinic));
}

/** Un elemento por identificador: del índice si está, o con una sola lectura si no. */
export async function findInIndex<Item, Dto>(
  index: Result<CatalogIndex<Item>>,
  id: string,
  path: "/studies/{id}" | "/clinics/{id}",
  toItem: (dto: Dto) => Item,
): Promise<Result<Item>> {
  const known = index.ok ? index.data.byId.get(id.toLowerCase()) : undefined;
  if (known) return success(known);
  // La API responde 404 a un registro inactivo, así que el índice completo tiene todos los que existen.
  if (index.ok && !index.data.truncated) return failure("not-found");

  const result = await apiRequest<Dto>({ method: "GET", path, params: { id }, revalidate: CATALOG_CACHE_SECONDS });
  if (result.ok) return success(toItem(result.data));
  // Si el índice no cargó y la lectura suelta tampoco, el servicio no responde.
  return !index.ok && result.status === null ? failure("unavailable") : toFailure(result);
}
