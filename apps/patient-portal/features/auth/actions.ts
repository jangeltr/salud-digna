"use server";

import "server-only";
import { redirect } from "next/navigation";
import { login, register, type LoginResponse } from "@/lib/api/auth";
import { clearSessionCookie, writeSessionCookie } from "@/lib/session/cookie";
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

/** Guarda el token en la cookie de sesión. Devuelve false si la respuesta no trae una vigencia usable. */
async function startSession({ accessToken, expiresIn }: LoginResponse): Promise<boolean> {
  if (!accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) return false;
  await writeSessionCookie(accessToken, Math.floor(expiresIn));
  return true;
}

export async function signIn(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const values = { email: formValue(formData, "email") };
  const validated = validateSignIn(formData);
  // Los datos inválidos se detienen aquí: la API cuenta cada intento, también los fallidos.
  if ("fieldErrors" in validated) return { fieldErrors: validated.fieldErrors, values };

  const result = await login(validated.input);
  if (!result.ok) return { message: authErrorMessage(result), values };
  if (!(await startSession(result.data))) return { message: authErrorMessage({ ok: false, status: null }), values };

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

  const created = await register(validated.input);
  if (!created.ok) return { message: authErrorMessage(created), values };

  // El registro no devuelve token: la sesión empieza con una llamada a login.
  const { email, password } = validated.input;
  const session = await login({ email, password });
  if (!session.ok || !(await startSession(session.data))) {
    redirect(`${SIGN_IN_PATH}?cuenta=creada`);
  }

  redirect(safeDestination(formData.get("destino")));
}

/** Borra la cookie. La API no tiene cierre de sesión: el token sigue válido allí hasta que vence. */
export async function signOut(): Promise<void> {
  await clearSessionCookie();
  redirect(SIGN_IN_PATH);
}
