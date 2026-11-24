"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Activity, ClipboardList, ListChecks } from "lucide-react";
import { errorMessage, transition, type Api, type JourneyEntry } from "./orchestrator";
import { Empty, Panel, Pending } from "./ui";
import { Journey } from "./journey";

const statuses = {
  DRAFT: "Borrador", IN_PROGRESS: "En curso", PENDING_CONFIRMATION: "Pendiente de confirmación",
  COMPLETED: "Completado", CANCELLED: "Cancelado",
};
const channels = { WEB: "Web", WHATSAPP: "WhatsApp", MOBILE: "App", CALL_CENTER: "Call Center" } as const;
const uuidPattern = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

type Overview = { requestsCreated: number; openRequests: number; completedRequests: number };
export type RequestRow = {
  id: string; status: keyof typeof statuses; currentStep: string; lastChannel: keyof typeof channels;
  createdAt: string; updatedAt: string;
};
type RequestPage = { items: RequestRow[]; page: number; limit: number; hasMore: boolean };

export function LiveDashboard({ api, openSupervision }: { api: Api; openSupervision: () => void }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [message, setMessage] = useState("Cargando indicadores…");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    void api<Overview>("admin/overview").then((value) => {
      if (!current) return;
      setOverview(value);
      setMessage("");
    }, (error) => { if (current) setMessage(errorMessage(error)); });
    return () => { current = false; };
  }, [api, attempt]);

  return <>
    <p role="status">{message}</p>
    {overview ? <ul className="metrics" aria-label="Indicadores operativos">
      {([
        ["Trámites registrados", overview.requestsCreated, ClipboardList],
        ["Trámites pendientes", overview.openRequests, Activity],
        ["Trámites completados", overview.completedRequests, ListChecks],
      ] as const).map(([label, value, Icon]) => <li className="metric" key={label}>
        <Icon size={19} aria-hidden="true" /><h2>{label}</h2><p>{value}</p>
      </li>)}
    </ul> : <button type="button" disabled={!message || message === "Cargando indicadores…"} onClick={() => {
      setMessage("Cargando indicadores…"); setAttempt((value) => value + 1);
    }}>Reintentar consulta</button>}
    <Panel title="Supervisión de trámites">
      <button type="button" className="text-button" onClick={openSupervision}>Abrir supervisión</button>
      <Pending>Los conteos de canales participantes y eventos procesados están pendientes de contrato.</Pending>
    </Panel>
  </>;
}

function date(value: string) {
  return <time dateTime={value}>{new Date(value).toLocaleString("es-MX")}</time>;
}

export function LiveSupervision({ api, openJourney }: { api: Api; openJourney: (row: RequestRow) => void }) {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<RequestPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let current = true;
    const query = new URLSearchParams({ page: String(page) });
    if (status) query.set("status", status);
    void api<RequestPage>("admin/requests?" + query).then((value) => {
      if (current) { setResult(value); setLoading(false); }
    }, (error) => {
      if (current) { setMessage(errorMessage(error)); setLoading(false); }
    });
    return () => { current = false; };
  }, [api, status, page, attempt]);

  function load(nextPage: number, nextStatus: string) {
    setLoading(true);
    setMessage("");
    setResult(null);
    setPage(nextPage);
    setStatus(nextStatus);
    setAttempt((value) => value + 1);
  }

  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    load(1, String(new FormData(event.currentTarget).get("status")));
  }

  return <Panel title="Solicitudes">
    <form className="filters" onSubmit={filter}>
      <label>Estado<select name="status" defaultValue={status}><option value="">Todos los estados</option>
        {Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <button type="submit" disabled={loading}>Aplicar filtro</button>
    </form>
    <p role="status">{loading ? "Cargando solicitudes…" : message}</p>
    {message && <button type="button" onClick={() => load(page, status)}>Reintentar consulta</button>}
    {result && <>
      {result.items.length ? <div className="table-scroll" role="region" aria-label="Solicitudes operativas" tabIndex={0}>
        <table><thead><tr>{["Trámite", "Estado", "Paso actual", "Último canal", "Creación", "Última actividad"].map((label) =>
          <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{result.items.map((row) => <tr key={row.id}>
            <td><button type="button" onClick={() => openJourney(row)} aria-label={"Ver detalle del trámite " + row.id}>{row.id}</button></td>
            <td>{statuses[row.status] ?? row.status}</td><td>{row.currentStep}</td><td>{channels[row.lastChannel] ?? row.lastChannel}</td>
            <td>{date(row.createdAt)}</td><td>{date(row.updatedAt)}</td>
          </tr>)}</tbody>
        </table>
      </div> : <Empty>Sin trámites para este filtro.</Empty>}
      <div className="form-preview" aria-label="Paginación">
        <button type="button" disabled={page === 1} onClick={() => load(page - 1, status)}>Anterior</button>
        <span>Página {result.page}</span>
        <button type="button" disabled={!result.hasMore} onClick={() => load(page + 1, status)}>Siguiente</button>
      </div>
    </>}
  </Panel>;
}

export function RequestJourney({ api, selected, center }: { api: Api; selected?: RequestRow; center?: boolean }) {
  const [input, setInput] = useState(selected?.id ?? "");
  const [record, setRecord] = useState<{ id: string; events: JourneyEntry[] } | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const lock = useRef(false);

  async function read(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setLoading(true);
    setMessage("Cargando eventos…");
    setRecord(null);
    const id = input.trim();
    try {
      const events = await api<JourneyEntry[]>("admin/requests/" + encodeURIComponent(id) + "/journey");
      setRecord({ id, events });
      setMessage(events.length ? "" : "El trámite no tiene eventos visibles.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      lock.current = false;
      setLoading(false);
    }
  }

  return <>
    <Panel title={center ? "Eventos por trámite" : "Consultar recorrido"}>
      {selected && input === selected.id && <dl className="role-list">
        <div><dt>Estado del listado</dt><dd>{statuses[selected.status] ?? selected.status}</dd></div>
        <div><dt>Paso actual</dt><dd>{selected.currentStep}</dd></div>
        <div><dt>Último canal</dt><dd>{channels[selected.lastChannel] ?? selected.lastChannel}</dd></div>
        <div><dt>Última actividad</dt><dd>{date(selected.updatedAt)}</dd></div>
      </dl>}
      <form className="filters" onSubmit={read}>
        <label>Identificador de trámite<input required pattern={uuidPattern} value={input}
          onChange={(event) => setInput(event.target.value)} disabled={loading} /></label>
        <button type="submit" disabled={loading}>Consultar eventos</button>
      </form>
      <p role="status">{message}</p>
      {center && <Pending>La ingesta global, el estado de procesamiento, los errores y los reintentos están pendientes de contrato.</Pending>}
    </Panel>
    {record && record.events.length > 0 && <Journey requestId={record.id} events={record.events.map((entry) => ({
      id: entry.id, channel: channels[entry.channel as keyof typeof channels] ?? entry.channel,
      dateTime: entry.createdAt, dateLabel: new Date(entry.createdAt).toLocaleString("es-MX"),
      title: entry.type, actorRole: entry.actorRole ?? undefined, transition: transition(entry),
    }))} />}
  </>;
}
