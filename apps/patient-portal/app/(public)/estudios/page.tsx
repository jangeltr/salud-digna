import type { Metadata } from "next";
import { ServiceUnavailable } from "@/components/service-unavailable";
import { EmptyState } from "@/features/catalog/empty-state";
import { Pagination } from "@/features/catalog/pagination";
import { PAGE_SIZE, listHref, readPage, readText } from "@/features/catalog/params";
import { SearchForm } from "@/features/catalog/search-form";
import { StudyCard } from "@/features/catalog/study-card";
import { listStudies } from "@/lib/api/catalog";

export const metadata: Metadata = { title: "Estudios" };

const PATH = "/estudios";

export default async function StudiesPage({ searchParams }: PageProps<"/estudios">) {
  const params = await searchParams;
  const q = readText(params.q);
  const page = readPage(params.pagina);
  const hrefFor = (target: number) => listHref(PATH, { q, pagina: target });

  const result = await listStudies({ page, limit: PAGE_SIZE, q: q || undefined });
  if (!result.ok) return <ServiceUnavailable retryHref={hrefFor(page)} />;

  const { items, hasMore } = result.data;

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Estudios</h1>
      <p className="mt-2 text-muted">Consulta los estudios disponibles y su precio.</p>
      <SearchForm
        action={PATH}
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
        <EmptyState resetHref={PATH} resetLabel="Ver todos los estudios">
          {q ? <>No encontramos estudios con «{q}».</> : "No hay más estudios en esta página."}
        </EmptyState>
      ) : (
        <EmptyState>Aún no hay estudios en el catálogo.</EmptyState>
      )}
      <Pagination page={page} hasMore={hasMore} hrefFor={hrefFor} />
    </>
  );
}
