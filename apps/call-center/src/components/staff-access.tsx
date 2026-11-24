"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ApiError, apiWith, errorMessage, type Api } from "./orchestrator";

type Session = { accessToken: string; expiresIn: number; user: { role: string } };

export function StaffAccess({ role, login, children }: {
  role: "ADVISOR" | "ADMIN";
  login: (form: ReactNode) => ReactNode;
  children: (api: Api, exit: () => void, reportOutcome: (notice: string) => void) => ReactNode;
}) {
  const busy = useRef(false);
  const generation = useRef(0);
  const [outcome, setOutcome] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!session) return;
    const timer = window.setTimeout(() => {
      setSession(null);
      setMessage("La sesión ha vencido.");
    }, session.expiresIn * 1000);
    return () => window.clearTimeout(timer);
  }, [session]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setMessage("");
    generation.current += 1;
    setOutcome("");
    const form = event.currentTarget;
    const values = new FormData(form);
    form.reset();
    try {
      const result = await apiWith()<Session>("auth/login", {
        email: String(values.get("email")).trim(), password: values.get("password"),
      });
      if (result.user.role !== role) throw new ApiError(403);
      setSession(result);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  if (session) {
    const sessionGeneration = generation.current;
    const request = apiWith(session.accessToken);
    const api: Api = async (path, body, expectedStatus) => {
      try {
        return await request(path, body, expectedStatus);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          setSession((current) => current === session ? null : current);
          if (generation.current === sessionGeneration) setMessage(error.message);
        }
        throw error;
      }
    };
    return children(api, () => {
      generation.current += 1;
      setOutcome("");
      setSession(null);
      setMessage("");
    }, (notice) => { if (generation.current === sessionGeneration) setOutcome(notice); });
  }

  return login(<form className="fields" onSubmit={signIn}>
    <label>Correo institucional<input name="email" type="email" autoComplete="username" required maxLength={254} /></label>
    <label>Contraseña<input name="password" type="password" autoComplete="current-password" required maxLength={128} /></label>
    <button className="primary" type="submit" disabled={loading}>{loading ? "Iniciando sesión…" : "Iniciar sesión"}</button>
    <p role="status">{[message, outcome].filter(Boolean).join(" ")}</p>
  </form>);
}
