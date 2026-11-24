import "server-only";
import { cache } from "react";
import { failure, success } from "@/lib/domain/errors";
import type { CatalogQuery, Clinic, Page, Patient, Study } from "@/lib/domain/model";
import type { GeneralData } from "@/lib/domain/ports";
import { writeSessionCookie } from "@/lib/session/cookie";
import { authorizedRequest } from "./authorized";
import { apiRequest } from "./client";
import { getApiBaseUrl } from "./config";
import { toFailure, toResult } from "./failures";
import type { components } from "./schema";

type Schemas = components["schemas"];

// El catálogo es público y cambia poco: sus respuestas se reutilizan unos segundos.
const CATALOG_REVALIDATE_SECONDS = 30;

function toStudy(dto: Schemas["StudyDto"]): Study {
  return { id: dto.id, name: dto.name, description: dto.description ?? undefined, price: dto.price };
}

function toClinic(dto: Schemas["ClinicDto"]): Clinic {
  return { id: dto.id, name: dto.name, address: dto.address, city: dto.city, state: dto.state };
}

function toPatient(dto: Schemas["AccountDto"]): Patient {
  return {
    accountId: dto.id,
    patientId: dto.patientId ?? undefined,
    email: dto.email,
    firstName: dto.patient?.firstName,
    lastName: dto.patient?.lastName,
    phone: dto.patient?.phone ?? undefined,
  };
}

function toPage<Dto, Item>(toItem: (dto: Dto) => Item) {
  return (page: { items: Dto[]; hasMore: boolean }): Page<Item> => ({
    items: page.items.map(toItem),
    hasMore: page.hasMore,
  });
}

/** El contrato admite `page`, `limit` y `q` en los listados. */
function catalogParams({ page, limit, search }: CatalogQuery) {
  return { page, limit, q: search };
}

/** Detiene el arranque si falta la URL de la API general o es inválida. */
export function checkGeneralApiConfiguration(): void {
  getApiBaseUrl();
}

/** Datos generales sobre la API general: catálogo, perfil, acceso y registro. */
export const generalApiData: GeneralData = {
  async listStudies(query) {
    const result = await apiRequest<Schemas["StudyPageDto"]>({
      method: "GET",
      path: "/studies",
      query: catalogParams(query),
      revalidate: CATALOG_REVALIDATE_SECONDS,
    });
    return toResult(result, toPage(toStudy));
  },

  // `cache` evita repetir la llamada entre los metadatos y la página en un mismo renderizado.
  getStudy: cache(async (id: string) => {
    const result = await apiRequest<Schemas["StudyDto"]>({
      method: "GET",
      path: "/studies/{id}",
      params: { id },
      revalidate: CATALOG_REVALIDATE_SECONDS,
    });
    return toResult(result, toStudy);
  }),

  async listClinics(query) {
    const result = await apiRequest<Schemas["ClinicPageDto"]>({
      method: "GET",
      path: "/clinics",
      query: catalogParams(query),
      revalidate: CATALOG_REVALIDATE_SECONDS,
    });
    return toResult(result, toPage(toClinic));
  },

  getClinic: cache(async (id: string) => {
    const result = await apiRequest<Schemas["ClinicDto"]>({
      method: "GET",
      path: "/clinics/{id}",
      params: { id },
      revalidate: CATALOG_REVALIDATE_SECONDS,
    });
    return toResult(result, toClinic);
  }),

  async getProfile() {
    const result = await authorizedRequest<Schemas["AccountDto"]>({ method: "GET", path: "/auth/me" });
    return toResult(result, toPatient);
  },

  async signIn({ email, password }) {
    const result = await apiRequest<Schemas["LoginResponseDto"]>({
      method: "POST",
      path: "/auth/login",
      body: { email, password },
    });
    if (!result.ok) return toFailure(result);

    // El token pasa directo a la cookie de sesión: nunca sale de este adaptador.
    const { accessToken, expiresIn } = result.data;
    if (!accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) return failure("unavailable");
    await writeSessionCookie(accessToken, Math.floor(expiresIn));
    return success(undefined);
  },

  async signUp({ firstName, lastName, email, password, phone }) {
    const result = await apiRequest<Schemas["AccountDto"]>({
      method: "POST",
      path: "/auth/register",
      // El contrato pide omitir el teléfono cuando no se conoce.
      body: { firstName, lastName, email, password, ...(phone ? { phone } : {}) },
    });
    return toResult(result, () => undefined);
  },
};
