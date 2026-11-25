import { connection } from "next/server";
import { ServiceUnavailable } from "@/components/service-unavailable";

/**
 * Aviso de servicio no disponible para las páginas de catálogo, que pueden generarse una vez y
 * servirse desde caché. Antes de pintarlo exige una petición en curso, con `connection()`:
 *
 * - Durante `next build` sin la API, la página deja de ser estática y se genera en cada petición,
 *   en lugar de guardarse con el aviso.
 * - Al regenerarse en segundo plano, la regeneración falla y Next sigue sirviendo la copia anterior.
 * - En una petición normal, se muestra el aviso.
 */
export async function CatalogUnavailable({ retryHref }: { retryHref: string }) {
  await connection();
  return <ServiceUnavailable retryHref={retryHref} />;
}
