import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { readPage, readText } from "@/features/catalog/params";
import { STUDIES_PATH, StudiesView } from "@/features/catalog/studies-view";

export const metadata: Metadata = { title: "Estudios" };

/** Búsqueda y páginas siguientes del listado. Lee la URL, así que se genera en cada petición. */
export default async function StudySearchPage({ searchParams }: PageProps<"/estudios/buscar">) {
  const params = await searchParams;
  const q = readText(params.q);
  const page = readPage(params.pagina);
  // Sin filtros es la primera página del listado, que se sirve desde caché.
  if (!q && page === 1) redirect(STUDIES_PATH);

  return <StudiesView q={q} page={page} />;
}
