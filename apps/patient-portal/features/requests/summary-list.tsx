import Link from "next/link";
import type { RequestSummary } from "@/lib/domain/model";
import { formatDateTime } from "./schedule";
import { statusName } from "./steps";

/**
 * Trámites activos del paciente identificado, de cualquier canal: folio, estado y fecha.
 * El detalle se lee al abrir cada trámite, con un permiso que el servidor pide en ese momento.
 */
export function SummaryList({ summaries }: { summaries: RequestSummary[] }) {
  return (
    <ul className="mt-4 grid gap-4">
      {summaries.map((summary) => (
        <li key={summary.id} className="rounded-lg border border-line bg-canvas p-4">
          <h3 className="text-lg font-semibold">{statusName(summary.status)}</h3>
          <p className="mt-1 text-sm text-muted">
            Folio: <span className="font-mono break-all select-all">{summary.id}</span>
          </p>
          <p className="mt-1 mb-3 text-sm text-muted">
            Última actividad: <time dateTime={summary.lastActivityAt}>{formatDateTime(summary.lastActivityAt)}</time>
          </p>
          <Link
            href={`/tramite/${summary.id}`}
            prefetch={false}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand px-4 font-semibold text-canvas hover:bg-brand-strong"
          >
            Continuar este trámite
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Aviso cuando no se pudo acreditar la identidad del paciente. No se creó ni se leyó ningún trámite. */
export function IdentityUnavailable({ retryHref }: { retryHref: string }) {
  return (
    <div role="alert" className="mt-4 rounded-lg border border-danger/30 bg-danger-soft p-4">
      <h2 className="text-lg font-semibold text-danger">No pudimos verificar tu identidad</h2>
      <p className="mt-1 text-sm">
        Sin esa verificación no podemos mostrar ni crear trámites. Inténtalo de nuevo en unos minutos.
      </p>
      <p className="mt-3">
        <a
          href={retryHref}
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-canvas px-4 font-semibold text-brand hover:bg-brand-soft"
        >
          Reintentar
        </a>
      </p>
    </div>
  );
}
