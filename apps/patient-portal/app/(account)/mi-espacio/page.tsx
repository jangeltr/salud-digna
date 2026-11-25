import type { Metadata } from "next";
import Link from "next/link";
import { PagePlaceholder } from "@/components/page-placeholder";
import { ServiceUnavailable } from "@/components/service-unavailable";
import { IdentityUnavailable, SummaryList } from "@/features/requests/summary-list";
import { requestCapabilities, requestQuery } from "@/lib/composition";
import { reportShownError } from "@/lib/report";
import { expireSession, requireAccount } from "@/lib/session/session";

export const metadata: Metadata = { title: "Mi espacio" };

const PATH = "/mi-espacio";
const SHOWN = 5;

const linkClass = "inline-flex min-h-11 items-center font-semibold text-brand underline underline-offset-4";

export default async function MySpacePage() {
  // Sin continuidad identificada, la página sigue siendo la de siempre.
  if (!requestCapabilities.identifiedContinuity) {
    if (!(await requireAccount())) return <ServiceUnavailable />;
    return <PagePlaceholder title="Mi espacio" />;
  }

  const [account, result] = await Promise.all([requireAccount(), requestQuery.listPending({ page: 1, limit: SHOWN })]);
  if (!account) return <ServiceUnavailable retryHref={PATH} />;
  if (!result.ok && result.error.kind === "session") await expireSession();
  if (!result.ok) reportShownError(PATH, result.error.kind);

  const summaries = result.ok ? (result.data.summaries ?? []) : [];

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Mi espacio</h1>
      <section aria-labelledby="activos" className="mt-6">
        <h2 id="activos" className="text-xl font-semibold">
          Tus trámites activos
        </h2>
        <p className="mt-1 text-sm text-muted">También los que empezaste en la app móvil o en Call Center.</p>
        {!result.ok ? (
          result.error.kind === "identity-unavailable" ? (
            <IdentityUnavailable retryHref={PATH} />
          ) : (
            <p role="alert" className="mt-4 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
              No pudimos consultar tus trámites en este momento. Inténtalo de nuevo en unos minutos.
            </p>
          )
        ) : summaries.length > 0 ? (
          <>
            <SummaryList summaries={summaries} />
            {result.data.hasMore ? (
              <p className="mt-3">
                <Link href="/continuar" prefetch={false} className={linkClass}>
                  Ver todos mis trámites activos
                </Link>
              </p>
            ) : null}
          </>
        ) : (
          <p className="mt-4">
            No tienes trámites activos.{" "}
            <Link href="/estudios" className={linkClass}>
              Buscar un estudio
            </Link>
          </p>
        )}
      </section>
    </>
  );
}
