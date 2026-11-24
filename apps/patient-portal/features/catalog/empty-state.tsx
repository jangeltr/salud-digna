import Link from "next/link";
import type { ReactNode } from "react";

type EmptyStateProps = {
  children: ReactNode;
  /** Enlace para quitar los filtros, cuando hay alguno activo. */
  resetHref?: string;
  resetLabel?: string;
};

export function EmptyState({ children, resetHref, resetLabel }: EmptyStateProps) {
  return (
    <div role="status" className="mt-6 rounded-lg border border-line bg-canvas px-4 py-6 text-center">
      <p className="text-muted">{children}</p>
      {resetHref ? (
        <p className="mt-2">
          <Link href={resetHref} className="inline-flex min-h-11 items-center font-semibold text-brand underline underline-offset-4">
            {resetLabel}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
