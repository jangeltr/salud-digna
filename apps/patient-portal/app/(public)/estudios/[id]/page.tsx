import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LinkPending } from "@/components/link-pending";
import { ServiceUnavailable } from "@/components/service-unavailable";
import { formatPrice, isUuid } from "@/features/catalog/params";
import { getStudy } from "@/lib/api/catalog";

const FALLBACK_TITLE = "Detalle del estudio";

export async function generateMetadata({ params }: PageProps<"/estudios/[id]">): Promise<Metadata> {
  const { id } = await params;
  if (!isUuid(id)) return { title: FALLBACK_TITLE };

  const result = await getStudy(id);
  return { title: result.ok ? result.data.name : FALLBACK_TITLE };
}

export default async function StudyDetailPage({ params }: PageProps<"/estudios/[id]">) {
  const { id } = await params;
  // Un identificador que no es UUID nunca llega a la API.
  if (!isUuid(id)) notFound();

  const result = await getStudy(id);
  if (!result.ok) {
    if (result.status === 400 || result.status === 404) notFound();
    return <ServiceUnavailable retryHref={`/estudios/${id}`} />;
  }

  const study = result.data;

  return (
    <article>
      <p>
        <Link href="/estudios" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand underline underline-offset-4">
          Volver a estudios
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">{study.name}</h1>
      {study.description ? <p className="mt-2 text-muted">{study.description}</p> : null}
      <p className="mt-4 text-xl font-semibold">{formatPrice(study.price)}</p>
      <p className="mt-6">
        <Link
          href={`/tramite/nuevo?estudio=${study.id}`}
          prefetch={false}
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand px-4 font-semibold text-canvas hover:bg-brand-strong"
        >
          Agendar este estudio
          <LinkPending />
        </Link>
      </p>
    </article>
  );
}
