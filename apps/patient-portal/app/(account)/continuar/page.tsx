import type { Metadata } from "next";
import { ServiceUnavailable } from "@/components/service-unavailable";
import { EmptyState } from "@/features/catalog/empty-state";
import { Pagination } from "@/features/catalog/pagination";
import { PAGE_SIZE, listHref, readPage } from "@/features/catalog/params";
import { LockedList } from "@/features/requests/handoff";
import { NoticeBanner } from "@/features/requests/parts";
import { PendingList } from "@/features/requests/pending-list";
import { RedeemForm } from "@/features/requests/redeem-form";
import { readNotice } from "@/features/requests/steps";
import { IdentityUnavailable, SummaryList } from "@/features/requests/summary-list";
import { requestCapabilities, requestQuery } from "@/lib/composition";
import { reportShownError } from "@/lib/report";
import { expireSession, requireAccount } from "@/lib/session/session";

export const metadata: Metadata = { title: "Continuar" };

const PATH = "/continuar";

function intro(): string {
  if (requestCapabilities.identifiedContinuity) {
    return "Tus trámites activos, también los que empezaste en la app móvil o en Call Center.";
  }
  if (requestCapabilities.patientListing) return "Tus trámites abiertos, también los que empezaste en otro canal.";
  if (requestCapabilities.continuityCodes) {
    return "Los trámites abiertos que empezaste en este portal o trajiste con un código de continuidad.";
  }
  return "Los trámites abiertos que empezaste en este portal.";
}

/** Canje de un código. Con continuidad identificada es una alternativa plegada, no la vía principal. */
function RedeemSection() {
  const text = (
    <p className="mt-1 text-sm text-muted">
      Si empezaste un trámite en la app móvil o en Call Center, pide allí un código y escríbelo aquí para seguir en el
      portal.
    </p>
  );
  if (requestCapabilities.identifiedContinuity) {
    return (
      <details className="mt-10 border-t border-line pt-6">
        <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-brand underline underline-offset-4">
          Otra forma de continuar
        </summary>
        <h2 id="canjear" className="mt-2 text-lg font-semibold">
          Tengo un código de continuidad
        </h2>
        {text}
        <RedeemForm />
      </details>
    );
  }
  return (
    <section aria-labelledby="canjear" className="mt-10 border-t border-line pt-6">
      <h2 id="canjear" className="text-lg font-semibold">
        Tengo un código de continuidad
      </h2>
      {text}
      <RedeemForm />
    </section>
  );
}

export default async function ResumePage({ searchParams }: PageProps<"/continuar">) {
  const query = await searchParams;
  const page = readPage(query.pagina);
  const notice = readNotice(query.aviso);
  const hrefFor = (target: number) => listHref(PATH, { pagina: target });

  // La sesión y los trámites se leen a la vez.
  const [account, result] = await Promise.all([requireAccount(), requestQuery.listPending({ page, limit: PAGE_SIZE })]);
  if (!account) return <ServiceUnavailable retryHref={hrefFor(page)} />;
  if (!result.ok) {
    if (result.error.kind === "session") await expireSession();
    reportShownError(PATH, result.error.kind);
    if (result.error.kind === "identity-unavailable") {
      return (
        <>
          <h1 className="text-2xl font-bold tracking-tight">Continuar</h1>
          <IdentityUnavailable retryHref={hrefFor(page)} />
        </>
      );
    }
    return <ServiceUnavailable retryHref={hrefFor(page)} />;
  }

  const { items, hasMore } = result.data;
  // Solo con servicios que exigen un permiso por trámite: los que el portal conoce pero no puede consultar.
  const locked = result.data.locked ?? [];
  // Solo con continuidad identificada: trámites del paciente de cualquier canal.
  const summaries = result.data.summaries ?? [];
  const any = items.length > 0 || locked.length > 0 || summaries.length > 0;

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Continuar</h1>
      <p className="mt-2 text-muted">{intro()}</p>
      {notice ? <NoticeBanner notice={notice} /> : null}
      {summaries.length > 0 ? <SummaryList summaries={summaries} /> : null}
      {items.length > 0 ? <PendingList requests={items} /> : null}
      {locked.length > 0 ? <LockedList requests={locked} /> : null}
      {any ? null : (
        <EmptyState resetHref={page > 1 ? PATH : "/estudios"} resetLabel={page > 1 ? "Volver al inicio de la lista" : "Buscar un estudio"}>
          {page > 1 ? "No hay más trámites en esta página." : "No tienes trámites abiertos."}
        </EmptyState>
      )}
      <Pagination page={page} hasMore={hasMore} hrefFor={hrefFor} />
      {requestCapabilities.continuityCodes ? <RedeemSection /> : null}
    </>
  );
}
