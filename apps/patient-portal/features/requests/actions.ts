"use server";

import "server-only";
import { redirect } from "next/navigation";
import { isUuid } from "@/features/catalog/params";
import type { ApiResult } from "@/lib/api/client";
import {
  confirmRequest,
  createRequest,
  issueAssistanceCode,
  listPendingRequests,
  pauseRequest,
  resumeRequest,
  updateRequestContext,
  type RequestSnapshot,
} from "@/lib/api/requests";
import { clearSessionCookie, readSessionToken } from "@/lib/session/cookie";
import { signInUrl } from "@/lib/session/routes";
import { formatClock, isOfferedSlot } from "./schedule";

const NOTES_MAX = 500;
const PENDING_PATH = "/continuar";

function requestPath(id: string, notice?: string): string {
  return notice ? `/tramite/${id}?aviso=${notice}` : `/tramite/${id}`;
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function readVersion(formData: FormData): number | undefined {
  const raw = field(formData, "version");
  if (!/^\d{1,10}$/.test(raw)) return undefined;
  const version = Number(raw);
  return version >= 1 && version <= 2_147_483_647 ? version : undefined;
}

/** Identificador, versión y token de una acción sobre un trámite. Sin ellos no se llama a la API. */
async function readTarget(formData: FormData): Promise<{ id: string; version: number; token: string }> {
  const id = field(formData, "id");
  const version = readVersion(formData);
  if (!isUuid(id) || version === undefined) redirect(PENDING_PATH);

  const token = await readSessionToken();
  if (!token) redirect(signInUrl(requestPath(id)));
  return { id, version, token };
}

/** Ante 401, borra la cookie y lleva a /acceso con el trámite como destino. */
async function endSession(destination: string): Promise<never> {
  await clearSessionCookie();
  redirect(signInUrl(destination));
}

/**
 * Cierra una acción. Siempre redirige a la página del trámite, que vuelve a leer su estado en la API:
 * así la pantalla refleja lo que quedó guardado aunque la respuesta haya sido un error.
 */
async function settle(result: ApiResult<unknown>, id: string, onSuccess: string): Promise<never> {
  if (result.ok) redirect(onSuccess);
  if (result.status === 401) await endSession(requestPath(id));
  // 404: la página responde «no encontrado», igual para un trámite inexistente que para uno ajeno.
  if (result.status === 404) redirect(requestPath(id));
  if (result.status === 409) redirect(requestPath(id, "cambio"));
  if (result.status === 400) redirect(requestPath(id, "invalido"));
  redirect(requestPath(id, "servicio"));
}

export type StartState = {
  message?: string;
  /** No se sabe si el trámite se creó: hay que revisar los pendientes antes de otro intento. */
  blocked?: boolean;
};

/** Crea un trámite cuando el paciente lo pide y, si llegó un estudio válido, lo guarda en el contexto. */
export async function startRequest(_previous: StartState, formData: FormData): Promise<StartState> {
  const studyId = field(formData, "estudio");
  const returnTo = isUuid(studyId) ? `/tramite/nuevo?estudio=${studyId}` : "/tramite/nuevo";
  const token = await readSessionToken();
  if (!token) redirect(signInUrl(returnTo));

  const known = new Set(field(formData, "conocidos").split(",").filter(isUuid));
  const startedAt = Date.now();

  let request: RequestSnapshot | undefined;
  const created = await createRequest(token);
  if (created.ok) {
    request = created.data;
  } else {
    if (created.status === 401) await endSession(returnTo);
    if (created.status !== null && created.status < 500) {
      return { message: "No pudimos crear el trámite. Inténtalo de nuevo." };
    }

    // Respuesta incierta: la API pudo crear el trámite. Se consultan los pendientes antes de otro intento.
    const pending = await listPendingRequests(token, 1, 100);
    if (!pending.ok) {
      if (pending.status === 401) await endSession(returnTo);
      return {
        blocked: true,
        message: "No pudimos confirmar si el trámite se creó. Revisa tus trámites antes de intentarlo otra vez.",
      };
    }
    request = pending.data.items.find(
      (item) => !known.has(item.id) && Date.parse(item.createdAt) >= startedAt - 120_000,
    );
    if (!request) return { message: "El servicio no respondió y el trámite no se creó. Inténtalo de nuevo." };
  }

  if (isUuid(studyId) && request.currentStep === "SELECT_STUDY") {
    const saved = await updateRequestContext(token, request.id, request.version, { studyId });
    if (!saved.ok) {
      if (saved.status === 401) await endSession(requestPath(request.id));
      redirect(requestPath(request.id, "estudio"));
    }
  }

  redirect(requestPath(request.id));
}

/** Reanuda un trámite abierto desde este canal. */
export async function continueRequest(formData: FormData): Promise<void> {
  const { id, version, token } = await readTarget(formData);
  await settle(await resumeRequest(token, id, version), id, requestPath(id));
}

export async function chooseStudy(formData: FormData): Promise<void> {
  const { id, version, token } = await readTarget(formData);
  const studyId = field(formData, "studyId");
  if (!isUuid(studyId)) redirect(requestPath(id, "invalido"));

  await settle(await updateRequestContext(token, id, version, { studyId }), id, requestPath(id));
}

export async function chooseClinic(formData: FormData): Promise<void> {
  const { id, version, token } = await readTarget(formData);
  const clinicId = field(formData, "clinicId");
  if (!isUuid(clinicId)) redirect(requestPath(id, "invalido"));

  await settle(await updateRequestContext(token, id, version, { clinicId }), id, requestPath(id));
}

export async function chooseSlot(formData: FormData): Promise<void> {
  const { id, version, token } = await readTarget(formData);
  const scheduledAt = field(formData, "scheduledAt");
  // Solo se aceptan horarios de la rejilla que sigan siendo futuros.
  if (!isOfferedSlot(scheduledAt)) redirect(requestPath(id, "invalido"));

  await settle(await updateRequestContext(token, id, version, { scheduledAt }), id, requestPath(id));
}

export async function saveNotes(formData: FormData): Promise<void> {
  const { id, version, token } = await readTarget(formData);
  const notes = field(formData, "notes").trim();
  if (notes.length > NOTES_MAX) redirect(requestPath(id, "invalido"));

  // El contrato pide enviar null para quitar la nota.
  const result = await updateRequestContext(token, id, version, { notes: notes === "" ? null : notes });
  await settle(result, id, requestPath(id, "nota"));
}

/** «Guardar y continuar después»: registra la pausa y conserva el contexto. */
export async function pauseAndLeave(formData: FormData): Promise<void> {
  const { id, version, token } = await readTarget(formData);
  await settle(await pauseRequest(token, id, version), id, `${PENDING_PATH}?aviso=guardado`);
}

export async function confirmAppointment(formData: FormData): Promise<void> {
  const { id, version, token } = await readTarget(formData);
  await settle(await confirmRequest(token, id, version), id, requestPath(id));
}

export type AssistanceState = {
  message?: string;
  /** El código vive solo en esta respuesta: no viaja en la URL ni se guarda. */
  code?: string;
  /** Hora de vencimiento ya formateada en la zona de la rejilla. */
  expiresAt?: string;
};

/** Emite un código de asistencia. Solo se ejecuta cuando el paciente pulsa el botón. */
export async function requestAssistance(_previous: AssistanceState, formData: FormData): Promise<AssistanceState> {
  const id = field(formData, "id");
  if (!isUuid(id)) redirect(PENDING_PATH);
  const token = await readSessionToken();
  if (!token) redirect(signInUrl(requestPath(id)));

  const result = await issueAssistanceCode(token, id);
  if (result.ok) return { code: result.data.code, expiresAt: formatClock(result.data.expiresAt) };
  if (result.status === 401) await endSession(requestPath(id));
  if (result.status === 404) redirect(requestPath(id));
  if (result.status === 409) redirect(requestPath(id, "cambio"));
  return { message: "No pudimos generar el código. Inténtalo de nuevo en unos minutos." };
}
