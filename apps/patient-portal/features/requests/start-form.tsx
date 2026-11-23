"use client";

import { useActionState } from "react";
import { startRequest, type StartState } from "./actions";

const initialState: StartState = {};

type StartFormProps = {
  /** Estudio con el que empezar, si llegó uno válido. */
  studyId?: string;
  /** Trámites abiertos que ya se mostraban. Permite reconocer uno recién creado tras una respuesta incierta. */
  knownIds: string[];
  label: string;
  /** Ruta que vuelve a consultar los trámites pendientes. */
  reviewHref: string;
};

/** Crea el trámite solo cuando el paciente pulsa el botón. El botón se bloquea durante el envío. */
export function StartForm({ studyId, knownIds, label, reviewHref }: StartFormProps) {
  const [state, formAction, pending] = useActionState(startRequest, initialState);

  return (
    <form action={formAction}>
      {studyId ? <input type="hidden" name="estudio" value={studyId} /> : null}
      <input type="hidden" name="conocidos" value={knownIds.join(",")} />
      {state.message ? (
        <p role="alert" className="mb-3 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
          {state.message}
        </p>
      ) : null}
      {state.blocked ? (
        // Sin saber si el trámite se creó, no se ofrece otro intento hasta revisar los pendientes.
        <a
          href={reviewHref}
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-canvas px-4 font-semibold text-brand hover:bg-brand-soft"
        >
          Revisar mis trámites
        </a>
      ) : (
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand px-4 font-semibold text-canvas hover:bg-brand-strong disabled:opacity-70"
        >
          {pending ? "Creando…" : label}
        </button>
      )}
    </form>
  );
}
