import { ClinicCard } from "@/features/catalog/clinic-card";
import { CITY_SCAN_LIMIT, searchClinics } from "@/features/catalog/clinics";
import { EmptyState } from "@/features/catalog/empty-state";
import { Pagination } from "@/features/catalog/pagination";
import { listHref } from "@/features/catalog/params";
import { SearchForm } from "@/features/catalog/search-form";
import { CatalogUnavailable } from "@/features/catalog/unavailable";

/** Página de inicio del listado, estática, y ruta de búsqueda y paginación, que se genera en cada petición. */
export const CLINICS_PATH = "/clinicas";
export const CLINICS_SEARCH_PATH = "/clinicas/buscar";

/** Listado de clínicas. Sin filtros y en la primera página no depende de la petición. */
export async function ClinicsView({ q, city, page }: { q: string; city: string; page: number }) {
  const hrefFor = (target: number) =>
    q || city || target > 1 ? listHref(CLINICS_SEARCH_PATH, { q, ciudad: city, pagina: target }) : CLINICS_PATH;

  const result = await searchClinics({ q, city, page });
  if (!result.ok) return <CatalogUnavailable retryHref={hrefFor(page)} />;

  const { items, hasMore, truncated } = result;
  const filtered = Boolean(q || city);

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Clínicas</h1>
      <p className="mt-2 text-muted">Busca una clínica por nombre o por ciudad.</p>
      <SearchForm
        action={CLINICS_SEARCH_PATH}
        label="Buscar clínicas"
        fields={[
          { name: "q", label: "Nombre de la clínica", defaultValue: q },
          { name: "ciudad", label: "Ciudad", defaultValue: city },
        ]}
      />
      {truncated ? (
        <p role="status" className="mt-4 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-sm font-medium text-warning">
          El filtro por ciudad revisó las primeras {CITY_SCAN_LIMIT} clínicas. Puede haber más: acota la búsqueda por nombre.
        </p>
      ) : null}
      {items.length > 0 ? (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {items.map((clinic) => (
            <ClinicCard key={clinic.id} clinic={clinic} />
          ))}
        </ul>
      ) : filtered || page > 1 ? (
        <EmptyState resetHref={CLINICS_PATH} resetLabel="Ver todas las clínicas">
          {filtered ? "No encontramos clínicas con esos filtros." : "No hay más clínicas en esta página."}
        </EmptyState>
      ) : (
        <EmptyState>Aún no hay clínicas en el catálogo.</EmptyState>
      )}
      <Pagination page={page} hasMore={hasMore} hrefFor={hrefFor} />
    </>
  );
}
