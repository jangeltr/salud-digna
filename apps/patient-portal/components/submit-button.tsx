"use client";

import { useFormStatus } from "react-dom";

type SubmitButtonProps = {
  children: string;
  pendingLabel: string;
  className?: string;
};

/** Botón de envío que muestra el estado de carga del formulario que lo contiene. */
export function SubmitButton({ children, pendingLabel, className }: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      aria-disabled={pending || undefined}
      className={
        className ??
        "inline-flex min-h-11 items-center justify-center rounded-lg bg-brand px-4 font-semibold text-canvas hover:bg-brand-strong aria-disabled:opacity-70"
      }
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
