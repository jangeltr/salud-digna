import "server-only";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);

/**
 * Valida la URL base de un servicio. Exige https, salvo en localhost y 127.0.0.1.
 * Los mensajes de error nombran la variable y omiten su valor.
 */
export function readServiceUrl(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Falta ${name}. Cópiala de .env.example a .env.local.`);
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} debe ser una URL absoluta.`);
  }

  const isLocal = LOCAL_HOSTNAMES.has(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocal)) {
    throw new Error(`${name} debe usar https, salvo en localhost y 127.0.0.1.`);
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(`${name} debe contener solo el origen y la ruta.`);
  }

  return url.origin + url.pathname.replace(/\/+$/, "");
}
