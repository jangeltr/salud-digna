import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Brand, Pending } from "../components/ui";

export default function Login() {
  return (
    <main className="login">
      <div className="login-identity">
        <Brand />
        <div><ShieldCheck size={44} strokeWidth={1.5} aria-hidden="true" /><h1>Administración</h1><p>Supervisión operativa y gestión de catálogos.</p></div>
      </div>
      <div className="login-body">
        <section className="panel login-card" aria-labelledby="login-title">
          <h2 id="login-title">Acceso administrativo</h2>
          <fieldset disabled className="fields" aria-describedby="login-status">
            <label>Correo institucional<input type="email" autoComplete="username" /></label>
            <label>Contraseña<input type="password" autoComplete="current-password" /></label>
            <button type="button" className="primary">Iniciar sesión</button>
          </fieldset>
          <Pending id="login-status">Autenticación pendiente de integración.</Pending>
          {process.env.NODE_ENV === "development" && <Link className="text-link" href="/diseno">Abrir vista de diseño</Link>}
        </section>
      </div>
    </main>
  );
}
