import { Globe2, Headset, MessageCircle, Smartphone } from "lucide-react";
import { Empty, Panel, Pending } from "./ui";

const channels = {
  Web: Globe2,
  WhatsApp: MessageCircle,
  App: Smartphone,
  "Call Center": Headset,
};

export type JourneyEvent = {
  id: string;
  channel: string;
  dateTime: string;
  dateLabel: string;
  title: string;
  actorRole?: string;
  transition?: string;
};

export function ChannelLegend() {
  return <ul className="channels" aria-label="Canales">{Object.entries(channels).map(([channel, Icon]) => (
    <li key={channel}><Icon size={16} aria-hidden="true" />{channel}</li>
  ))}</ul>;
}

export function Journey({ events, requestId }: { events: readonly JourneyEvent[]; requestId?: string }) {
  return (
    <Panel title="Línea de tiempo de la solicitud">
      <ChannelLegend />
      {requestId ? <p className="break-all">Trámite {requestId}</p> : <fieldset disabled className="filters" aria-describedby="journey-status">
        <label>Identificador de solicitud<input /></label><button type="button">Consultar Journey</button>
      </fieldset>}
      {!requestId && <Pending id="journey-status">Consulta administrativa pendiente de integración.</Pending>}
      {events.length === 0 ? <Empty>Sin solicitud seleccionada.</Empty> : (
        <ol className="event-list">{events.map((event) => {
          const Icon = channels[event.channel as keyof typeof channels] ?? Globe2;
          return <li key={event.id}><Icon size={20} aria-hidden="true" /><div><h3>{event.title}</h3>
            <p>{event.channel}{event.actorRole && ` · ${event.actorRole}`}</p>
            {event.transition && <p>{event.transition}</p>}
            <time dateTime={event.dateTime}>{event.dateLabel}</time>
          </div></li>;
        })}</ol>
      )}
    </Panel>
  );
}
