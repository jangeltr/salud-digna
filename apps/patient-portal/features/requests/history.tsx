import type { HistoryEntry } from "@/lib/domain/model";
import { formatDateTime } from "./schedule";
import { channelName, statusName, stepLabel } from "./steps";

const KIND_NAMES: Record<HistoryEntry["kind"], string> = {
  created: "Trámite creado",
  "selections-updated": "Selección actualizada",
  paused: "Trámite pausado",
  resumed: "Trámite reanudado",
  "channel-switched": "Cambio de canal",
  "status-changed": "Cambio de estado",
  "appointment-confirmed": "Cita confirmada",
  other: "Otro evento",
};

/** Tipo del evento en español. Los cambios de estado más comunes tienen nombre propio. */
function eventName(entry: HistoryEntry): string {
  if (entry.kind === "status-changed") {
    if (entry.to === "pending-confirmation") return "Enviado a confirmación";
    if (entry.to === "cancelled") return "Trámite cancelado";
  }
  return KIND_NAMES[entry.kind] ?? KIND_NAMES.other;
}

function eventDetail(entry: HistoryEntry): string | undefined {
  if (entry.kind === "selections-updated" && entry.step) return `Siguiente paso: ${stepLabel(entry.step)}.`;
  if (entry.kind === "status-changed" && entry.from && entry.to) {
    return `De «${statusName(entry.from)}» a «${statusName(entry.to)}».`;
  }
  return undefined;
}

/** Canal que produjo el evento. Si el portal no sabe nombrarlo, muestra el código que usa el servicio. */
function producer(entry: HistoryEntry): string {
  if (entry.channel !== "other") return `En ${channelName(entry.channel)}`;
  return entry.channelCode ? `En el canal ${entry.channelCode}` : "En otro canal";
}

/** Línea de tiempo del trámite, del evento más antiguo al más reciente. */
export function Timeline({ entries }: { entries: HistoryEntry[] }) {
  return (
    <ol className="mt-6 grid gap-3">
      {entries.map((entry) => {
        const detail = eventDetail(entry);
        return (
          <li key={entry.id} className="rounded-lg border border-line bg-canvas p-4">
            <p className="font-semibold">{eventName(entry)}</p>
            {detail ? <p className="mt-1 text-sm">{detail}</p> : null}
            <p className="mt-1 text-sm text-muted">
              {producer(entry)} · <time dateTime={entry.occurredAt}>{formatDateTime(entry.occurredAt)}</time>
            </p>
          </li>
        );
      })}
    </ol>
  );
}
