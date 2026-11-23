import type { Metadata } from "next";
import Link from "next/link";
import { ServiceUnavailable } from "@/components/service-unavailable";
import { formatPrice, isUuid } from "@/features/catalog/params";
import { PendingList } from "@/features/requests/pending-list";
import { StartForm } from "@/features/requests/start-form";
import { getStudy } from "@/lib/api/catalog";
import { listPendingRequests } from "@/lib/api/requests";
import { expireSession, requireSession } from "@/lib/session/session";

export const metadata: Metadata = { title: "Agendar un estudio" };

export default async function NewRequestPage({ searchParams }: PageProps<"/tramite/nuevo">) {
  const query = await searchParams;
  const raw = Array.isArray(query.estudio) ? query.estudio[0] : query.estudio;
  const requestedStudy = raw && isUuid(raw) ? raw.toLowerCase() : undefined;
  const path = requestedStudy ? `/tramite/nuevo?estudio=${requestedStudy}` : "/tramite/nuevo";

  const session = await requireSession();
  if (!session) return <ServiceUnavailable retryHref={path} />;

  // Esta página solo consulta. El trámite se crea cuando el paciente pulsa el botón.
  const [study, pending] = await Promise.all([
    requestedStudy ? getStudy(requestedStudy) : undefined,
    listPendingRequests(session.token),
  ]);
  if (!pending.ok) {
    if (pending.status === 401) await expireSession();
    return <ServiceUnavailable retryHref={path} />;
  }

  const selected = study?.ok ? study.data : undefined;
  const open = pending.data.items;

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
        <p className="mt-2 text-muted">Elegirás el estudio, la clínica y el horario paso a paso.</p>
      )}

      {open.length > 0 ? (
        <section aria-labelledby="abiertos" className="mt-8">
          <h2 id="abiertos" className="text-xl font-semibold">
            {open.length === 1 ? "Tienes un trámite abierto" : `Tienes ${open.length} trámites abiertos`}
          </h2>
          <p className="mt-1 text-sm text-muted">Puedes continuar uno de ellos o empezar otro.</p>
          <PendingList requests={open} />
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
          {open.length > 0 ? "Empezar un trámite nuevo" : "Empezar el trámite"}
        </h2>
        <p className="mt-1 mb-3 text-sm text-muted">Podrás guardarlo y continuar después, también por WhatsApp o con un asesor.</p>
        <StartForm
          studyId={selected?.id}
          knownIds={open.map((request) => request.id)}
          label={open.length > 0 ? "Empezar un trámite nuevo" : "Empezar el trámite"}
          reviewHref={path}
        />
      </section>
    </>
  );
}
