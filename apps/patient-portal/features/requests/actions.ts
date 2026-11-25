"use server";

import "server-only";
import { redirect } from "next/navigation";
import { isUuid } from "@/features/catalog/params";
import { attemptStore, generalData, requestCapabilities, requestNotifier, requestQuery } from "@/lib/composition";
import type { Result } from "@/lib/domain/errors";
import type { Receipt } from "@/lib/domain/ports";
import { CONTINUITY_CODES_PER_HOUR, CONTINUITY_REDEEM, REQUESTS_PER_HOUR, waitText } from "@/lib/session/limits";
import type { AttemptLimit } from "@/lib/state/ports";
import { reportShownError } from "@/lib/report";
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

/**
 * Lo que el adaptador activo no soporta tampoco se muestra. Si aun así llega la acción,
 * vuelve al trámite sin notificar nada.
 */
function requireSupport(supported: boolean, requestId: string): void {
  if (!supported) redirect(requestPath(requestId));
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

  if (result.error.kind !== "session") reportShownError("acción sobre /tramite/[id]", result.error.kind);
  switch (result.error.kind) {
    case "session":
      return endSession(requestPath(id));
    case "not-found":
      // La página responde «no encontrado», igual para un trámite inexistente que para uno ajeno.
      redirect(requestPath(id));
    case "access-expired":
      // La página explica que el trámite necesita un permiso nuevo.
      redirect(requestPath(id));
    case "conflict":
      redirect(requestPath(id, "cambio"));
    case "invalid":
      redirect(requestPath(id, "invalido"));
    case "identity-unavailable":
      redirect(requestPath(id, "identidad"));
    default:
      redirect(requestPath(id, "servicio"));
  }
}

/**
 * Tope por paciente y por hora. Devuelve 0 si la acción puede seguir, o los segundos que faltan.
 * Pide el perfil para saber de qué paciente es la sesión. Si el servicio no responde, no cuenta:
 * la acción fallará después por el mismo motivo.
 */
async function hourlyWait(name: string, limit: AttemptLimit, destination: string): Promise<number> {
  const profile = await generalData.getProfile();
  if (!profile.ok) {
    if (profile.error.kind === "session") await endSession(destination);
    return 0;
  }
  return attemptStore.take(`${name}:${profile.data.accountId}`, limit);
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

  const wait = await hourlyWait("start-request", REQUESTS_PER_HOUR, returnTo);
  if (wait > 0) {
    return { message: `Has empezado demasiados trámites en la última hora. Podrás empezar otro en ${waitText(wait)}.` };
  }

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
    reportShownError("acción: empezar trámite", created.error.kind);
    if (created.error.kind === "identity-unavailable") {
      // Sin acreditación no se crea nada: nunca se recurre a un trámite anónimo.
      return { message: "No pudimos verificar tu identidad, así que no se creó ningún trámite. Inténtalo de nuevo en unos minutos." };
    }
    if (created.error.kind !== "unavailable") {
      return { message: "No pudimos crear el trámite. Inténtalo de nuevo." };
    }
    if (!requestCapabilities.patientListing) {
      // Sin lista por paciente no hay cómo comprobar si el trámite se creó. El adaptador ya reenvió
      // la creación una vez y guarda su clave: el siguiente intento recupera el mismo trámite.
      return {
        message:
          "El servicio no respondió y no pudimos confirmar si el trámite se creó. Vuelve a intentarlo en unos segundos: si ya se había creado, continuarás con ese mismo y no se duplicará.",
      };
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
      reportShownError("acción: elegir estudio al empezar", saved.error.kind);
      redirect(requestPath(started.id, "estudio"));
    }
  }

  redirect(requestPath(started.id));
}

/** Reanuda un trámite abierto desde este canal. */
export async function continueRequest(formData: FormData): Promise<void> {
  const target = await readTarget(formData);
  requireSupport(requestCapabilities.pause, target.requestId);
  const result = await requestNotifier.notify({ type: "request-resumed", ...target });
  await settle(result, target.requestId, requestPath(target.requestId));
}

/**
 * Elegir el estudio o la clínica que ya tiene el contexto vigente no publica nada: se vuelve a la pantalla sin
 * escribir, para no llenar el historial que ven los demás canales y Administración. La pantalla ya oculta el botón
 * de la opción elegida; esto cubre el formulario de otra pestaña o uno manipulado. Se compara con el contexto
 * vigente, no con la versión que vio el paciente: no escribir nada es seguro aunque el trámite haya avanzado.
 * Si la lectura falla, se publica como siempre y el servicio decide.
 */
async function isUnchanged(target: { requestId: string }, selected: { studyId?: string; clinicId?: string }) {
  const current = await requestQuery.getRequest(target.requestId);
  if (!current.ok) return false;
  const { selections } = current.data;
  return selected.studyId !== undefined
    ? selections.studyId?.toLowerCase() === selected.studyId
    : selections.clinicId?.toLowerCase() === selected.clinicId;
}

export async function chooseStudy(formData: FormData): Promise<void> {
  const target = await readTarget(formData);
  const studyId = field(formData, "studyId");
  if (!isUuid(studyId)) redirect(requestPath(target.requestId, "invalido"));
  if (await isUnchanged(target, { studyId: studyId.toLowerCase() })) redirect(requestPath(target.requestId));

  const result = await requestNotifier.notify({ type: "study-chosen", ...target, studyId });
  await settle(result, target.requestId, requestPath(target.requestId));
}

export async function chooseClinic(formData: FormData): Promise<void> {
  const target = await readTarget(formData);
  const clinicId = field(formData, "clinicId");
  if (!isUuid(clinicId)) redirect(requestPath(target.requestId, "invalido"));
  if (await isUnchanged(target, { clinicId: clinicId.toLowerCase() })) redirect(requestPath(target.requestId));

  const result = await requestNotifier.notify({ type: "clinic-chosen", ...target, clinicId });
  await settle(result, target.requestId, requestPath(target.requestId));
}

export async function chooseSlot(formData: FormData): Promise<void> {
  const target = await readTarget(formData);
  requireSupport(requestCapabilities.slot, target.requestId);
  const scheduledAt = field(formData, "scheduledAt");
  // Solo se aceptan horarios de la rejilla que sigan siendo futuros.
  if (!isOfferedSlot(scheduledAt)) redirect(requestPath(target.requestId, "invalido"));

  const result = await requestNotifier.notify({ type: "slot-chosen", ...target, scheduledAt });
  await settle(result, target.requestId, requestPath(target.requestId));
}

export async function saveNotes(formData: FormData): Promise<void> {
  const target = await readTarget(formData);
  requireSupport(requestCapabilities.note, target.requestId);
  const notes = field(formData, "notes").trim();
  if (notes.length > NOTES_MAX) redirect(requestPath(target.requestId, "invalido"));

  // Una nota vacía la quita.
  const result = await requestNotifier.notify({ type: "note-saved", ...target, note: notes === "" ? null : notes });
  await settle(result, target.requestId, requestPath(target.requestId, "nota"));
}

/** «Guardar y continuar después»: registra la pausa y conserva las selecciones. */
export async function pauseAndLeave(formData: FormData): Promise<void> {
  const target = await readTarget(formData);
  requireSupport(requestCapabilities.pause, target.requestId);
  const result = await requestNotifier.notify({ type: "request-paused", ...target });
  await settle(result, target.requestId, `${PENDING_PATH}?aviso=guardado`);
}

export async function confirmAppointment(formData: FormData): Promise<void> {
  const target = await readTarget(formData);
  requireSupport(requestCapabilities.patientConfirmation, target.requestId);
  const result = await requestNotifier.notify({ type: "appointment-confirmed", ...target });
  await settle(result, target.requestId, requestPath(target.requestId));
}

/** «Enviar a confirmación»: el paciente termina sus selecciones y la cita la confirma un canal de atención. */
export async function requestConfirmation(formData: FormData): Promise<void> {
  const target = await readTarget(formData);
  requireSupport(!requestCapabilities.patientConfirmation, target.requestId);
  const result = await requestNotifier.notify({ type: "confirmation-requested", ...target });
  await settle(result, target.requestId, requestPath(target.requestId, "enviado"));
}

/** «Cancelar trámite». La pantalla pide confirmación antes de mostrar el formulario que llega aquí. */
export async function cancelRequest(formData: FormData): Promise<void> {
  const target = await readTarget(formData);
  requireSupport(requestCapabilities.cancellation, target.requestId);
  const result = await requestNotifier.notify({ type: "request-cancelled", ...target });
  await settle(result, target.requestId, requestPath(target.requestId, "cancelado"));
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
  requireSupport(requestCapabilities.advisorHelp, id);

  const result = await requestNotifier.notify({ type: "help-requested", eventId: newEventId(), requestId: id });
  if (result.ok) {
    const { assistance } = result.data;
    if (!assistance) return { message: ASSISTANCE_FAILED };
    return { code: assistance.code, expiresAt: formatClock(assistance.expiresAt) };
  }
  if (result.error.kind === "session") await endSession(requestPath(id));
  if (result.error.kind === "not-found" || result.error.kind === "access-expired") redirect(requestPath(id));
  reportShownError("acción: pedir ayuda", result.error.kind);
  if (result.error.kind === "conflict") redirect(requestPath(id, "cambio"));
  return { message: ASSISTANCE_FAILED };
}

export type ContinuityState = {
  message?: string;
  /** El código vive solo en esta respuesta: no viaja en la URL ni se guarda. */
  code?: string;
  /** Hora de vencimiento ya formateada en la zona de la rejilla. */
  expiresAt?: string;
  /** Tiempo que le queda al código al emitirlo, en palabras. */
  remaining?: string;
};

const CONTINUITY_FAILED = "No pudimos generar el código. Inténtalo de nuevo en unos segundos.";

function timeLeft(expiresAt: string): string {
  const seconds = Math.round((Date.parse(expiresAt) - Date.now()) / 1000);
  if (!Number.isFinite(seconds) || seconds < 60) return "en menos de un minuto";
  const minutes = Math.round(seconds / 60);
  return minutes === 1 ? "en un minuto" : `en unos ${minutes} minutos`;
}

/** «Continuar en otro canal»: pide un código de continuidad. Solo se ejecuta cuando el paciente pulsa el botón. */
export async function requestContinuityCode(_previous: ContinuityState, formData: FormData): Promise<ContinuityState> {
  const id = field(formData, "id");
  if (!isUuid(id)) redirect(PENDING_PATH);
  if (!(await hasSessionCookie())) redirect(signInUrl(requestPath(id)));
  requireSupport(requestCapabilities.continuityCodes, id);

  const wait = await hourlyWait("continuity-code", CONTINUITY_CODES_PER_HOUR, requestPath(id));
  if (wait > 0) {
    return { message: `Has generado demasiados códigos en la última hora. Podrás generar otro en ${waitText(wait)}.` };
  }

  const result = await requestNotifier.notify({ type: "continuity-requested", eventId: newEventId(), requestId: id });
  if (result.ok) {
    const { continuity } = result.data;
    if (!continuity) return { message: CONTINUITY_FAILED };
    return { code: continuity.code, expiresAt: formatClock(continuity.expiresAt), remaining: timeLeft(continuity.expiresAt) };
  }
  if (result.error.kind === "session") await endSession(requestPath(id));
  // La página responde «no encontrado» o explica que el trámite necesita un permiso nuevo.
  reportShownError("acción: generar código de continuidad", result.error.kind);
  if (result.error.kind === "not-found" || result.error.kind === "access-expired") redirect(requestPath(id));
  if (result.error.kind === "identity-unavailable") redirect(requestPath(id, "identidad"));
  return { message: CONTINUITY_FAILED };
}

export type RedeemState = { message?: string };

const CODE_MAX = 32;

// Un solo mensaje para el código mal escrito, desconocido, vencido, ya usado o emitido en este mismo canal.
const REDEEM_INVALID = "El código no es válido, venció o ya se usó. Pide uno nuevo en el canal donde está tu trámite.";
const REDEEM_BLOCKED = "Demasiados intentos. Espera unos minutos antes de probar otro código.";
const REDEEM_BUSY = "Hay demasiados canjes en este momento. Espera un minuto e inténtalo de nuevo.";
const REDEEM_UNCERTAIN =
  "No pudimos comprobar el código. Si el canje llegó a hacerse, ese código ya no sirve: pide otro en el canal donde está tu trámite.";

/** «Tengo un código de continuidad»: trae a este canal un trámite que está en otro. */
export async function redeemContinuityCode(_previous: RedeemState, formData: FormData): Promise<RedeemState> {
  if (!(await hasSessionCookie())) redirect(signInUrl(PENDING_PATH));
  if (!requestCapabilities.continuityCodes) redirect(PENDING_PATH);

  // El límite es por paciente, así que cubre todas sus sesiones.
  const profile = await generalData.getProfile();
  if (!profile.ok) {
    if (profile.error.kind === "session") await endSession(PENDING_PATH);
    return { message: REDEEM_UNCERTAIN };
  }
  const attempts = `continuity-redeem:${profile.data.accountId}`;
  if ((await attemptStore.take(attempts, CONTINUITY_REDEEM)) > 0) return { message: REDEEM_BLOCKED };

  const code = field(formData, "codigo");
  if (code.length > CODE_MAX) return { message: REDEEM_INVALID };

  const result = await requestNotifier.notify({ type: "continuity-redeemed", eventId: newEventId(), code });
  if (result.ok) {
    await attemptStore.refund(attempts);
    redirect(requestPath(result.data.requestId));
  }

  if (result.error.kind !== "session") reportShownError("acción: canjear código de continuidad", result.error.kind);
  switch (result.error.kind) {
    case "session":
      return endSession(PENDING_PATH);
    case "invalid":
    case "not-found":
      return { message: REDEEM_INVALID };
    case "rate-limited":
      // El límite que saltó es el del canal entero, no el de este paciente.
      await attemptStore.refund(attempts);
      return { message: REDEEM_BUSY };
    default:
      await attemptStore.refund(attempts);
      return { message: REDEEM_UNCERTAIN };
  }
}
