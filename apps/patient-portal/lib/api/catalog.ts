import "server-only";
import { cache } from "react";
import { apiRequest } from "./client";
import type { components } from "./schema";

type Schemas = components["schemas"];

export type Study = Schemas["StudyDto"];
export type StudyPage = Schemas["StudyPageDto"];
export type Clinic = Schemas["ClinicDto"];
export type ClinicPage = Schemas["ClinicPageDto"];

/** Parámetros que admite el contrato en los listados: `page`, `limit` y `q`. */
export type CatalogQuery = { page: number; limit: number; q?: string };

// El catálogo es público y cambia poco: sus respuestas se reutilizan unos segundos.
const CATALOG_REVALIDATE_SECONDS = 30;

export function listStudies(query: CatalogQuery) {
  return apiRequest<StudyPage>({
    method: "GET",
    path: "/studies",
    query,
    revalidate: CATALOG_REVALIDATE_SECONDS,
  });
}

/** `cache` evita repetir la llamada entre los metadatos y la página en un mismo renderizado. */
export const getStudy = cache((id: string) =>
  apiRequest<Study>({
    method: "GET",
    path: "/studies/{id}",
    params: { id },
    revalidate: CATALOG_REVALIDATE_SECONDS,
  }),
);

export function listClinics(query: CatalogQuery) {
  return apiRequest<ClinicPage>({
    method: "GET",
    path: "/clinics",
    query,
    revalidate: CATALOG_REVALIDATE_SECONDS,
  });
}
