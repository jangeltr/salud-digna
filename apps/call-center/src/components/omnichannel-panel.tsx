"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { continuityCode, referenceLabels, type HistoryPage, type Outcome, type View } from "../omnichannel/contract";

export type OmnichannelApi = <T>(body: object) => Promise<T>;
type AccessView = View & { expiresAt: number; canMarkPending: boolean };
type Redemption = { journeyId: string; expiresAt: number };

class ReadError extends Error {
  constructor(readonly status: number) { super("Omnichannel request failed"); }
}

export async function omnichannelRequest<T>(token: string, instanceId: string, body: object) {
  const response = await fetch("/api/omnichannel", {
    method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", "X-Staff-Instance": instanceId },
    body: JSON.stringify(body), cache: "no-store", keepalive: true, signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) throw new ReadError(response.status);
  return await response.json() as T;
}

function errorText(error: unknown) {
  if (!(error instanceof ReadError)) return "La conexión se interrumpió o la respuesta fue incompleta.";
  return ({
    400: "Revisa el UUID, el permiso y los datos ingresados.",
    401: "La sesión del operador o la credencial del canal no está autorizada.",
    403: "El operador o el canal carece del permiso necesario.",
    404: "El trámite, el permiso o el intento ya no está disponible.",
    409: "Hay un conflicto o una operación pendiente. Revisa el estado antes de continuar.",
    429: "Límite de solicitudes. Espera antes de volver a intentarlo.",
  } as Record<number, string>)[error.status] ?? "El servicio no está disponible. Intenta más tarde.";
}

export function OmnichannelPanel({ api, writable = false, enabled, frame, initialId = "" }: {
  api: OmnichannelApi; initialId?: string; writable?: boolean; enabled: boolean; frame: (contents: ReactNode) => ReactNode;
}) {
  const [journeyId, setJourneyId] = useState(initialId);
  const [activeId, setActiveId] = useState("");
  const [recoverable, setRecoverable] = useState(false);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [view, setView] = useState<AccessView | null>(null);
  const [message, setMessage] = useState("");
  const [outcome, setOutcome] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const live = useRef(0);

  function clear() {
    live.current += 1;
    setView(null);
    setActiveId("");
    setJourneyId("");
    setExpiresAt(null);
    setPending(null);
    setRecoverable(false);
  }

  useEffect(() => {
    if (expiresAt === null) return;
    const timer = window.setTimeout(() => {
      clear();
      setMessage("El permiso venció. Usa un código de continuidad nuevo para volver a consultar.");
    }, Math.max(0, expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [expiresAt]);

  function run(task: (generation: number) => Promise<void>) {
    if (lock.current || !enabled) return;
    lock.current = true;
    const generation = live.current;
    setBusy(true);
    setMessage("");
    void task(generation).catch((error: unknown) => {
      if (generation !== live.current) return;
      if (error instanceof ReadError && [401, 403, 404].includes(error.status)) clear();
      setMessage(errorText(error));
    }).finally(() => { lock.current = false; setBusy(false); });
  }

  async function readRedeemed(result: Redemption, generation: number) {
    if (generation !== live.current) return;
    setActiveId(result.journeyId);
    setExpiresAt(result.expiresAt);
    setOutcome("");
    setRecoverable(false);
    setView(null);
    const recovered = await api<AccessView>({ action: "read", journeyId: result.journeyId });
    if (generation === live.current) setView(recovered);
  }

  function redeem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (activeId || pending || lock.current) return;
    const form = event.currentTarget;
    const code = continuityCode(new FormData(form).get("code"));
    form.reset();
    if (!code) { setMessage("Ingresa un código de continuidad Base32 de 12 caracteres, con o sin guiones."); return; }
    run(async (generation) => {
      let result: Redemption;
      try {
        result = await api<Redemption>({ action: "redeem", code });
      } catch (error) {
        if (generation !== live.current) return;
        if (error instanceof ReadError) {
          const notices: Record<number, string> = {
            400: "El código tiene un formato inválido.",
            404: "El código no está disponible. Puede haber vencido o haberse usado. Solicita otro al canal emisor.",
            409: "Hay una operación en curso. Revisa el acceso antes de volver a canjear.",
            410: "El permiso del código venció. Solicita otro código.",
            429: "Se alcanzó el límite de canjes. Espera un minuto antes de volver a intentarlo.",
          };
          if (error.status === 409) setRecoverable(true);
          if (notices[error.status]) { setMessage(notices[error.status]); return; }
          if (error.status < 500) throw error;
        }
        setRecoverable(true);
        setMessage("El resultado del canje no se pudo comprobar. Recupera el acceso de esta sesión. Si no está disponible, solicita un código nuevo.");
        return;
      }
      await readRedeemed(result, generation);
    });
  }

  function resume() {
    run(async (generation) => {
      try {
        const result = await api<Redemption>({ action: "resume" });
        await readRedeemed(result, generation);
      } catch (error) {
        if (generation === live.current && error instanceof ReadError && error.status === 404) {
          clear();
          setMessage("La sesión ya no dispone de un acceso recuperable. Solicita un código nuevo al canal emisor.");
          return;
        }
        throw error;
      }
    });
  }

  function open(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (activeId || pending || lock.current) return;
    const form = event.currentTarget;
    const grant = String(new FormData(form).get("grant"));
    form.reset();
    const id = journeyId.trim().toLowerCase();
    run(async (generation) => {
      const result = await api<AccessView>({ action: "open", journeyId: id, grant });
      if (generation !== live.current) return;
      setActiveId(id);
      setExpiresAt(result.expiresAt);
      setOutcome("");
      setView(result);
    });
  }

  function refresh() {
    run(async (generation) => {
      const result = await api<AccessView>({ action: "read", journeyId: activeId });
      if (generation === live.current) setView(result);
    });
  }

  function more(cursor: string) {
    run(async (generation) => {
      const page = await api<HistoryPage>({ action: "history", journeyId: activeId, cursor });
      if (generation !== live.current) return;
      setView((current) => {
        if (!current?.history) return current;
        const seen = new Set(current.history.items.map((item) => item.id));
        return { ...current, history: { ...page, items: [...current.history.items, ...page.items.filter((item) => !seen.has(item.id))] } };
      });
    });
  }

  function publish(event?: FormEvent<HTMLFormElement>, markPending = false) {
    event?.preventDefault();
    if (!view || view.expiresAt <= Date.now() || (event && pending)) return;
    const form = event ? new FormData(event.currentTarget) : null;
    if (markPending && !view.canMarkPending) return;
    const type = markPending ? "JOURNEY_STATUS_CHANGED" : form?.get("type");
    const operationId = form || markPending ? crypto.randomUUID() : pending;
    if (!operationId) return;
    const body = form || markPending ? { action: "publish", operationId, journeyId: activeId, type, expectedVersion: view.context.version,
      studyId: form?.get("studyId") || undefined, clinicId: form?.get("clinicId") || undefined,
      to: markPending ? "PENDING_CONFIRMATION" : form?.get("to") || undefined } : { action: "retry", operationId, journeyId: activeId };
    run(async (generation) => {
      let result: Outcome;
      try {
        result = await api<Outcome>(body);
      } catch (error) {
        if (generation !== live.current) return;
        if (!(error instanceof ReadError) || [409, 429, 503].includes(error.status)) {
          setPending(operationId);
          setOutcome("Resultado sin verificar. Usa el reintento de la misma operación.");
          return;
        }
        setOutcome(pending ? "No se pudo verificar el intento anterior. Consulta el trámite antes de iniciar otro avance." : "El servidor no pudo continuar la operación.");
        throw error;
      }
      if (generation !== live.current) return;
      setPending(result.outcome === "uncertain" ? operationId : null);
      if (result.outcome === "uncertain") {
        if (result.status && [401, 403, 404].includes(result.status)) {
          clear();
          setOutcome("Resultado sin verificar. Se perdió el acceso a la atención.");
        } else {
          setOutcome(result.status === 429
            ? "Límite de solicitudes. Espera antes de reintentar la misma operación."
            : "Resultado sin verificar. Reintenta la misma operación.");
        }
        return;
      }
      setOutcome(result.outcome === "applied" ? "El orquestador acreditó el avance persistido."
        : result.status === 409 ? "Avance rechazado por conflicto. Revisa la versión y las transiciones admitidas."
        : result.status === 429 ? "Límite de solicitudes. Espera antes de volver a intentar."
        : result.status === 503 ? "No se pudo verificar el contexto. Actualiza antes de volver a intentar."
        : "El orquestador rechazó el avance.");
      if (result.outcome === "rejected" && result.status && [401, 403, 404].includes(result.status)) {
        clear();
        setMessage("El permiso o la credencial del canal no permite continuar.");
        return;
      }
      if (result.outcome === "applied" || result.status === 409) {
        setView(null);
        const resultView = await api<AccessView>({ action: "read", journeyId: activeId });
        if (generation === live.current) setView(resultView);
      }
    });
  }

  function close() {
    run(async () => {
      await api({ action: "close" });
      clear();
      setOutcome("");
    });
  }

  return frame(<>
    <section className="fields" aria-labelledby="automatic-continuity-title">
      <h3 id="automatic-continuity-title">Recuperación automática</h3>
      <dl className="context-data">
        <div><dt>Asesor</dt><dd>Sesión de asesor activa</dd></div>
        <div><dt>Verificación del paciente</dt><dd>Pendiente del procedimiento institucional</dd></div>
        <div><dt>Autorización de atención</dt><dd>Pendiente de acreditación institucional</dd></div>
      </dl>
      <fieldset disabled aria-describedby="automatic-continuity-status">
        <button type="button">Verificar paciente y autorización</button>
      </fieldset>
      <h4>Trámites activos</h4>
      <p id="automatic-continuity-status">La recuperación sin códigos se habilitará cuando la API central pueda acreditar esta atención.</p>
    </section>
    <h3>Alternativa con código de continuidad</h3>
    <p>{activeId ? "Cierra el acceso al trámite antes de continuar otra atención." : "Ingresa el código de continuidad que recibió el paciente."}</p>
    <form onSubmit={redeem}>
      <fieldset className="fields" disabled={busy || !!pending || !enabled || !!activeId}>
        <label>Código de continuidad<input name="code" autoComplete="off" spellCheck={false}
          required minLength={12} maxLength={14} pattern={"(?:[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{12}|[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{4}(?:\\-[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{4}){2})"} /></label>
        <button type="submit">Continuar atención</button>
      </fieldset>
    </form>
    {recoverable && <button type="button" disabled={busy} onClick={resume}>Recuperar acceso de esta sesión</button>}
    {!enabled && <p>Integración deshabilitada. Falta la configuración privada del servidor.</p>}
    <details>
      <summary>Consultar con permiso de demostración</summary>
    <form onSubmit={open}>
      <fieldset className="fields" disabled={busy || !!pending || !enabled || !!activeId}>
        <label>UUID del trámite<input required value={journeyId} minLength={36} maxLength={36}
          onChange={(event) => setJourneyId(event.target.value)} /></label>
        <label>Permiso temporal<input name="grant" type="password" autoComplete="off" required minLength={43} maxLength={43} /></label>
        <button type="submit">Consultar trámite</button>
      </fieldset>
    </form>
    </details>
    <p role="status">{busy ? "Consultando el servicio… " : ""}{outcome} {message}</p>
    {activeId && <>
      <button type="button" disabled={busy} onClick={refresh}>Actualizar desde el orquestador</button>
      <button type="button" disabled={busy} onClick={close}>Cerrar acceso al trámite</button>
    </>}
    {view && <>
      {view.status === "PENDING_CONFIRMATION" && <div className="notice">
        <strong>Atención registrada</strong>
        <p>Estado: Pendiente de confirmación</p>
        <p className="break-all">Folio del trámite: {activeId}</p>
      </div>}
      <h3>Contexto recuperado</h3>
      <dl className="context-data break-words">
        <div><dt>Folio del trámite (UUID)</dt><dd>{activeId}</dd></div>
        <div><dt>Estado vigente</dt><dd>{view.status === "PENDING_CONFIRMATION" ? "Pendiente de confirmación" : view.status}</dd></div>
        <div><dt>Paso vigente</dt><dd>{view.context.currentStep}</dd></div>
        <div><dt>Versión</dt><dd>{view.context.version}</dd></div>
        {Object.entries(view.context.externalRefs).map(([key, value]) => <div key={key}><dt>{referenceLabels[key] ?? key}</dt><dd>{value}</dd></div>)}
      </dl>
      {writable && view.canMarkPending && <button type="button" className="primary"
        disabled={busy || !!pending} onClick={() => publish(undefined, true)}>Dejar pendiente de confirmación</button>}
      {writable && <fieldset className="fields" disabled={busy || !!pending}>
        <form className="fields" onSubmit={publish}>
          <input type="hidden" name="type" value="JOURNEY_CONTEXT_UPDATED" />
          <label>UUID del estudio<input name="studyId" minLength={36} maxLength={36} /></label>
          <label>UUID de la clínica<input name="clinicId" minLength={36} maxLength={36} /></label>
          <button type="submit">Publicar cambio de contexto</button>
        </form>
        <form className="fields" onSubmit={publish}>
          <input type="hidden" name="type" value="JOURNEY_STATUS_CHANGED" />
          <label>Estado solicitado<select name="to" required><option value="">Seleccionar</option>
            <option value="CANCELLED">Cancelado</option>
          </select></label>
          <button type="submit">Publicar cambio de estado</button>
        </form>
      </fieldset>}
      {writable && pending && <button type="button" disabled={busy} onClick={() => publish()}>Reintentar el mismo avance</button>}
      <h3>Historial entre canales</h3>
      {!view.history ? <p>El historial no está disponible. Actualiza para volver a consultarlo.</p> :
        !view.history.items.length ? <p>Sin eventos disponibles.</p> : <ol className="event-list">
          {view.history.items.map((item) => <li className="break-words" key={item.id}><div>
            <strong>{item.type}</strong><p>{item.producerCode} · <time dateTime={item.occurredAt}>{new Date(item.occurredAt).toLocaleString("es-MX")}</time></p>
            {item.data.version && <p>Versión {item.data.version}</p>}
            {item.data.currentStep && <p>{item.data.currentStep}</p>}
            {item.data.from && item.data.to && <p>{item.data.from} → {item.data.to}</p>}
          </div></li>)}
        </ol>}
      {view.history?.nextCursor && <button type="button" disabled={busy} onClick={() => more(view.history!.nextCursor!)}>Cargar más eventos</button>}
    </>}
  </>);
}
