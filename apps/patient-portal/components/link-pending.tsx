"use client";

import { useLinkStatus } from "next/link";

/**
 * Aviso de carga mientras se completa la navegación del enlace que lo contiene.
 * Debe renderizarse dentro de un `Link`.
 */
export function LinkPending({ visible = false }: { visible?: boolean }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;

  return (
    <span data-pending role="status" className={visible ? "ml-2 text-sm font-normal text-muted" : "sr-only"}>
      Cargando…
    </span>
  );
}
