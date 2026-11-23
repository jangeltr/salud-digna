import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Administración | Salud Digna",
  description: "Consola administrativa de Salud Digna",
};

export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="es-MX"><body>{children}</body></html>;
}
