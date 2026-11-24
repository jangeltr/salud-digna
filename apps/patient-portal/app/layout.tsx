import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { PrototypeBanner } from "@/components/prototype-banner";
import { SiteHeader } from "@/components/site-header";
import { APP_DESCRIPTION, APP_NAME, THEME_COLOR } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: { default: APP_NAME, template: `%s | ${APP_NAME}` },
  description: APP_DESCRIPTION,
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
        <SiteHeader />
        <main
          id="contenido"
          tabIndex={-1}
          className="safe-x mx-auto w-full max-w-3xl flex-1 scroll-mt-12 py-8 outline-none"
        >
          {children}
        </main>
      </body>
    </html>
  );
}
