import type { Metadata } from "next";
import { ClinicsView } from "@/features/catalog/clinics-view";

export const metadata: Metadata = { title: "Clínicas" };

/**
 * Primera página del listado, sin filtros. No depende de la petición: se genera una vez,
 * se regenera cada `CATALOG_CACHE_SECONDS` y se puede servir desde caché.
 * Los filtros y las páginas siguientes están en /clinicas/buscar.
 */
export default function ClinicsPage() {
  return <ClinicsView q="" city="" page={1} />;
}
