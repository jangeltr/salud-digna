"use client";

import { useActionState } from "react";
import { TextField } from "@/components/text-field";
import { signIn, type AuthFormState } from "./actions";
import { FormMessage, SubmitButton } from "./form-parts";
import { LIMITS } from "./validation";

const initialState: AuthFormState = {};

export function SignInForm({ destination }: { destination: string }) {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <form action={formAction} className="mt-6 grid gap-4">
      <input type="hidden" name="destino" value={destination} />
      <FormMessage message={state.message} />
      <TextField
        name="email"
        label="Correo"
        type="email"
        autoComplete="username"
        inputMode="email"
        maxLength={LIMITS.email}
        required
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <TextField
        name="password"
        label="Contraseña"
        type="password"
        autoComplete="current-password"
        maxLength={LIMITS.passwordMax}
        required
        error={state.fieldErrors?.password}
      />
      <SubmitButton pending={pending}>Entrar</SubmitButton>
    </form>
  );
}
