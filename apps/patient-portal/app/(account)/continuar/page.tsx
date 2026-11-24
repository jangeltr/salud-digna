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
import { requestCapabilities, requestQuery } from "@/lib/composition";
import { expireSession, requireAccount } from "@/lib/session/session";

export const metadata: Metadata = { title: "Continuar" };

const PATH = "/continuar";

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
    return <ServiceUnavailable retryHref={hrefFor(page)} />;
  }

  const { items, hasMore } = result.data;
  // Solo con servicios que exigen un permiso por trámite: los que el portal conoce pero no puede consultar.
  const locked = result.data.locked ?? [];

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Continuar</h1>
      <p className="mt-2 text-muted">
        {requestCapabilities.patientListing
          ? "Tus trámites abiertos, también los que empezaste por WhatsApp o con un asesor."
          : requestCapabilities.continuityCodes
            ? "Los trámites abiertos que empezaste en este portal o trajiste con un código de continuidad."
            : "Los trámites abiertos que empezaste en este portal."}
      </p>
      {notice ? <NoticeBanner notice={notice} /> : null}
      {items.length > 0 ? <PendingList requests={items} /> : null}
      {locked.length > 0 ? <LockedList requests={locked} /> : null}
      {items.length > 0 || locked.length > 0 ? null : (
        <EmptyState resetHref={page > 1 ? PATH : "/estudios"} resetLabel={page > 1 ? "Volver al inicio de la lista" : "Buscar un estudio"}>
          {page > 1 ? "No hay más trámites en esta página." : "No tienes trámites abiertos."}
        </EmptyState>
      )}
      <Pagination page={page} hasMore={hasMore} hrefFor={hrefFor} />
      {requestCapabilities.continuityCodes ? (
        <section aria-labelledby="canjear" className="mt-10 border-t border-line pt-6">
          <h2 id="canjear" className="text-lg font-semibold">
            Tengo un código de continuidad
          </h2>
          <p className="mt-1 text-sm text-muted">
            Si empezaste un trámite por WhatsApp o Call Center, pide allí un código y escríbelo aquí para seguir en el
            portal.
          </p>
          <RedeemForm />
        </section>
      ) : null}
    </>
  );
}
