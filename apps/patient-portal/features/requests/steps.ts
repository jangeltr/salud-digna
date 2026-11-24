import type { BookingRequest, Channel, RequestStatus, RequestStep } from "@/lib/domain/model";
import type { RequestCapabilities } from "@/lib/domain/ports";

/** Dato ya elegido que el paciente puede cambiar. Es el valor del parámetro `cambiar`. */
export type Editable = "estudio" | "clinica" | "horario";

export type StepInfo = { step: RequestStep; label: string; editable?: Editable };

/** Pasos del trámite en el orden que calcula el servicio. */
export const STEPS: StepInfo[] = [
  { step: "study", label: "Estudio", editable: "estudio" },
  { step: "clinic", label: "Clínica", editable: "clinica" },
  { step: "datetime", label: "Fecha y hora", editable: "horario" },
  { step: "review", label: "Revisión" },
];

/** Pasos que muestra el portal. Sin horario, el flujo es estudio, clínica y revisión. */
export function flowSteps(capabilities: RequestCapabilities): StepInfo[] {
  return capabilities.slot ? STEPS : STEPS.filter((item) => item.step !== "datetime");
}

const STATUS_NAMES: Record<RequestStatus, string> = {
  draft: "Borrador",
  "in-progress": "En curso",
  "pending-confirmation": "Pendiente de confirmación",
  completed: "Completado",
  cancelled: "Cancelado",
};

export function statusName(status: RequestStatus): string {
  return STATUS_NAMES[status] ?? status;
}

export function stepLabel(step: RequestStep): string {
  if (step === "confirmed") return "Cita confirmada";
  return STEPS.find((item) => item.step === step)?.label ?? step;
}

/** Los tres primeros estados admiten cambios. `completed` y `cancelled` están cerrados. */
export function isOpen(request: BookingRequest): boolean {
  return request.status === "draft" || request.status === "in-progress" || request.status === "pending-confirmation";
}

/**
 * Qué dato ya elegido se puede cambiar. El estudio y la clínica no se pueden vaciar,
 * así que volver a un paso anterior significa elegir otro valor para ese dato.
 */
export function readEditable(value: string | string[] | undefined, request: BookingRequest): Editable | undefined {
  if (!isOpen(request)) return undefined;
  const { studyId, clinicId, scheduledAt } = request.selections;
  if (value === "estudio" && studyId) return "estudio";
  if (value === "clinica" && clinicId) return "clinica";
  if (value === "horario" && scheduledAt) return "horario";
  return undefined;
}

const CHANNEL_NAMES: Record<Channel, string> = {
  web: "la web",
  whatsapp: "WhatsApp",
  "call-center": "Call Center",
  other: "otro canal",
};

export function channelName(channel: Channel): string {
  return CHANNEL_NAMES[channel] ?? "otro canal";
}

/** «Última actividad…». Sin canal conocido solo se indica el tiempo transcurrido. */
export function lastActivity(request: BookingRequest, now: Date = new Date()): string {
  const when = timeAgo(request.lastActivityAt, now);
  return request.lastChannel ? `Última actividad en ${channelName(request.lastChannel)}, ${when}.` : `Última actividad ${when}.`;
}

const relative = new Intl.RelativeTimeFormat("es", { numeric: "always" });

/** Tiempo transcurrido en lenguaje natural: "hace 2 horas". */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 1000));
  if (!Number.isFinite(seconds) || seconds < 60) return "hace un momento";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return relative.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return relative.format(-hours, "hour");
  return relative.format(-Math.round(hours / 24), "day");
}

const RECENT_MS = 5 * 60 * 1000;

/**
 * Aviso de continuidad. Se muestra cuando la última actividad fue en otro canal
 * o cuando el paciente vuelve a un trámite que dejó hace un rato.
 */
export function continuityNotice(request: BookingRequest, now: Date = new Date()): string | undefined {
  if (!isOpen(request)) return undefined;
  const age = now.getTime() - Date.parse(request.lastActivityAt);
  // Sin canal conocido solo cuenta el tiempo transcurrido.
  if (!request.lastChannel) {
    return age < RECENT_MS ? undefined : `Dejaste este trámite ${timeAgo(request.lastActivityAt, now)}.`;
  }
  if (request.lastChannel === "web" && age < RECENT_MS) return undefined;
  return `Dejaste este trámite en ${channelName(request.lastChannel)} ${timeAgo(request.lastActivityAt, now)}.`;
}

/** Avisos que una acción deja tras redirigir. Solo se aceptan estas claves. */
const NOTICES = {
  cambio: { tone: "warning", text: "Tu trámite cambió desde otro canal. Revisa el estado actual y vuelve a confirmar lo que querías hacer." },
  invalido: { tone: "danger", text: "No pudimos guardar ese cambio. Revisa la selección e inténtalo de nuevo." },
  servicio: { tone: "danger", text: "El servicio no respondió. Tu trámite sigue guardado: revisa su estado e inténtalo de nuevo." },
  estudio: { tone: "warning", text: "No pudimos añadir el estudio elegido. Selecciónalo de nuevo en la lista." },
  nota: { tone: "success", text: "Nota guardada." },
  guardado: { tone: "success", text: "Tu trámite quedó guardado. Puedes continuarlo cuando quieras." },
  enviado: { tone: "success", text: "Tu trámite se envió a confirmación." },
  cancelado: { tone: "success", text: "Trámite cancelado." },
} as const;

export type Notice = (typeof NOTICES)[keyof typeof NOTICES];

export function readNotice(value: string | string[] | undefined): Notice | undefined {
  return typeof value === "string" && Object.hasOwn(NOTICES, value) ? NOTICES[value as keyof typeof NOTICES] : undefined;
}
