"use server";

import "server-only";
import { notFound, redirect } from "next/navigation";
import { attemptStore, generalData } from "@/lib/composition";
import { readClientIp } from "@/lib/session/client-ip";
import { LOGIN_BY_EMAIL, LOGIN_BY_IP } from "@/lib/session/limits";
import { SIGN_IN_PATH, safeDestination } from "@/lib/session/routes";
import { isRegistrationEnabled } from "@/lib/settings";
import { authErrorMessage, tooManyAttempts } from "./messages";
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

  // Límites propios del portal: por correo y por IP del cliente, con espera creciente.
  // Sin la cabecera del proxy no hay IP, y entonces solo se aplica el límite por correo.
  const emailKey = `login-email:${validated.input.email.toLowerCase()}`;
  const clientIp = await readClientIp();
  const ipKey = clientIp ? `login-ip:${clientIp}` : undefined;
  const blocked = Math.max(await attemptStore.blockedFor(emailKey), ipKey ? await attemptStore.blockedFor(ipKey) : 0);
  // Con una espera pendiente no se llama al servicio, ni siquiera con la contraseña correcta.
  if (blocked > 0) return { message: tooManyAttempts(blocked), values };

  // Si las credenciales son correctas, el servicio de datos generales deja abierta la sesión.
  const result = await generalData.signIn(validated.input);
  if (!result.ok) {
    const { kind } = result.error;
    // Cuenta cualquier rechazo del servicio. Que el servicio no responda o aplique su propio límite no cuenta.
    if (kind !== "unavailable" && kind !== "rate-limited") {
      const wait = Math.max(
        await attemptStore.recordFailure(emailKey, LOGIN_BY_EMAIL),
        ipKey ? await attemptStore.recordFailure(ipKey, LOGIN_BY_IP) : 0,
      );
      if (wait > 0) return { message: tooManyAttempts(wait), values };
    }
    return { message: authErrorMessage(result.error), values };
  }

  // Un acceso correcto borra los fallos de ese correo. Los de la IP se conservan:
  // una cuenta válida no debe servir para seguir probando otras desde la misma IP.
  await attemptStore.clearFailures(emailKey);
  redirect(safeDestination(formData.get("destino")));
}

export async function signUp(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  // Con el registro apagado la página no existe. Si aun así llega el envío, se rechaza sin llamar al servicio.
  if (!isRegistrationEnabled()) notFound();

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

/** Cierra la sesión del portal. El servicio no tiene cierre de sesión: el token sigue válido allí hasta que vence. */
export async function signOut(): Promise<void> {
  await generalData.signOut();
  redirect(SIGN_IN_PATH);
}
