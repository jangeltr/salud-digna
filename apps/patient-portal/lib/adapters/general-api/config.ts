import "server-only";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);

/**
 * Lee y valida API_BASE_URL. Exige https, salvo en localhost y 127.0.0.1.
 * Los mensajes de error omiten el valor de la variable.
 */
export function readApiBaseUrl(value = process.env.API_BASE_URL): string {
  if (!value) {
    throw new Error("Falta API_BASE_URL. Cópiala de .env.example a .env.local.");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("API_BASE_URL debe ser una URL absoluta.");
  }

  const isLocal = LOCAL_HOSTNAMES.has(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocal)) {
    throw new Error("API_BASE_URL debe usar https, salvo en localhost y 127.0.0.1.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("API_BASE_URL debe contener solo el origen y la ruta.");
  }

  return url.origin + url.pathname.replace(/\/+$/, "");
}

let apiBaseUrl: string | undefined;

export function getApiBaseUrl(): string {
  apiBaseUrl ??= readApiBaseUrl();
  return apiBaseUrl;
}
