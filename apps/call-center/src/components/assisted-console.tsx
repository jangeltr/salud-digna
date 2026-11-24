"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CalendarDays, Clock3, Inbox, LogIn, UsersRound } from "lucide-react";
import { ApiError, errorMessage, transition, type Api, type JourneyEntry } from "./orchestrator";
import { confirmAppointment, isAccessError, isUncertain } from "./assisted-contract";
import { Brand, IntegrationNotice, Panel } from "./ui";
import { Timeline, type TimelineEvent } from "./timeline";

const sections = [
  { name: "Bandeja", icon: Inbox }, { name: "Pacientes", icon: UsersRound },
  { name: "Citas", icon: CalendarDays }, { name: "Historial", icon: Clock3 },
] as const;
const channels = { WEB: "Web", WHATSAPP: "WhatsApp", MOBILE: "App", CALL_CENTER: "Call Center" } as const;
const steps: Record<string, string> = {
  SELECT_STUDY: "Seleccionar estudio", SELECT_CLINIC: "Seleccionar clínica",
  SELECT_DATETIME: "Seleccionar fecha y hora", REVIEW: "Revisar y confirmar", CONFIRMED: "Cita confirmada",
};
type Grant = { requestId: string; expiresAt: string };
type Snapshot = {
  id: string; status: string; currentStep: string; lastChannel: string; version: number;
  patient: { firstName: string; lastName: string };
  study: { id: string; name: string } | null;
  clinic: { id: string; name: string } | null;
  context: { scheduledAt?: string; notes?: string };
  recentEvents: JourneyEntry[];
};
type Appointment = Awaited<ReturnType<typeof confirmAppointment>>;
const verified = "La API acreditó la confirmación de la cita.";
const uncertain = "El resultado de la confirmación sigue sin verificarse.";

function present(entry: JourneyEntry, requestId: string): TimelineEvent {
  return {
    id: entry.id, kind: "event", channel: channels[entry.channel as keyof typeof channels] ?? entry.channel,
    timestamp: entry.createdAt, timeLabel: new Date(entry.createdAt).toLocaleString("es-MX"),
    title: entry.type, description: [requestId, entry.actorRole, transition(entry)].filter(Boolean).join(" · "),
  };
}

export function AssistedConsole({ api, exit, reportOutcome }: { api: Api; exit: () => void; reportOutcome: (notice: string) => void }) {
  const [section, setSection] = useState<(typeof sections)[number]["name"]>("Bandeja");
  const [grant, setGrant] = useState<Grant | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [history, setHistory] = useState<JourneyEntry[]>([]);
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [pendingVersion, setPendingVersion] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [outcome, setOutcome] = useState("");
  const [contextIssue, setContextIssue] = useState("");
  const [historyIssue, setHistoryIssue] = useState("");
  const lock = useRef(false);
  const activeGrant = useRef<Grant | null>(null);

  function clearDetails() {
    setSnapshot(null);
    setHistory([]);
    setContextIssue("");
    setHistoryIssue("");
    setAppointment(null);
    setPendingVersion(null);
  }

  useEffect(() => {
    if (!grant) return;
    const timer = window.setTimeout(() => {
      if (activeGrant.current !== grant) return;
      activeGrant.current = null;
      setGrant(null);
      clearDetails();
      setMessage("El permiso de atención ha vencido.");
    }, Math.max(0, Date.parse(grant.expiresAt) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [grant]);

  function path(access: Grant) {
    return "call-center/requests/" + encodeURIComponent(access.requestId);
  }

  async function run(work: () => Promise<void>, loading: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage(loading);
    try {
      await work();
    } catch (error) {
      setMessage(errorMessage(error));
      if (isAccessError(error)) {
        activeGrant.current = null;
        setGrant(null);
        clearDetails();
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function read(access: Grant) {
    function revoke(error: unknown): never {
      if (activeGrant.current === access && isAccessError(error)) {
        activeGrant.current = null;
        setGrant(null);
        clearDetails();
        setMessage(errorMessage(error));
      }
      throw error;
    }

    const [detail, events] = await Promise.allSettled([
      api<Snapshot>(path(access)).catch(revoke),
      api<JourneyEntry[]>("requests/" + encodeURIComponent(access.requestId) + "/journey").catch(revoke),
    ]);
    if (activeGrant.current !== access || Date.parse(access.expiresAt) <= Date.now()) return;

    setSnapshot(detail.status === "fulfilled" ? detail.value : null);
    setContextIssue(detail.status === "rejected" ? "Contexto sin actualizar. " + errorMessage(detail.reason) : "");
    if (events.status === "fulfilled") {
      setHistory(events.value);
      setHistoryIssue("");
    } else {
      setHistory(detail.status === "fulfilled" ? detail.value.recentEvents : []);
      const scope = detail.status === "fulfilled" ? " Se muestran los eventos recientes del contexto." : "";
      setHistoryIssue("Historial completo sin actualizar. " + errorMessage(events.reason) + scope);
    }
    setMessage("");
  }

  function claim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || pendingVersion !== null) return;
    const form = event.currentTarget;
    const code = String(new FormData(form).get("code")).trim();
    form.reset();
    void run(async () => {
      let access: Grant;
      try {
        access = await api<Grant>("call-center/claim", { code });
      } catch (error) {
        if (!(error instanceof ApiError) || error.status >= 500) {
          setMessage("No se pudo comprobar el canje. Si la referencia quedó consumida, solicita una nueva.");
          return;
        }
        throw error;
      }
      clearDetails();
      setOutcome("");
      reportOutcome("");
      activeGrant.current = access;
      setGrant(access);
      setSection("Bandeja");
      await read(access);
    }, "Canjeando referencia…");
  }

  function refresh() {
    if (!grant) return;
    void run(async () => {
      await read(grant);
    }, "Cargando atención…");
  }

  function confirm() {
    if (!grant || !canConfirm || Date.parse(grant.expiresAt) <= Date.now()) return;
    const version = pendingVersion ?? snapshot?.version;
    if (version === undefined) return;
    void run(async () => {
      const wasPending = pendingVersion !== null;
      reportOutcome(uncertain);
      let result: Appointment;
      try {
        result = await confirmAppointment(api, grant.requestId, version);
      } catch (error) {
        if (isUncertain(error)) {
          setOutcome(uncertain);
          if (activeGrant.current === grant && Date.parse(grant.expiresAt) > Date.now()) {
            setPendingVersion(version);
            setMessage("Puedes reintentar con la misma versión mientras el permiso siga vigente.");
          }
          return;
        }
        if (!wasPending) {
          setOutcome("");
          reportOutcome("");
        }
        if (activeGrant.current !== grant) return;
        if (error instanceof ApiError && error.status === 409) {
          setPendingVersion(null);
          setSnapshot(null);
          setHistory([]);
          await read(grant);
          if (activeGrant.current === grant) setMessage(error.message);
          return;
        }
        throw error;
      }
      setOutcome(verified);
      reportOutcome(verified);
      if (activeGrant.current !== grant || Date.parse(grant.expiresAt) <= Date.now()) return;
      setPendingVersion(null);
      setAppointment(result);
      setSnapshot(null);
      setHistory([]);
      setContextIssue("");
      setHistoryIssue("");
      setMessage("Recuperando el contexto actualizado…");
      await read(grant);
    }, "Confirmación pendiente de respuesta del orquestador…");
  }

  const canConfirm = grant && !appointment &&
    (pendingVersion !== null || (snapshot?.status === "PENDING_CONFIRMATION" && snapshot.currentStep === "REVIEW"));

  return (
    <div className="console">
      <a className="skip-link" href="#contenido">Saltar al contenido</a>
      <aside className="sidebar">
        <div className="sidebar-brand"><Brand compact /><span>Call Center</span></div>
        <nav aria-label="Secciones de Call Center">{sections.map(({ name, icon: Icon }) => (
          <button className="nav-item" type="button" key={name} aria-current={section === name ? "page" : undefined} onClick={() => setSection(name)}>
            <Icon size={20} aria-hidden="true" /><span>{name}</span>
          </button>
        ))}</nav>
        <button type="button" className="back-link" onClick={exit}><LogIn size={18} aria-hidden="true" /> Cerrar sesión</button>
      </aside>
      <main id="contenido" className="workspace" tabIndex={-1}>
        <header className="workspace-header"><div><p className="eyebrow">Call Center</p><h1 aria-live="polite">{section}</h1></div></header>
        <p role="status">{[outcome, message].filter(Boolean).join(" ")}</p>
        <div className="workspace-grid">
          {section === "Bandeja" && <section className="column queue" aria-label="Bandeja">
            <Panel title="Atención autorizada">
              {grant ? <><p className="break-all">{grant.requestId}</p><p>Permiso hasta {new Date(grant.expiresAt).toLocaleTimeString("es-MX")}</p>
                <button type="button" disabled={busy} onClick={refresh}>Consultar atención</button></> : <p>Canjea una referencia en Pacientes.</p>}
              <IntegrationNotice>El listado de atenciones del asesor está pendiente de integración.</IntegrationNotice>
            </Panel>
          </section>}
          <section className="column main-column" aria-label={section}>
            {section === "Pacientes" && <Panel title="Recuperar atención por referencia">
              <form className="fields" onSubmit={claim}>
                <label>Referencia de atención<input name="code" type="text" pattern={"[A-Za-z0-9_\\-]{22}"} minLength={22} maxLength={22} required autoComplete="off" /></label>
                <button type="submit" disabled={busy || pendingVersion !== null}>Canjear referencia</button>
              </form>
              <IntegrationNotice>La referencia permite atender un trámite. La búsqueda por datos personales está pendiente de integración.</IntegrationNotice>
            </Panel>}
            {(section === "Bandeja" || section === "Historial") && <Panel title="Historial omnicanal">
              {historyIssue && <p role="status">{historyIssue}</p>}
              <Timeline state="empty" events={grant ? history.map((entry) => present(entry, grant.requestId)) : []} />
            </Panel>}
            {section === "Citas" && <Panel title="Cita de la atención">
              {appointment ? <p className="break-words">{appointment.id} · {appointment.status} · {new Date(appointment.scheduledAt).toLocaleString("es-MX")}</p> : <p>Sin cita devuelta por la operación de confirmación.</p>}
              <IntegrationNotice>Agenda y disponibilidad pendientes de integración.</IntegrationNotice>
            </Panel>}
          </section>
          <aside className="column context" aria-label="Contexto y acciones del asesor">
            <Panel title="Contexto del paciente">
              {contextIssue && <p role="status">{contextIssue}</p>}
              {snapshot ? <dl className="context-data">
                <div><dt>Paciente</dt><dd>{snapshot.patient.firstName} {snapshot.patient.lastName}</dd></div>
                <div><dt>Trámite</dt><dd className="break-all">{snapshot.id}</dd></div>
                <div><dt>Estado vigente</dt><dd>{snapshot.status}</dd></div>
                <div><dt>Paso actual</dt><dd>{steps[snapshot.currentStep] ?? snapshot.currentStep}</dd></div>
                <div><dt>Último canal</dt><dd>{channels[snapshot.lastChannel as keyof typeof channels] ?? snapshot.lastChannel}</dd></div>
                <div><dt>Estudio</dt><dd>{snapshot.study?.name ?? "Sin selección"}</dd></div>
                <div><dt>Clínica</dt><dd>{snapshot.clinic?.name ?? "Sin selección"}</dd></div>
                <div><dt>Fecha propuesta</dt><dd>{snapshot.context.scheduledAt ? new Date(snapshot.context.scheduledAt).toLocaleString("es-MX") : "Sin selección"}</dd></div>
                {snapshot.context.notes && <div><dt>Notas</dt><dd>{snapshot.context.notes}</dd></div>}
              </dl> : <p>Sin contexto disponible.</p>}
            </Panel>
            <Panel title="Acciones del asesor">
              <div className="action-list">
                <button type="button" disabled={busy || !canConfirm} onClick={confirm}>{pendingVersion === null ? "Confirmar cita" : "Reintentar confirmación"}</button>
                <button type="button" disabled>Verificar identidad</button>
                <button type="button" disabled>Actualizar solicitud</button>
                <button type="button" disabled>Agregar nota interna</button>
                <button type="button" disabled>Enviar mensaje</button>
              </div>
              <IntegrationNotice>Verificación, cambios de contexto, notas y mensajes pendientes de contratos para asesores.</IntegrationNotice>
            </Panel>
          </aside>
        </div>
      </main>
    </div>
  );
}
