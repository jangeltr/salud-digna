import type { PortalError } from "@/lib/domain/errors";

function formatWait(seconds: number | undefined): string {
  if (seconds === undefined || seconds <= 0) return "unos minutos";
  if (seconds < 60) return seconds === 1 ? "1 segundo" : `${seconds} segundos`;
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? "1 minuto" : `${minutes} minutos`;
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
      return `Demasiados intentos. Espera ${formatWait(error.retryAfterSeconds)} antes de volver a intentarlo.`;
    default:
      return "No pudimos completar la operación. Inténtalo de nuevo más tarde.";
  }
}
