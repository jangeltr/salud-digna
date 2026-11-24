import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

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
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default config;
