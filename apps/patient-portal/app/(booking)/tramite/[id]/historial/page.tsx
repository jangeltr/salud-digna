import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ServiceUnavailable } from "@/components/service-unavailable";
import { EmptyState } from "@/features/catalog/empty-state";
import { isUuid } from "@/features/catalog/params";
import { AccessExpired } from "@/features/requests/handoff";
import { Timeline } from "@/features/requests/history";
import { requestCapabilities, requestQuery } from "@/lib/composition";
import { expireSession, requireAccount } from "@/lib/session/session";

export const metadata: Metadata = { title: "Historial del trámite" };

const PAGE_SIZE = 20;
// Forma del cursor del servicio. Un valor con otra forma se ignora y se muestra la primera página.
const CURSOR = /^[\w-]{1,200}$/;

const linkClass =
  "inline-flex min-h-11 items-center rounded-lg border border-line bg-canvas px-4 font-semibold text-brand hover:bg-brand-soft";

export default async function RequestHistoryPage({ params, searchParams }: PageProps<"/tramite/[id]/historial">) {
  const { id } = await params;
  // Sin historial en el servicio activo, esta página no existe.
  if (!requestCapabilities.history || !isUuid(id)) notFound();

  const query = await searchParams;
  const cursor = typeof query.cursor === "string" && CURSOR.test(query.cursor) ? query.cursor : undefined;
  const requestPath = `/tramite/${id}`;
  const path = `${requestPath}/historial`;
  const currentPath = cursor ? `${path}?cursor=${cursor}` : path;

  if (!(await requireAccount())) return <ServiceUnavailable retryHref={currentPath} />;

  const result = await requestQuery.getHistory(id, { limit: PAGE_SIZE, cursor });
  if (!result.ok) {
    if (result.error.kind === "session") await expireSession();
    // «No encontrado» cubre por igual el trámite inexistente y el de otro paciente.
    if (result.error.kind === "not-found") notFound();
    // El servicio no reconoce ese cursor: se vuelve al inicio del historial.
    if (result.error.kind === "invalid" && cursor) redirect(path);
    if (result.error.kind === "access-expired") {
      return (
        <>
          <h1 className="text-2xl font-bold tracking-tight">Historial del trámite</h1>
          <AccessExpired requestId={id} />
        </>
      );
    }
    return <ServiceUnavailable retryHref={currentPath} />;
  }

  const { items, nextCursor } = result.data;

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Historial del trámite</h1>
      <p className="mt-2 text-muted">
        Lo que se registró en cada canal, del evento más antiguo al más reciente. Hora del centro de México.
      </p>
      {items.length > 0 ? (
        <Timeline entries={items} />
      ) : (
        <EmptyState resetHref={cursor ? path : undefined} resetLabel="Volver al inicio del historial">
          {cursor ? "No hay más eventos." : "Este trámite todavía no tiene eventos."}
        </EmptyState>
      )}
      <nav aria-label="Paginación del historial" className="mt-8 flex flex-wrap items-center gap-3">
        {cursor ? (
          <Link href={path} prefetch={false} className={linkClass}>
            Volver al inicio
          </Link>
        ) : null}
        {nextCursor ? (
          <Link href={`${path}?cursor=${encodeURIComponent(nextCursor)}`} prefetch={false} rel="next" className={linkClass}>
            Ver eventos posteriores
          </Link>
        ) : null}
        <Link href={requestPath} prefetch={false} className="inline-flex min-h-11 items-center font-semibold text-brand underline underline-offset-4">
          Volver al trámite
        </Link>
      </nav>
    </>
  );
}
