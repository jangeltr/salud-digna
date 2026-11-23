"use client";

import { useState } from "react";
import { CalendarDays, Clock3, Inbox, LogIn, Search, UserRound, UsersRound } from "lucide-react";
import { ActionDialog, actions, AppointmentFields, PendingFields, type Action } from "./actions";
import { Brand, DataState, displayStates, IntegrationNotice, Panel, Status, type DisplayState } from "./ui";
import { Timeline } from "./timeline";

const sections = [
  { name: "Bandeja", icon: Inbox },
  { name: "Pacientes", icon: UsersRound },
  { name: "Citas", icon: CalendarDays },
  { name: "Historial", icon: Clock3 },
] as const;
type Section = (typeof sections)[number]["name"];

function Queue({ state }: { state: DisplayState }) {
  return (
    <Panel title="Solicitudes">
      <PendingFields noticeId="queue-status">
        <label>Disponibilidad del asesor<select><option>Sin sesión de asesor</option></select></label>
        <label>Estado<select><option>Todos los estados</option></select></label>
        <label>Canal<select><option>Todos los canales</option></select></label>
      </PendingFields>
      <IntegrationNotice id="queue-status">Cola y filtros pendientes de integración.</IntegrationNotice>
      <DataState state={state} icon={Inbox} title="Sin solicitudes para mostrar">
        Las solicitudes se mostrarán cuando se conecte la bandeja.
      </DataState>
    </Panel>
  );
}

function Patients({ state }: { state: DisplayState }) {
  return (
    <>
      <Panel title="Buscar paciente">
        <PendingFields noticeId="search-status">
          <div className="field-row">
            <label>Buscar por
              <select defaultValue="name">
                <option value="name">Nombre</option>
                <option value="phone">Teléfono</option>
                <option value="email">Correo</option>
                <option value="folio">Folio</option>
              </select>
            </label>
            <label>Dato de búsqueda<input type="search" /></label>
          </div>
          <button type="button"><Search size={16} aria-hidden="true" /> Buscar</button>
        </PendingFields>
        <IntegrationNotice id="search-status">Búsqueda pendiente de integración.</IntegrationNotice>
      </Panel>
      <Panel title="Posibles coincidencias">
        <DataState state={state} icon={UsersRound} title="Sin coincidencias para mostrar">
          Los resultados aparecerán después de una búsqueda.
        </DataState>
      </Panel>
    </>
  );
}

function Appointments({ state, review }: { state: DisplayState; review: () => void }) {
  return (
    <>
      <Panel title="Programar cita">
        <PendingFields noticeId="appointment-status"><AppointmentFields /></PendingFields>
        <IntegrationNotice id="appointment-status">Disponibilidad y reservas pendientes de integración.</IntegrationNotice>
        <button type="button" aria-haspopup="dialog" onClick={review}>Ver formulario de confirmación</button>
      </Panel>
      <Panel title="Agenda">
        <DataState state={state} icon={CalendarDays} title="Sin citas para mostrar">
          La agenda estará disponible con la integración.
        </DataState>
      </Panel>
    </>
  );
}

function PatientContext() {
  return (
    <Panel title="Contexto del paciente">
      <div className="profile">
        <span className="empty-icon"><UserRound size={21} aria-hidden="true" /></span>
        <p>Ningún paciente seleccionado</p>
      </div>
      <dl className="context-data">
        <div><dt>Solicitudes abiertas</dt><dd>Sin información disponible</dd></div>
        <div><dt>Citas</dt><dd>Sin información disponible</dd></div>
        <div><dt>Estudios previos</dt><dd>Sin información disponible</dd></div>
        <div><dt>Último canal</dt><dd>Sin información disponible</dd></div>
      </dl>
    </Panel>
  );
}

export function Console() {
  const [section, setSection] = useState<Section>("Bandeja");
  const [state, setState] = useState<DisplayState>("empty");
  const [action, setAction] = useState<Action | null>(null);

  return (
    <div className="console">
      <a className="skip-link" href="#contenido">Saltar al contenido</a>
      <aside className="sidebar">
        <div className="sidebar-brand"><Brand compact /><span>Call Center</span></div>
        <nav aria-label="Secciones de Call Center">
          {sections.map(({ name, icon: Icon }) => (
            <button type="button" className="nav-item" key={name}
              aria-current={section === name ? "page" : undefined}
              onClick={() => setSection(name)}>
              <Icon size={20} aria-hidden="true" /><span>{name}</span>
            </button>
          ))}
        </nav>
        <a className="back-link" href="/"><LogIn size={18} aria-hidden="true" /> Acceso</a>
      </aside>
      <main id="contenido" tabIndex={-1} className="workspace">
        <header className="workspace-header">
          <div><p className="eyebrow">Call Center</p><h1 aria-live="polite">{section}</h1></div>
          <div className="preview-tools">
            <Status>Vista de desarrollo</Status>
            <label>Estado de vista
              <select value={state} onChange={(event) => setState(event.target.value as DisplayState)}>
                {Object.entries(displayStates).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>
        </header>
        <div className="workspace-grid">
          {section === "Bandeja" && (
            <section className="column queue" aria-label="Bandeja de solicitudes" tabIndex={0}><Queue state={state} /></section>
          )}
          <section className="column main-column" aria-label={section === "Bandeja" ? "Historial omnicanal" : section} tabIndex={0}>
            {section === "Pacientes" && <Patients state={state} />}
            {section === "Citas" && <Appointments state={state} review={() => setAction("appointment")} />}
            {(section === "Bandeja" || section === "Historial") && (
              <Panel title="Historial omnicanal"><Timeline events={[]} state={state} /></Panel>
            )}
          </section>
          <aside className="column context" aria-label="Contexto y acciones del asesor" tabIndex={0}>
            <PatientContext />
            <Panel title="Acciones del asesor">
              <div className="action-list">
                {(Object.keys(actions) as Action[]).map((key) => {
                  const { title, icon: Icon } = actions[key];
                  return <button type="button" key={key} aria-haspopup="dialog" onClick={() => setAction(key)}>
                    <Icon size={17} aria-hidden="true" />{title}
                  </button>;
                })}
              </div>
              <IntegrationNotice>Formularios de diseño. Las operaciones están pendientes de integración.</IntegrationNotice>
            </Panel>
          </aside>
        </div>
      </main>
      {action && <ActionDialog action={action} close={() => setAction(null)} />}
    </div>
  );
}
