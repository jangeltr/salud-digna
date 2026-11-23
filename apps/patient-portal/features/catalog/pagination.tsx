import Link from "next/link";
import { LinkPending } from "@/components/link-pending";

type PaginationProps = {
  page: number;
  hasMore: boolean;
  /** Devuelve la URL de una página conservando los filtros activos. */
  hrefFor: (page: number) => string;
};

const linkClass =
  "inline-flex min-h-11 items-center rounded-lg border border-line bg-canvas px-4 font-semibold text-brand hover:bg-brand-soft";

export function Pagination({ page, hasMore, hrefFor }: PaginationProps) {
  if (page === 1 && !hasMore) return null;

  return (
    <nav aria-label="Paginación" className="mt-8 flex items-center justify-between gap-4">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} rel="prev" className={linkClass}>
          Anterior
          <LinkPending visible />
        </Link>
      ) : (
        <span />
      )}
      <p className="text-sm text-muted">Página {page}</p>
      {hasMore ? (
        <Link href={hrefFor(page + 1)} rel="next" className={linkClass}>
          Siguiente
          <LinkPending visible />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
