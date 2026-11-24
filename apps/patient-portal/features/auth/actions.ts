"use server";

import "server-only";
import { redirect } from "next/navigation";
import { generalData } from "@/lib/composition";
import { clearSessionCookie } from "@/lib/session/cookie";
import { SIGN_IN_PATH, safeDestination } from "@/lib/session/routes";
import { authErrorMessage } from "./messages";
import { validateSignIn, validateSignUp, type FieldErrors } from "./validation";

/** Estado que vuelve al formulario. Nunca incluye la contraseña ni el token. */
export type AuthFormState = {
  message?: string;
  fieldErrors?: FieldErrors;
  values?: { firstName?: string; lastName?: string; email?: string; phone?: string };
};

function formValue(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function signIn(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const values = { email: formValue(formData, "email") };
  const validated = validateSignIn(formData);
  // Los datos inválidos se detienen aquí: el servicio cuenta cada intento, también los fallidos.
  if ("fieldErrors" in validated) return { fieldErrors: validated.fieldErrors, values };

  // Si las credenciales son correctas, el servicio de datos generales deja abierta la sesión.
  const result = await generalData.signIn(validated.input);
  if (!result.ok) return { message: authErrorMessage(result.error), values };

  redirect(safeDestination(formData.get("destino")));
}

export async function signUp(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const values = {
    firstName: formValue(formData, "firstName"),
    lastName: formValue(formData, "lastName"),
    email: formValue(formData, "email"),
    phone: formValue(formData, "phone"),
  };
  const validated = validateSignUp(formData);
  if ("fieldErrors" in validated) return { fieldErrors: validated.fieldErrors, values };

  const created = await generalData.signUp(validated.input);
  if (!created.ok) return { message: authErrorMessage(created.error), values };

  // El registro no abre la sesión: hace falta un acceso con los mismos datos.
  const { email, password } = validated.input;
  const session = await generalData.signIn({ email, password });
  if (!session.ok) redirect(`${SIGN_IN_PATH}?cuenta=creada`);

  redirect(safeDestination(formData.get("destino")));
}

/** Borra la cookie. El servicio no tiene cierre de sesión: el token sigue válido allí hasta que vence. */
export async function signOut(): Promise<void> {
  await clearSessionCookie();
  redirect(SIGN_IN_PATH);
}
