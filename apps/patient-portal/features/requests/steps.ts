import type { Channel, RequestSnapshot, RequestStep } from "@/lib/api/requests";

/** Dato ya elegido que el paciente puede cambiar. Es el valor del parámetro `cambiar`. */
export type Editable = "estudio" | "clinica" | "horario";

export type StepInfo = { step: RequestStep; label: string; editable?: Editable };

/** Pasos del trámite en el orden que calcula la API. */
export const STEPS: StepInfo[] = [
  { step: "SELECT_STUDY", label: "Estudio", editable: "estudio" },
  { step: "SELECT_CLINIC", label: "Clínica", editable: "clinica" },
  { step: "SELECT_DATETIME", label: "Fecha y hora", editable: "horario" },
  { step: "REVIEW", label: "Revisión" },
];

export function stepLabel(step: RequestStep): string {
  if (step === "CONFIRMED") return "Cita confirmada";
  return STEPS.find((item) => item.step === step)?.label ?? step;
}

/** DRAFT, IN_PROGRESS y PENDING_CONFIRMATION admiten cambios. COMPLETED y CANCELLED están cerrados. */
export function isOpen(request: RequestSnapshot): boolean {
  return request.status === "DRAFT" || request.status === "IN_PROGRESS" || request.status === "PENDING_CONFIRMATION";
}

/**
 * Qué dato ya elegido se puede cambiar. La API no permite vaciar estudio ni clínica,
 * así que volver a un paso anterior significa elegir otro valor para ese dato.
 */
export function readEditable(value: string | string[] | undefined, request: RequestSnapshot): Editable | undefined {
  if (!isOpen(request)) return undefined;
  const { studyId, clinicId, scheduledAt } = request.context;
  if (value === "estudio" && studyId) return "estudio";
  if (value === "clinica" && clinicId) return "clinica";
  if (value === "horario" && scheduledAt) return "horario";
  return undefined;
}

// Canales que el portal sabe nombrar. Cualquier otro valor se muestra como «otro canal».
const CHANNEL_NAMES: Partial<Record<Channel, string>> = {
  WEB: "la web",
  WHATSAPP: "WhatsApp",
  CALL_CENTER: "Call Center",
};

export function channelName(channel: Channel): string {
  return CHANNEL_NAMES[channel] ?? "otro canal";
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
export function continuityNotice(request: RequestSnapshot, now: Date = new Date()): string | undefined {
  if (!isOpen(request)) return undefined;
  const age = now.getTime() - Date.parse(request.updatedAt);
  if (request.lastChannel === "WEB" && age < RECENT_MS) return undefined;
  return `Dejaste este trámite en ${channelName(request.lastChannel)} ${timeAgo(request.updatedAt, now)}.`;
}

/** Avisos que una acción deja tras redirigir. Solo se aceptan estas claves. */
const NOTICES = {
  cambio: { tone: "warning", text: "Tu trámite cambió desde otro canal. Revisa el estado actual y vuelve a confirmar lo que querías hacer." },
  invalido: { tone: "danger", text: "No pudimos guardar ese cambio. Revisa la selección e inténtalo de nuevo." },
  servicio: { tone: "danger", text: "El servicio no respondió. Tu trámite sigue guardado: revisa su estado e inténtalo de nuevo." },
  estudio: { tone: "warning", text: "No pudimos añadir el estudio elegido. Selecciónalo de nuevo en la lista." },
  nota: { tone: "success", text: "Nota guardada." },
  guardado: { tone: "success", text: "Tu trámite quedó guardado. Puedes continuarlo cuando quieras." },
} as const;

export type Notice = (typeof NOTICES)[keyof typeof NOTICES];

export function readNotice(value: string | string[] | undefined): Notice | undefined {
  return typeof value === "string" && Object.hasOwn(NOTICES, value) ? NOTICES[value as keyof typeof NOTICES] : undefined;
}
