/** Se ejecuta una vez al arrancar el servidor. Detiene el arranque si la configuración es inválida. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { checkConfiguration } = await import("@/lib/composition");
  checkConfiguration();
}
