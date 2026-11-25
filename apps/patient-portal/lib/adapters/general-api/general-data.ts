import "server-only";
import { cache } from "react";
import { CATALOG_CACHE_SECONDS } from "@/lib/cache-settings";
import { failure, success } from "@/lib/domain/errors";
import type { CatalogQuery, Page, Patient } from "@/lib/domain/model";
import type { GeneralData } from "@/lib/domain/ports";
import { clearSessionCookie, readSessionToken, writeSessionCookie } from "@/lib/session/cookie";
import { clinicIndex, findInIndex, studyIndex, toClinic, toStudy } from "./catalog";
import { apiRequest } from "./client";
import { forwardsClientIp, getApiBaseUrl } from "./config";
import { toFailure, toResult } from "./failures";
import type { components } from "./schema";
import { cachedProfile, forgetSession, rememberExpiry, rememberProfile } from "./session";

type Schemas = components["schemas"];

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
  forwardsClientIp();
}

/** Datos generales sobre la API general: catálogo, perfil, acceso y registro. */
export const generalApiData: GeneralData = {
  async listStudies(query) {
    const result = await apiRequest<Schemas["StudyPageDto"]>({
      method: "GET",
      path: "/studies",
      query: catalogParams(query),
      revalidate: CATALOG_CACHE_SECONDS,
    });
    return toResult(result, toPage(toStudy));
  },

  // Del índice del catálogo. `cache` evita repetir la búsqueda entre los metadatos y la página.
  getStudy: cache(async (id: string) => findInIndex(await studyIndex(), id, "/studies/{id}", toStudy)),

  async listClinics(query) {
    const result = await apiRequest<Schemas["ClinicPageDto"]>({
      method: "GET",
      path: "/clinics",
      query: catalogParams(query),
      revalidate: CATALOG_CACHE_SECONDS,
    });
    return toResult(result, toPage(toClinic));
  },

  getClinic: cache(async (id: string) => findInIndex(await clinicIndex(), id, "/clinics/{id}", toClinic)),

  async allClinics() {
    const index = await clinicIndex();
    return index.ok ? success({ items: index.data.items, truncated: index.data.truncated }) : index;
  },

  async getProfile() {
    // Sin token no se llama a la API: equivale a una sesión inválida.
    const token = await readSessionToken();
    if (!token) return failure("session");

    const known = await cachedProfile(token);
    if (known) return success(known);

    const result = await apiRequest<Schemas["AccountDto"]>({ method: "GET", path: "/auth/me", token });
    if (!result.ok) {
      if (result.status === 401) await forgetSession(token);
      return toFailure(result);
    }
    const patient = toPatient(result.data);
    await rememberProfile(token, patient);
    return success(patient);
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
    // Con el vencimiento conocido, el perfil de esta sesión se puede guardar unos segundos.
    await rememberExpiry(accessToken, Date.now() + Math.floor(expiresIn) * 1000);
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

  // La API no ofrece cerrar sesión: el token sigue siendo válido allí hasta que vence.
  async signOut() {
    const token = await readSessionToken();
    if (token) await forgetSession(token);
    await clearSessionCookie();
  },
};
