import { Activity, CircleAlert, Hourglass, LockKeyhole, Unplug, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand" aria-label="Salud Digna">
      <span className="brand-mark"><Activity size={22} aria-hidden="true" /></span>
      {!compact && <span>Salud <strong>Digna</strong></span>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children }: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon size={26} strokeWidth={1.7} aria-hidden="true" /></span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

export function Status({ children }: { children: ReactNode }) {
  return <span className="status">{children}</span>;
}

export function IntegrationNotice({ id, children }: { id?: string; children: ReactNode }) {
  return <p id={id} className="notice"><LockKeyhole size={16} aria-hidden="true" />{children}</p>;
}

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="panel"><h2>{title}</h2>{children}</section>;
}

export const displayStates = {
  offline: "Sin conexión",
  loading: "Carga",
  empty: "Vacío",
  error: "Error",
} as const;

export type DisplayState = keyof typeof displayStates;

const stateDetails = {
  offline: { icon: Unplug, title: "Sin conexión", text: "La conexión con la API está pendiente de integración." },
  loading: { icon: Hourglass, title: "Cargando información", text: "Vista de carga. No hay una consulta en curso." },
  error: { icon: CircleAlert, title: "No se pudo mostrar la información", text: "Vista de error. No se realizó una consulta." },
};

export function DataState({ state, icon, title, children }: {
  state: DisplayState;
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  if (state === "empty") return <EmptyState icon={icon} title={title}>{children}</EmptyState>;

  const detail = stateDetails[state];
  return (
    <div className="data-state" data-state={state}>
      <EmptyState icon={detail.icon} title={detail.title}>{detail.text}</EmptyState>
    </div>
  );
}
