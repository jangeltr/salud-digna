import { Clock3, Globe2, Headset, MessageCircle, NotebookPen, Phone, Smartphone } from "lucide-react";
import { DataState, type DisplayState } from "./ui";

const channelIcons = {
  Web: Globe2,
  WhatsApp: MessageCircle,
  App: Smartphone,
  "Call Center": Headset,
};

// Modelo de presentación. La integración adaptará el contrato real a esta vista.
export type TimelineEvent = {
  id: string;
  channel: keyof typeof channelIcons;
  timestamp: string;
  timeLabel: string;
  title: string;
  description?: string;
} & ({ kind: "event" | "call" | "note" } | { kind: "message"; direction: "incoming" | "outgoing" });

function TimelineItem({ event }: { event: TimelineEvent }) {
  const Icon = event.kind === "note" ? NotebookPen : event.kind === "call" ? Phone : channelIcons[event.channel];
  const labels = { event: "Evento", call: "Llamada", note: "Nota interna", message: "Mensaje" };
  const label = event.kind === "message"
    ? (event.direction === "incoming" ? "Mensaje entrante" : "Mensaje saliente")
    : labels[event.kind];

  return (
    <li className="event" data-kind={event.kind}>
      <span className="empty-icon"><Icon size={18} aria-hidden="true" /></span>
      <article>
        <p className="secondary">{label} · {event.channel} · <time dateTime={event.timestamp}>{event.timeLabel}</time></p>
        <h3>{event.title}</h3>
        {event.description && <p className="event-description">{event.description}</p>}
      </article>
    </li>
  );
}

export function Timeline({ events, state }: { events: readonly TimelineEvent[]; state: DisplayState }) {
  return (
    <>
      <ul className="channels" aria-label="Canales del historial">
        {Object.entries(channelIcons).map(([channel, Icon]) => (
          <li key={channel}><Icon size={15} aria-hidden="true" />{channel}</li>
        ))}
      </ul>
      {state !== "empty" || events.length === 0 ? (
        <div className="timeline">
          <DataState state={state} icon={Clock3} title="Sin interacciones para mostrar">
            El historial del paciente aparecerá al abrir una solicitud vinculada.
          </DataState>
        </div>
      ) : (
        <ol className="event-list" aria-label="Interacciones">
          {events.map((event) => <TimelineItem key={event.id} event={event} />)}
        </ol>
      )}
    </>
  );
}
