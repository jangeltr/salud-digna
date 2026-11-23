import type { ApiFailure } from "@/lib/api/client";

function formatWait(seconds: number | undefined): string {
  if (seconds === undefined || seconds <= 0) return "unos minutos";
  if (seconds < 60) return seconds === 1 ? "1 segundo" : `${seconds} segundos`;
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? "1 minuto" : `${minutes} minutos`;
}

/**
 * Mensaje para el paciente según el código HTTP. Nunca reproduce el texto que devuelve la API.
 */
export function authErrorMessage(failure: ApiFailure): string {
  if (failure.status === null || failure.status >= 500) {
    return "El servicio no está disponible en este momento. Inténtalo de nuevo más tarde.";
  }

  switch (failure.status) {
    case 400:
      return "Revisa los datos del formulario e inténtalo de nuevo.";
    case 401:
      return "No pudimos iniciar sesión con esos datos. Revisa el correo y la contraseña.";
    case 409:
      return "No se pudo crear la cuenta con ese correo. Si ya tienes una cuenta, inicia sesión.";
    case 429:
      return `Demasiados intentos. Espera ${formatWait(failure.retryAfter)} antes de volver a intentarlo.`;
    default:
      return "No pudimos completar la operación. Inténtalo de nuevo más tarde.";
  }
}
