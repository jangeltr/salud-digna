import type { ReactNode } from "react";
import { Activity, Inbox, LockKeyhole } from "lucide-react";

export function Brand() {
  return <div className="brand"><span><Activity size={22} aria-hidden="true" /></span>Salud <strong>Digna</strong></div>;
}

export function Pending({ children, id }: { children: ReactNode; id?: string }) {
  return <p className="notice" id={id}><LockKeyhole size={16} aria-hidden="true" />{children}</p>;
}

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="panel"><h2>{title}</h2>{children}</section>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty"><span><Inbox size={22} aria-hidden="true" /></span><p>{children}</p></div>;
}

export function EmptyTable({ title, columns, children }: {
  title: string;
  columns: readonly string[];
  children: ReactNode;
}) {
  return (
    <div className="table-scroll" role="region" aria-label={title} tabIndex={0}>
      <table>
        <caption className="sr-only">{title}</caption>
        <thead><tr>{columns.map((column) => <th scope="col" key={column}>{column}</th>)}</tr></thead>
        <tbody><tr><td colSpan={columns.length}><Empty>{children}</Empty></td></tr></tbody>
      </table>
    </div>
  );
}
