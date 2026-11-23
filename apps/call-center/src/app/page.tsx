import Link from "next/link";
import { Headset } from "lucide-react";
import { Brand, IntegrationNotice } from "../components/ui";

export default function LoginPage() {
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
          <fieldset disabled className="fields" aria-describedby="login-status">
            <label>Correo institucional<input type="email" autoComplete="username" /></label>
            <label>Contraseña<input type="password" autoComplete="current-password" /></label>
            <button className="primary" type="button">Iniciar sesión</button>
          </fieldset>
          <IntegrationNotice id="login-status">Inicio de sesión pendiente de integración.</IntegrationNotice>
          {process.env.NODE_ENV === "development" && (
            <Link className="preview-link" href="/diseno">Abrir vista de diseño</Link>
          )}
        </div>
      </section>
    </main>
  );
}
