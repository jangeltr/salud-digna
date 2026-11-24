"use client";

import { useState } from "react";

type CopyButtonProps = {
  /** Texto que se copia al portapapeles. */
  value: string;
  label: string;
};

/**
 * Copia un texto al portapapeles y lo anuncia. Sin JavaScript el botón no hace nada:
 * por eso el texto se muestra siempre al lado, seleccionable.
 */
export function CopyButton({ value, label }: CopyButtonProps) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("copied");
    } catch {
      // Sin permiso o sin contexto seguro: el paciente puede seleccionar el texto y copiarlo a mano.
      setStatus("failed");
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
          <span className="text-danger">No se pudo copiar. Selecciona el folio y cópialo.</span>
        ) : null}
      </span>
    </>
  );
}
