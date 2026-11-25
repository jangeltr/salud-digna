"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Brand } from "../components/ui";
import { AdminConsole } from "../components/admin-console";
import { StaffAccess } from "../components/staff-access";

function Login({ form }: { form: ReactNode }) {
  return (
    <main className="login">
      <div className="login-identity">
        <Brand />
        <div><ShieldCheck size={44} strokeWidth={1.5} aria-hidden="true" /><h1>Administración</h1><p>Supervisión operativa y gestión de catálogos.</p></div>
      </div>
      <div className="login-body">
        <section className="panel login-card" aria-labelledby="login-title">
          <h2 id="login-title">Acceso administrativo</h2>
          {form}
          {process.env.NODE_ENV === "development" && <Link className="text-link" href="/diseno">Abrir vista de diseño</Link>}
        </section>
      </div>
    </main>
  );
}

export default function Page({ enabled }: { enabled: boolean }) {
  return <StaffAccess role="ADMIN" login={(form) => <Login form={form} />}>
    {(api, exit, omni) => <AdminConsole api={api} exit={exit} omni={omni} enabled={enabled} />}
  </StaffAccess>;
}
