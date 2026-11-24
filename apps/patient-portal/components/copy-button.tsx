"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";

type CopyButtonProps = {
  /** Texto que se copia al portapapeles. */
  value: string;
  label: string;
};

type Outcome = { status: "copied" | "failed"; location: string };

/**
 * Copia un texto al portapapeles y lo anuncia. Sin JavaScript el botón no hace nada:
 * por eso el texto se muestra siempre al lado, seleccionable.
 *
 * El aviso vale solo para la pantalla en la que se pulsó: al cambiar la ruta o sus parámetros,
 * por ejemplo al abrir la confirmación de cancelar, desaparece. Todas las páginas del portal
 * se generan en cada petición, así que `useSearchParams` no necesita un límite de `Suspense`.
 */
export function CopyButton({ value, label }: CopyButtonProps) {
  const location = `${usePathname()}?${useSearchParams()}`;
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const status = outcome && outcome.location === location ? outcome.status : "idle";

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setOutcome({ status: "copied", location });
    } catch {
      // Sin permiso o sin contexto seguro: el paciente puede seleccionar el texto y copiarlo a mano.
      setOutcome({ status: "failed", location });
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={copy}
        className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-canvas px-4 font-semibold text-brand hover:bg-brand-soft"
      >
        {label}
      </button>
      <span role="status" aria-live="polite" className="ml-3 text-sm font-medium">
        {status === "copied" ? (
          <span className="text-success">Copiado.</span>
        ) : status === "failed" ? (
          <span className="text-danger">No se pudo copiar. Selecciona el texto y cópialo.</span>
        ) : null}
      </span>
    </>
  );
}
