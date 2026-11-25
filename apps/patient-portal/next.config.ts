import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

/**
 * `CATALOG_CACHE_SECONDS`: segundos que dura en caché el catálogo, de 1 a 86 400. Sin valor, 300.
 * Se lee al compilar y Next escribe el valor en el código: cambiarla exige volver a compilar.
 */
function readCatalogCacheSeconds(value = process.env.CATALOG_CACHE_SECONDS): string {
  if (value === undefined || value === "") return "300";
  if (!/^\d{1,5}$/.test(value) || Number(value) < 1 || Number(value) > 86_400) {
    throw new Error("CATALOG_CACHE_SECONDS debe ser un número entero de segundos entre 1 y 86400.");
  }
  return String(Number(value));
}

// Solo se permite lo que el portal usa: copiar al portapapeles desde su propio origen.
const permissionsPolicy = [
  "accelerometer=()",
  "autoplay=()",
  "browsing-topics=()",
  "camera=()",
  "clipboard-read=()",
  "clipboard-write=(self)",
  "display-capture=()",
  "encrypted-media=()",
  "fullscreen=()",
  "geolocation=()",
  "gyroscope=()",
  "magnetometer=()",
  "microphone=()",
  "midi=()",
  "payment=()",
  "picture-in-picture=()",
  "publickey-credentials-get=()",
  "screen-wake-lock=()",
  "usb=()",
  "xr-spatial-tracking=()",
].join(", ");

// La política de contenido lleva un nonce por petición, así que la escribe `proxy.ts`.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: permissionsPolicy },
  // El portal es un prototipo: ningún buscador debe indexarlo. Cubre también lo que no es HTML.
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  // Solo en producción y sin `includeSubDomains`: el dominio puede tener otros servicios sin HTTPS.
  ...(isProduction ? [{ key: "Strict-Transport-Security", value: "max-age=15552000" }] : []),
];

const config: NextConfig = {
  agentRules: false,
  poweredByHeader: false,
  env: { CATALOG_CACHE_SECONDS: readCatalogCacheSeconds() },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default config;
