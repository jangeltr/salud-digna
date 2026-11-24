import "server-only";

/**
 * Lee una variable de entorno de tipo sí o no. Solo admite `true` y `false`.
 * Sin valor devuelve `fallback`. Cualquier otro valor detiene el arranque: una errata
 * no debe encender ni apagar nada en silencio.
 */
export function readFlag(name: string, value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} debe ser true o false.`);
}
