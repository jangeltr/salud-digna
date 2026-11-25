import type { Metadata } from "next";
import { StudiesView } from "@/features/catalog/studies-view";

export const metadata: Metadata = { title: "Estudios" };

/**
 * Primera página del listado, sin búsqueda. No depende de la petición: se genera una vez,
 * se regenera cada `CATALOG_CACHE_SECONDS` y se puede servir desde caché.
 * La búsqueda y las páginas siguientes están en /estudios/buscar.
 */
export default function StudiesPage() {
  return <StudiesView q="" page={1} />;
}
