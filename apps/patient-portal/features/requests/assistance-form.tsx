"use client";

import { useActionState } from "react";
import { requestAssistance, type AssistanceState } from "./actions";

const initialState: AssistanceState = {};

/**
 * El código se pide solo al pulsar el botón. Llega en la respuesta de la acción,
 * nunca en la URL, y no se guarda en el navegador.
 */
export function AssistanceForm({ requestId }: { requestId: string }) {
  const [state, formAction, pending] = useActionState(requestAssistance, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={requestId} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-canvas px-4 font-semibold text-brand hover:bg-brand-soft disabled:opacity-70"
      >
        {pending ? "Generando…" : state.code ? "Generar otro código" : "Pedir ayuda a un asesor"}
      </button>
      <div role="status" aria-live="polite">
        {state.code ? (
          <div className="mt-4 rounded-lg border border-line bg-canvas p-4">
            <p className="text-sm font-semibold">Tu código de asistencia</p>
            <p className="mt-1 break-all font-mono text-xl font-bold tracking-wide select-all">{state.code}</p>
            <ul className="mt-2 list-disc pl-5 text-sm text-muted">
              <li>Díctalo al asesor del Call Center.</li>
              <li>Es de un solo uso.</li>
              <li>Vence a las {state.expiresAt}, hora del centro de México.</li>
            </ul>
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
