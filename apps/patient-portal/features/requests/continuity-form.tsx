"use client";

import { useActionState } from "react";
import { CopyButton } from "@/components/copy-button";
import { requestContinuityCode, type ContinuityState } from "./actions";

const initialState: ContinuityState = {};

/**
 * El código se pide solo al pulsar el botón. Llega en la respuesta de la acción,
 * nunca en la URL, y no se guarda en el navegador: al recargar la página desaparece.
 */
export function ContinuityForm({ requestId }: { requestId: string }) {
  const [state, formAction, pending] = useActionState(requestContinuityCode, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={requestId} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-canvas px-4 font-semibold text-brand hover:bg-brand-soft disabled:opacity-70"
      >
        {pending ? "Generando…" : state.code ? "Generar otro código" : "Generar código de continuidad"}
      </button>
      <div role="status" aria-live="polite">
        {state.code ? (
          <div className="mt-4 rounded-lg border border-line bg-canvas p-4">
            <p className="text-sm font-semibold">Tu código de continuidad</p>
            <p className="mt-1 font-mono text-2xl font-bold tracking-wide break-all select-all">{state.code}</p>
            <ul className="mt-2 mb-3 list-disc pl-5 text-sm text-muted">
              <li>Escríbelo en WhatsApp o díctalo en Call Center.</li>
              <li>Es de un solo uso.</li>
              <li>{`Vence a las ${state.expiresAt}, hora del centro de México, ${state.remaining}.`}</li>
            </ul>
            <CopyButton value={state.code} label="Copiar código" />
          </div>
        ) : null}
      </div>
      {state.message ? (
        <p role="alert" className="mt-3 text-sm font-medium text-danger">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
