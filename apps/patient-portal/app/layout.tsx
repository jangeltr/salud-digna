import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { PrototypeBanner } from "@/components/prototype-banner";
import { APP_DESCRIPTION, APP_NAME, THEME_COLOR } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: { default: APP_NAME, template: `%s | ${APP_NAME}` },
  description: APP_DESCRIPTION,
  // Prototipo con datos sintéticos: ningún buscador debe indexarlo.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: THEME_COLOR,
  colorScheme: "light",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body className="flex min-h-dvh flex-col bg-surface text-ink antialiased">
        <a href="#contenido" className="skip-link">
          Saltar al contenido
        </a>
        <PrototypeBanner />
        {/* Encabezado y contenido los pone cada grupo de rutas, en `PageFrame`: este diseño no lee cookies. */}
        {children}
      </body>
    </html>
  );
}
