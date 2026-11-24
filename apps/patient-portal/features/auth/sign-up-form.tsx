"use client";

import { useActionState } from "react";
import { TextField } from "@/components/text-field";
import { signUp, type AuthFormState } from "./actions";
import { FormMessage, SubmitButton } from "./form-parts";
import { LIMITS } from "./validation";

const initialState: AuthFormState = {};

export function SignUpForm() {
  const [state, formAction, pending] = useActionState(signUp, initialState);

  return (
    <form action={formAction} className="mt-6 grid gap-4">
      <FormMessage message={state.message} />
      <TextField
        name="firstName"
        label="Nombre"
        autoComplete="given-name"
        maxLength={LIMITS.name}
        required
        defaultValue={state.values?.firstName}
        error={state.fieldErrors?.firstName}
      />
      <TextField
        name="lastName"
        label="Apellidos"
        autoComplete="family-name"
        maxLength={LIMITS.name}
        required
        defaultValue={state.values?.lastName}
        error={state.fieldErrors?.lastName}
      />
      <TextField
        name="email"
        label="Correo"
        type="email"
        autoComplete="email"
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
        autoComplete="new-password"
        minLength={LIMITS.passwordMin}
        maxLength={LIMITS.passwordMax}
        required
        hint={`Entre ${LIMITS.passwordMin} y ${LIMITS.passwordMax} caracteres.`}
        error={state.fieldErrors?.password}
      />
      <TextField
        name="phone"
        label="Teléfono"
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        maxLength={LIMITS.phone}
        defaultValue={state.values?.phone}
        error={state.fieldErrors?.phone}
      />
      <SubmitButton pending={pending}>Crear cuenta</SubmitButton>
    </form>
  );
}
