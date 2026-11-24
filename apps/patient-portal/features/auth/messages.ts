import type { PortalError } from "@/lib/domain/errors";
import { waitText } from "@/lib/session/limits";

/** Aviso de espera. Es el mismo cuando el límite lo pone el portal y cuando lo pone el servicio. */
export function tooManyAttempts(seconds: number | undefined): string {
  return `Demasiados intentos. Espera ${waitText(seconds)} antes de volver a intentarlo.`;
}

/**
 * Mensaje para el paciente según el error. Nunca reproduce el texto que devuelve el servicio.
 */
export function authErrorMessage(error: PortalError): string {
  switch (error.kind) {
    case "unavailable":
      return "El servicio no está disponible en este momento. Inténtalo de nuevo más tarde.";
    case "invalid":
      return "Revisa los datos del formulario e inténtalo de nuevo.";
    case "session":
      return "No pudimos iniciar sesión con esos datos. Revisa el correo y la contraseña.";
    case "conflict":
      return "No se pudo crear la cuenta con ese correo. Si ya tienes una cuenta, inicia sesión.";
    case "rate-limited":
      return tooManyAttempts(error.retryAfterSeconds);
    default:
      return "No pudimos completar la operación. Inténtalo de nuevo más tarde.";
  }
}
