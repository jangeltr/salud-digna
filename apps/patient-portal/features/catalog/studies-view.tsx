import { EmptyState } from "@/features/catalog/empty-state";
import { Pagination } from "@/features/catalog/pagination";
import { PAGE_SIZE, listHref } from "@/features/catalog/params";
import { SearchForm } from "@/features/catalog/search-form";
import { StudyCard } from "@/features/catalog/study-card";
import { CatalogUnavailable } from "@/features/catalog/unavailable";
import { generalData } from "@/lib/composition";

/** Página de inicio del listado, estática, y ruta de búsqueda y paginación, que se genera en cada petición. */
export const STUDIES_PATH = "/estudios";
export const STUDIES_SEARCH_PATH = "/estudios/buscar";

/** Listado de estudios. Sin búsqueda y en la primera página no depende de la petición. */
export async function StudiesView({ q, page }: { q: string; page: number }) {
  const hrefFor = (target: number) =>
    q || target > 1 ? listHref(STUDIES_SEARCH_PATH, { q, pagina: target }) : STUDIES_PATH;

  const result = await generalData.listStudies({ page, limit: PAGE_SIZE, search: q || undefined });
  if (!result.ok) return <CatalogUnavailable retryHref={hrefFor(page)} />;

  const { items, hasMore } = result.data;

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Estudios</h1>
      <p className="mt-2 text-muted">Consulta los estudios disponibles y su precio.</p>
      <SearchForm
        action={STUDIES_SEARCH_PATH}
        label="Buscar estudios"
        fields={[{ name: "q", label: "Nombre del estudio", placeholder: "Por ejemplo, glucosa", defaultValue: q }]}
      />
      {items.length > 0 ? (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {items.map((study) => (
            <StudyCard key={study.id} study={study} />
          ))}
        </ul>
      ) : q || page > 1 ? (
        <EmptyState resetHref={STUDIES_PATH} resetLabel="Ver todos los estudios">
          {q ? <>No encontramos estudios con «{q}».</> : "No hay más estudios en esta página."}
        </EmptyState>
      ) : (
        <EmptyState>Aún no hay estudios en el catálogo.</EmptyState>
      )}
      <Pagination page={page} hasMore={hasMore} hrefFor={hrefFor} />
    </>
  );
}
