import { SCHEDULE } from "./schedule.config";

export type Slot = {
  /** ISO 8601 con segundos y zona explícita, como pide el contrato: 2026-11-24T08:00:00-06:00. */
  value: string;
  /** Hora local de la rejilla, por ejemplo "08:00". */
  time: string;
};

export type Day = {
  /** Fecha local en la zona de la rejilla: AAAA-MM-DD. */
  date: string;
  label: string;
  slots: Slot[];
};

const { timeZone } = SCHEDULE;

const dateParts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
const offsetParts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" });
const dayLabel = new Intl.DateTimeFormat("es-MX", { timeZone, weekday: "short", day: "numeric", month: "short" });
const fullDateTime = new Intl.DateTimeFormat("es-MX", {
  timeZone,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const clock = new Intl.DateTimeFormat("es-MX", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Desfase de la zona en un instante, con el formato del contrato: "-06:00". */
function offsetAt(instant: Date): string {
  const name = offsetParts.formatToParts(instant).find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const offset = name.replace("GMT", "");
  return offset === "" ? "+00:00" : offset;
}

/** Convierte una fecha y hora locales de la rejilla en ISO 8601 con su desfase. */
function toIso(date: string, time: string): string {
  // Dos pasadas: el desfase puede cambiar entre el momento actual y el del horario.
  let offset = offsetAt(new Date(`${date}T${time}:00Z`));
  offset = offsetAt(new Date(`${date}T${time}:00${offset}`));
  return `${date}T${time}:00${offset}`;
}

function addDays(date: string, days: number): string {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

/** Días de la rejilla con sus horarios futuros. Un día sin horarios futuros se omite. */
export function listDays(now: Date = new Date()): Day[] {
  const today = dateParts.format(now);
  const opens = toMinutes(SCHEDULE.opensAt);
  const closes = toMinutes(SCHEDULE.closesAt);
  const days: Day[] = [];

  for (let index = 0; index < SCHEDULE.days; index++) {
    const date = addDays(today, index);
    const slots: Slot[] = [];
    for (let minutes = opens; minutes < closes; minutes += SCHEDULE.stepMinutes) {
      const time = `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
      const value = toIso(date, time);
      if (Date.parse(value) > now.getTime()) slots.push({ value, time });
    }
    if (slots.length > 0) {
      days.push({ date, label: dayLabel.format(new Date(`${date}T12:00:00Z`)), slots });
    }
  }

  return days;
}

/** Comprueba en el servidor que el horario enviado pertenece a la rejilla y sigue siendo futuro. */
export function isOfferedSlot(value: string, now: Date = new Date()): boolean {
  return listDays(now).some((day) => day.slots.some((slot) => slot.value === value));
}

/** Fecha y hora de una cita en la zona de la rejilla. La API la devuelve en UTC. */
export function formatDateTime(iso: string): string {
  const instant = new Date(iso);
  return Number.isNaN(instant.getTime()) ? iso : fullDateTime.format(instant);
}

export function formatClock(iso: string): string {
  const instant = new Date(iso);
  return Number.isNaN(instant.getTime()) ? iso : clock.format(instant);
}
