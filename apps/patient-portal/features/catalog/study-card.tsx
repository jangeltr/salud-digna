import Link from "next/link";
import { LinkPending } from "@/components/link-pending";
import type { Study } from "@/lib/domain/model";
import { formatPrice } from "./params";

/** Los textos del catálogo se muestran como texto: React los escapa. */
export function StudyCard({ study }: { study: Study }) {
  return (
    <li className="flex flex-col rounded-lg border border-line bg-canvas p-4">
      <h2 className="text-lg font-semibold">
        <Link
          href={`/estudios/${study.id}`}
          className="inline-flex min-h-11 items-center text-brand underline-offset-4 hover:underline"
        >
          {study.name}
          <LinkPending visible />
        </Link>
      </h2>
      {study.description ? <p className="mt-1 text-sm text-muted">{study.description}</p> : null}
      <p className="mt-3 font-semibold">{formatPrice(study.price)}</p>
    </li>
  );
}
