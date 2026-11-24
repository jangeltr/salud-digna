import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CLINICS_PATH, ClinicsView } from "@/features/catalog/clinics-view";
import { readPage, readText } from "@/features/catalog/params";

export const metadata: Metadata = { title: "Clínicas" };

/** Filtros y páginas siguientes del listado. Lee la URL, así que se genera en cada petición. */
export default async function ClinicSearchPage({ searchParams }: PageProps<"/clinicas/buscar">) {
  const params = await searchParams;
  const q = readText(params.q);
  const city = readText(params.ciudad);
  const page = readPage(params.pagina);
  // Sin filtros es la primera página del listado, que se sirve desde caché.
  if (!q && !city && page === 1) redirect(CLINICS_PATH);

  return <ClinicsView q={q} city={city} page={page} />;
}
