"use client";

import { useState } from "react";
import { Activity, Building2, CalendarDays, ClipboardList, FlaskConical, LayoutDashboard, ListChecks, LogIn, Network, Route, ShieldCheck, UsersRound } from "lucide-react";
import { Brand, Empty, EmptyTable, Panel, Pending } from "./ui";
import { ChannelLegend, Journey } from "./journey";
import { registries, Registry } from "./registry";
import { LiveDashboard, LiveSupervision, RequestJourney, type RequestRow } from "./live-monitoring";
import { OmnichannelPanel, type OmnichannelApi } from "./omnichannel-panel";
import type { Api } from "./orchestrator";

const operations = [
  { name: "Dashboard", icon: LayoutDashboard },
  { name: "Supervisión", icon: ClipboardList },
  { name: "Patient Journey", icon: Route },
  { name: "Recorrido API general", icon: Route },
  { name: "Centro de Orquestación", icon: Activity },
  { name: "Integraciones", icon: Network },
  { name: "Auditoría", icon: ListChecks },
] as const;

const management = [
  { name: "Usuarios", icon: UsersRound },
  { name: "Roles y permisos", icon: ShieldCheck },
  { name: "Estudios", icon: FlaskConical },
  { name: "Clínicas", icon: Building2 },
] as const;

type Section = (typeof operations | typeof management)[number]["name"];

function Dashboard({ openSupervision }: { openSupervision: () => void }) {
  const metrics = [
    { label: "Pacientes", icon: UsersRound },
    { label: "Solicitudes creadas", icon: ClipboardList },
    { label: "Solicitudes abiertas", icon: Activity },
    { label: "Solicitudes completadas", icon: ListChecks },
    { label: "Citas confirmadas", icon: CalendarDays },
  ];

  return (
    <>
      <section aria-label="Indicadores operativos">
        <ul className="metrics">{metrics.map(({ label, icon: Icon }) => (
          <li className="metric" key={label}><Icon size={19} aria-hidden="true" /><h2>{label}</h2><p>Sin datos</p></li>
        ))}</ul>
      </section>
      <div className="overview-grid">
        <Panel title="Solicitudes">
          <Empty>Sin solicitudes para mostrar.</Empty>
          <button type="button" className="text-button" onClick={openSupervision}>Abrir supervisión</button>
        </Panel>
        <Panel title="Distribución por canal">
          <ChannelLegend />
          <Empty>Distribución pendiente de integración.</Empty>
        </Panel>
      </div>
      <Panel title="Citas">
        <Empty>Sin información de citas para mostrar.</Empty>
      </Panel>
    </>
  );
}

function Supervision({ openJourney }: { openJourney: () => void }) {
  return (
    <Panel title="Solicitudes">
      <fieldset disabled className="filters" aria-describedby="supervision-status">
        <label>Estado<select><option>Todos los estados</option><option>Borrador</option><option>En curso</option><option>Pendiente de confirmación</option><option>Completada</option><option>Cancelada</option></select></label>
        <button type="button">Aplicar filtro</button>
      </fieldset>
      <Pending id="supervision-status">Listado y filtros pendientes de integración.</Pending>
      <EmptyTable title="Solicitudes operativas" columns={["Solicitud", "Estado", "Paso actual", "Último canal", "Creación", "Actualización"]}>
        Sin solicitudes para mostrar.
      </EmptyTable>
      <div className="form-preview">
        <button type="button" onClick={openJourney}>Ver Patient Journey</button>
      </div>
    </Panel>
  );
}

function Roles() {
  return (
    <>
      <Panel title="Roles documentados">
        <dl className="role-list">
          <div><dt>Administrador <code>ADMIN</code></dt><dd>Supervisa el sistema y administra los catálogos.</dd></div>
          <div><dt>Asesor <code>ADVISOR</code></dt><dd>Atiende solicitudes con autorización temporal.</dd></div>
          <div><dt>Paciente <code>PATIENT</code></dt><dd>Gestiona sus propias solicitudes.</dd></div>
        </dl>
      </Panel>
      <Panel title="Gestión de permisos">
        <fieldset disabled className="filters" aria-describedby="roles-status">
          <label>Rol<select><option>Seleccionar rol</option></select></label>
          <button type="button">Editar permisos</button>
        </fieldset>
        <Pending id="roles-status">La gestión de permisos requiere un contrato de API.</Pending>
      </Panel>
    </>
  );
}

function Audit() {
  return (
    <Panel title="Registro de auditoría">
      <fieldset disabled className="filters" aria-describedby="audit-status">
        <label>Fecha<input type="date" /></label><label>Actor<input type="search" /></label>
        <label>Recurso<input type="search" /></label><button type="button">Aplicar filtros</button>
      </fieldset>
      <Pending id="audit-status">La consulta de auditoría requiere un contrato de API.</Pending>
      <EmptyTable title="Registro de auditoría" columns={["Fecha", "Actor", "Acción", "Recurso"]}>Sin eventos para mostrar.</EmptyTable>
    </Panel>
  );
}

export function AdminConsole({ api, exit, omni, enabled = false }: { api?: Api; exit?: () => void; omni?: OmnichannelApi; enabled?: boolean }) {
  const [section, setSection] = useState<Section>("Dashboard");
  const [selected, setSelected] = useState<RequestRow>();
  const observing = section === "Patient Journey" || section === "Centro de Orquestación";
  const renderNavigation = (items: typeof operations | typeof management) => items.map(({ name, icon: Icon }) => (
    <button type="button" className="nav-item" aria-current={section === name ? "page" : undefined} key={name} onClick={() => setSection(name)}>
      <Icon size={19} aria-hidden="true" /><span>{name}</span>
    </button>
  ));

  return (
    <div className="console">
      <a href="#contenido" className="skip-link">Saltar al contenido</a>
      <aside className="sidebar">
        <Brand />
        <nav aria-label="Secciones de Administración">
          <div className="nav-group" role="group" aria-label="Operación"><p aria-hidden="true">Operación</p>{renderNavigation(operations)}</div>
          <div className="nav-group" role="group" aria-label="Gestión"><p aria-hidden="true">Gestión</p>{renderNavigation(management)}</div>
        </nav>
        {exit ? <button type="button" className="back-link" onClick={exit}><LogIn size={18} aria-hidden="true" /> Cerrar sesión</button>
          : <a href="/" className="back-link"><LogIn size={18} aria-hidden="true" /> Acceso</a>}
      </aside>
      <main className="workspace" id="contenido" tabIndex={-1}>
        <header className="workspace-header">
          <div><p>Administración</p><h1 aria-live="polite">{section}</h1></div>
          {!api && <span className="design-status">Vista de desarrollo</span>}
        </header>
        <div className="workspace-content">
          {section === "Dashboard" && (api
            ? <>
              <p>Indicadores de la API general.</p>
              <LiveDashboard api={api} openSupervision={() => setSection("Supervisión")} />
              <Panel title="Indicadores del orquestador">
                <Pending>Totales, estados y actividad por canal no disponibles. Consulta un trámite autorizado en Patient Journey.</Pending>
              </Panel>
            </>
            : <Dashboard openSupervision={() => setSection("Supervisión")} />)}
          {section === "Supervisión" && (api
            ? <LiveSupervision api={api} openJourney={(row) => { setSelected(row); setSection("Recorrido API general"); }} />
            : <Supervision openJourney={() => setSection("Patient Journey")} />)}
          {section === "Recorrido API general" && (api ? <RequestJourney api={api} selected={selected} /> : <Journey events={[]} />)}
          {omni && <div hidden={!observing}>
            <OmnichannelPanel api={omni} enabled={enabled} active={observing} frame={(content) => <Panel title="Seguimiento por trámite">{content}</Panel>} />
          </div>}
          {section === "Patient Journey" && !omni && <Journey events={[]} />}
          {section === "Centro de Orquestación" && !omni && (
            <Panel title="Eventos por trámite"><Pending>Consulta disponible con sesión administrativa.</Pending></Panel>)}
          {section === "Integraciones" && <Panel title="Canales registrados">
            <EmptyTable title="Integraciones" columns={["Canal", "Estado", "Última actividad"]}>Directorio y estado de canales pendientes de integración.</EmptyTable>
          </Panel>}
          {(section === "Usuarios" || section === "Estudios" || section === "Clínicas") && <Registry key={section} spec={registries[section]} />}
          {section === "Roles y permisos" && <Roles />}
          {section === "Auditoría" && <Audit />}
        </div>
      </main>
    </div>
  );
}
