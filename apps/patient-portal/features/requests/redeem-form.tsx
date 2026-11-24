"use client";

import { useActionState } from "react";
import { TextField } from "@/components/text-field";
import { redeemContinuityCode, type RedeemState } from "./actions";

const initialState: RedeemState = {};

/**
 * Canje de un código de continuidad. El código viaja en el cuerpo del formulario, nunca en la URL,
 * y el campo vuelve vacío después de cada intento: lo escrito no se repite en la página.
 */
export function RedeemForm() {
  const [state, formAction, pending] = useActionState(redeemContinuityCode, initialState);

  return (
    <form action={formAction} className="mt-3 max-w-md">
      <TextField
        name="codigo"
        label="Código de continuidad"
        hint="Tiene 12 letras y números. Lo genera el canal donde está tu trámite: WhatsApp o Call Center."
        error={state.message}
        required
        autoComplete="off"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        maxLength={20}
      />
      <button
        type="submit"
        disabled={pending}
        className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg bg-brand px-4 font-semibold text-canvas hover:bg-brand-strong disabled:opacity-70"
      >
        {pending ? "Comprobando…" : "Continuar con este código"}
      </button>
    </form>
  );
}
