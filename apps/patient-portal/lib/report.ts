import "server-only";

/**
 * Deja constancia de un error que se mostró al paciente. Solo el lugar, con la ruta del patrón y no la
 * concreta, y el tipo de error del portal: nunca identificadores, datos del paciente ni credenciales.
 */
export function reportShownError(where: string, kind: string): void {
  console.warn(`[portal] error mostrado en ${where}: ${kind}`);
}
