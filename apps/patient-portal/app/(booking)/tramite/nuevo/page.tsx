import type { Metadata } from "next";
import Link from "next/link";
import { ServiceUnavailable } from "@/components/service-unavailable";
import { formatPrice, isUuid } from "@/features/catalog/params";
import { LockedList } from "@/features/requests/handoff";
import { PendingList } from "@/features/requests/pending-list";
import { StartForm } from "@/features/requests/start-form";
import { IdentityUnavailable, SummaryList } from "@/features/requests/summary-list";
import { generalData, requestCapabilities, requestQuery } from "@/lib/composition";
import { reportShownError } from "@/lib/report";
import { expireSession, requireAccount } from "@/lib/session/session";

export const metadata: Metadata = { title: "Agendar un estudio" };

export default async function NewRequestPage({ searchParams }: PageProps<"/tramite/nuevo">) {
  const query = await searchParams;
  const raw = Array.isArray(query.estudio) ? query.estudio[0] : query.estudio;
  const requestedStudy = raw && isUuid(raw) ? raw.toLowerCase() : undefined;
  const path = requestedStudy ? `/tramite/nuevo?estudio=${requestedStudy}` : "/tramite/nuevo";

  // Esta página solo consulta, y todo a la vez. El trámite se crea cuando el paciente pulsa el botón.
  const [account, study, pending] = await Promise.all([
    requireAccount(),
    requestedStudy ? generalData.getStudy(requestedStudy) : undefined,
    requestQuery.listPending({ page: 1, limit: 20 }),
  ]);
  if (!account) return <ServiceUnavailable retryHref={path} />;
  if (!pending.ok) {
    if (pending.error.kind === "session") await expireSession();
    reportShownError("/tramite/nuevo", pending.error.kind);
    if (pending.error.kind === "identity-unavailable") {
      return (
        <>
          <h1 className="text-2xl font-bold tracking-tight">Agendar un estudio</h1>
          <IdentityUnavailable retryHref={path} />
        </>
      );
    }
    return <ServiceUnavailable retryHref={path} />;
  }

  const selected = study?.ok ? study.data : undefined;
  const open = pending.data.items;
  // Solo con servicios que exigen un permiso por trámite: los que el portal conoce pero no puede consultar.
  const locked = pending.data.locked ?? [];
  // Solo con continuidad identificada: trámites del paciente de cualquier canal.
  const summaries = pending.data.summaries ?? [];
  const openCount = open.length + locked.length + summaries.length;

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Agendar un estudio</h1>
      {selected ? (
        <p className="mt-2">
          Vas a agendar <strong>{selected.name}</strong>, {formatPrice(selected.price)}.
        </p>
      ) : requestedStudy ? (
        <p role="status" className="mt-4 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-sm font-medium text-warning">
          El estudio elegido ya no está disponible. Podrás elegir otro al empezar el trámite.
        </p>
      ) : (
        <p className="mt-2 text-muted">
          {requestCapabilities.slot
            ? "Elegirás el estudio, la clínica y el horario paso a paso."
            : "Elegirás el estudio y la clínica paso a paso."}
        </p>
      )}

      {openCount > 0 ? (
        <section aria-labelledby="abiertos" className="mt-8">
          <h2 id="abiertos" className="text-xl font-semibold">
            {openCount === 1 ? "Tienes un trámite abierto" : `Tienes ${openCount} trámites abiertos`}
          </h2>
          <p className="mt-1 text-sm text-muted">Puedes continuar uno de ellos o empezar otro.</p>
          {summaries.length > 0 ? <SummaryList summaries={summaries} /> : null}
          {open.length > 0 ? <PendingList requests={open} /> : null}
          {locked.length > 0 ? <LockedList requests={locked} /> : null}
          {pending.data.hasMore ? (
            <p className="mt-3">
              <Link href="/continuar" prefetch={false} className="inline-flex min-h-11 items-center font-semibold text-brand underline underline-offset-4">
                Ver todos mis trámites abiertos
              </Link>
            </p>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="nuevo" className="mt-8">
        <h2 id="nuevo" className="text-xl font-semibold">
          {openCount > 0 ? "Empezar un trámite nuevo" : "Empezar el trámite"}
        </h2>
        <p className="mt-1 mb-3 text-sm text-muted">
          {requestCapabilities.pause
            ? "Podrás guardarlo y continuar después, también en la app móvil o con un asesor."
            : "Al terminar lo envías a confirmación y continúas en la app móvil o en Call Center."}
        </p>
        <StartForm
          studyId={selected?.id}
          knownIds={open.map((request) => request.id)}
          label={openCount > 0 ? "Empezar un trámite nuevo" : "Empezar el trámite"}
          reviewHref={path}
        />
      </section>
    </>
  );
}
