import type { ReactNode } from "react";
import { PageFrame } from "@/components/page-frame";

/**
 * Páginas sin sesión. No leen ninguna cookie en el servidor: el encabezado se decide en el navegador.
 * Las de catálogo sin filtros se generan una vez y se sirven desde caché.
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return <PageFrame>{children}</PageFrame>;
}
