/**
 * Duración de la caché del catálogo, en segundos. La fija `CATALOG_CACHE_SECONDS` al compilar:
 * `next.config.ts` valida la variable y Next escribe su valor en el código compilado.
 * Cambiarla exige volver a compilar.
 *
 * La usan la caché de datos de las lecturas del catálogo, la regeneración de las páginas de catálogo
 * y su cabecera `Cache-Control`.
 */
export const CATALOG_CACHE_SECONDS = Number(process.env.CATALOG_CACHE_SECONDS) || 300;
