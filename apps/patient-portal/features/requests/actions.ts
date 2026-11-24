"use server";

import "server-only";
import { redirect } from "next/navigation";
import { isUuid } from "@/features/catalog/params";
import { requestNotifier, requestQuery } from "@/lib/composition";
import type { Result } from "@/lib/domain/errors";
import type { Receipt } from "@/lib/domain/ports";
import { clearSessionCookie } from "@/lib/session/cookie";
import { signInUrl } from "@/lib/session/routes";
import { hasSessionCookie } from "@/lib/session/session";
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

/** Identificador único de un evento. Se genera una vez por cada evento que emite una acción. */
function newEventId(): string {
  return crypto.randomUUID();
}

/**
 * Datos comunes de un evento sobre un trámite: su identificador y la versión que vio el paciente.
 * Sin ellos, o sin sesión, no se notifica nada.
 */
async function readTarget(formData: FormData): Promise<{ eventId: string; requestId: string; expectedVersion: number }> {
  const requestId = field(formData, "id");
  const expectedVersion = readVersion(formData);
  if (!isUuid(requestId) || expectedVersion === undefined) redirect(PENDING_PATH);

  if (!(await hasSessionCookie())) redirect(signInUrl(requestPath(requestId)));
  return { eventId: newEventId(), requestId, expectedVersion };
}

/** Con la sesión inválida, borra la cookie y lleva a /acceso con el trámite como destino. */
async function endSession(destination: string): Promise<never> {
  await clearSessionCookie();
  redirect(signInUrl(destination));
}

/**
 * Cierra una acción. Siempre redirige a la página del trámite, que vuelve a consultar su estado:
 * así la pantalla refleja lo que quedó registrado aunque la notificación haya fallado.
 */
async function settle(result: Result<Receipt>, id: string, onSuccess: string): Promise<never> {
  if (result.ok) redirect(onSuccess);

  switch (result.error.kind) {
    case "session":
      return endSession(requestPath(id));
    case "not-found":
      // La página responde «no encontrado», igual para un trámite inexistente que para uno ajeno.
      redirect(requestPath(id));
    case "conflict":
      redirect(requestPath(id, "cambio"));
    case "invalid":
      redirect(requestPath(id, "invalido"));
    default:
      redirect(requestPath(id, "servicio"));
  }
}

export type StartState = {
  message?: string;
  /** No se sabe si el trámite se creó: hay que revisar los pendientes antes de otro intento. */
  blocked?: boolean;
};

/** Inicia un trámite cuando el paciente lo pide y, si llegó un estudio válido, lo elige a continuación. */
export async function startRequest(_previous: StartState, formData: FormData): Promise<StartState> {
  const studyId = field(formData, "estudio");
  const returnTo = isUuid(studyId) ? `/tramite/nuevo?estudio=${studyId}` : "/tramite/nuevo";
  if (!(await hasSessionCookie())) redirect(signInUrl(returnTo));

  const known = new Set(field(formData, "conocidos").split(",").filter(isUuid));
  const startedAt = Date.now();

  // Del trámite iniciado solo hacen falta su identificador, su versión y si aún espera estudio.
  let started: { id: string; version?: number; awaitsStudy: boolean };
  const created = await requestNotifier.notify({ type: "request-started", eventId: newEventId() });
  if (created.ok) {
    // Un trámite recién iniciado empieza siempre por el estudio.
    started = { id: created.data.requestId, version: created.data.version, awaitsStudy: true };
  } else {
    if (created.error.kind === "session") await endSession(returnTo);
    if (created.error.kind !== "unavailable") {
      return { message: "No pudimos crear el trámite. Inténtalo de nuevo." };
    }

    // Resultado incierto: el trámite pudo crearse. Se consultan los pendientes antes de otro intento.
    const pending = await requestQuery.listPending({ page: 1, limit: 100 });
    if (!pending.ok) {
      if (pending.error.kind === "session") await endSession(returnTo);
      return {
        blocked: true,
        message: "No pudimos confirmar si el trámite se creó. Revisa tus trámites antes de intentarlo otra vez.",
      };
    }
    const found = pending.data.items.find(
      (item) => !known.has(item.id) && Date.parse(item.createdAt) >= startedAt - 120_000,
    );
    if (!found) return { message: "El servicio no respondió y el trámite no se creó. Inténtalo de nuevo." };
    started = { id: found.id, version: found.version, awaitsStudy: found.step === "study" };
  }

  if (isUuid(studyId) && started.awaitsStudy) {
    const saved = await requestNotifier.notify({
      type: "study-chosen",
      eventId: newEventId(),
      requestId: started.id,
      expectedVersion: started.version,
      studyId,
    });
    if (!saved.ok) {
      if (saved.error.kind === "session") await endSession(requestPath(started.id));
      redirect(requestPath(started.id, "estudio"));
    }
  }

  redirect(requestPath(started.id));
}

/** Reanuda un trámite abierto desde este canal. */
export async function continueRequest(formData: FormData): Promise<void> {
  const target = await readTarget(formData);
  const result = await requestNotifier.notify({ type: "request-resumed", ...target });
  await settle(result, target.requestId, requestPath(target.requestId));
}

export async function chooseStudy(formData: FormData): Promise<void> {
  const target = await readTarget(formData);
  const studyId = field(formData, "studyId");
  if (!isUuid(studyId)) redirect(requestPath(target.requestId, "invalido"));

  const result = await requestNotifier.notify({ type: "study-chosen", ...target, studyId });
  await settle(result, target.requestId, requestPath(target.requestId));
}

export async function chooseClinic(formData: FormData): Promise<void> {
  const target = await readTarget(formData);
  const clinicId = field(formData, "clinicId");
  if (!isUuid(clinicId)) redirect(requestPath(target.requestId, "invalido"));

  const result = await requestNotifier.notify({ type: "clinic-chosen", ...target, clinicId });
  await settle(result, target.requestId, requestPath(target.requestId));
}

export async function chooseSlot(formData: FormData): Promise<void> {
  const target = await readTarget(formData);
  const scheduledAt = field(formData, "scheduledAt");
  // Solo se aceptan horarios de la rejilla que sigan siendo futuros.
  if (!isOfferedSlot(scheduledAt)) redirect(requestPath(target.requestId, "invalido"));

  const result = await requestNotifier.notify({ type: "slot-chosen", ...target, scheduledAt });
  await settle(result, target.requestId, requestPath(target.requestId));
}

export async function saveNotes(formData: FormData): Promise<void> {
  const target = await readTarget(formData);
  const notes = field(formData, "notes").trim();
  if (notes.length > NOTES_MAX) redirect(requestPath(target.requestId, "invalido"));

  // Una nota vacía la quita.
  const result = await requestNotifier.notify({ type: "note-saved", ...target, note: notes === "" ? null : notes });
  await settle(result, target.requestId, requestPath(target.requestId, "nota"));
}

/** «Guardar y continuar después»: registra la pausa y conserva las selecciones. */
export async function pauseAndLeave(formData: FormData): Promise<void> {
  const target = await readTarget(formData);
  const result = await requestNotifier.notify({ type: "request-paused", ...target });
  await settle(result, target.requestId, `${PENDING_PATH}?aviso=guardado`);
}

export async function confirmAppointment(formData: FormData): Promise<void> {
  const target = await readTarget(formData);
  const result = await requestNotifier.notify({ type: "appointment-confirmed", ...target });
  await settle(result, target.requestId, requestPath(target.requestId));
}

export type AssistanceState = {
  message?: string;
  /** El código vive solo en esta respuesta: no viaja en la URL ni se guarda. */
  code?: string;
  /** Hora de vencimiento ya formateada en la zona de la rejilla. */
  expiresAt?: string;
};

const ASSISTANCE_FAILED = "No pudimos generar el código. Inténtalo de nuevo en unos minutos.";

/** Pide ayuda a un asesor. Solo se ejecuta cuando el paciente pulsa el botón. */
export async function requestAssistance(_previous: AssistanceState, formData: FormData): Promise<AssistanceState> {
  const id = field(formData, "id");
  if (!isUuid(id)) redirect(PENDING_PATH);
  if (!(await hasSessionCookie())) redirect(signInUrl(requestPath(id)));

  const result = await requestNotifier.notify({ type: "help-requested", eventId: newEventId(), requestId: id });
  if (result.ok) {
    const { assistance } = result.data;
    if (!assistance) return { message: ASSISTANCE_FAILED };
    return { code: assistance.code, expiresAt: formatClock(assistance.expiresAt) };
  }
  if (result.error.kind === "session") await endSession(requestPath(id));
  if (result.error.kind === "not-found") redirect(requestPath(id));
  if (result.error.kind === "conflict") redirect(requestPath(id, "cambio"));
  return { message: ASSISTANCE_FAILED };
}
