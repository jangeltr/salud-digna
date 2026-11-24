"use client";

import Link from "next/link";
import { Headset } from "lucide-react";
import { Brand } from "../components/ui";

import { StaffAccess } from "../components/staff-access";
import { AssistedConsole } from "../components/assisted-console";
import type { ReactNode } from "react";

function Login({ form }: { form: ReactNode }) {
  return (
    <main className="login">
      <section className="login-brand">
        <Brand />
        <div className="login-intro">
          <span className="login-symbol"><Headset size={38} strokeWidth={1.4} aria-hidden="true" /></span>
          <h1>Call Center</h1>
          <p>Consola de atención al paciente.</p>
        </div>
      </section>
      <section className="login-content" aria-labelledby="login-title">
        <div className="login-form">
          <h2 id="login-title">Inicio de sesión</h2>
          <p>Acceso para asesores de Salud Digna.</p>
          {form}
          {process.env.NODE_ENV === "development" && (
            <Link className="preview-link" href="/diseno">Abrir vista de diseño</Link>
          )}
        </div>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return <StaffAccess role="ADVISOR" login={(form) => <Login form={form} />}>
    {(api, exit, reportOutcome) => <AssistedConsole api={api} exit={exit} reportOutcome={reportOutcome} />}
  </StaffAccess>;
}
