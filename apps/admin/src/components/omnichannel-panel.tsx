"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { HistoryPage, Outcome, View } from "../omnichannel/contract";

export type OmnichannelApi = <T>(body: object) => Promise<T>;
type AccessView = View & { expiresAt: number };
const referenceLabels: Record<string, string> = {
  studyId: "Estudio (UUID)", clinicId: "Clínica (UUID)", appointmentId: "Cita (UUID)",
};
const statusLabel = (status: string) => status === "PENDING_CONFIRMATION" ? "Pendiente de confirmación" : status;

class ReadError extends Error {
  constructor(readonly status: number) { super("Omnichannel request failed"); }
}

export async function omnichannelRequest<T>(token: string, instanceId: string, body: object) {
  const response = await fetch("/api/omnichannel", {
    method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", "X-Staff-Instance": instanceId },
    body: JSON.stringify(body), cache: "no-store", keepalive: true, signal: AbortSignal.timeout(25000),
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
    404: "No se puede consultar el trámite. Usa un permiso vigente emitido para Administración y este UUID.",
    409: "Hay un conflicto o una operación pendiente. Revisa el estado antes de continuar.",
    429: "Límite de solicitudes. Espera antes de volver a intentarlo.",
  } as Record<number, string>)[error.status] ?? "El servicio no está disponible. Intenta más tarde.";
}

export function OmnichannelPanel({ api, writable = false, enabled, frame, initialId = "" }: {
  api: OmnichannelApi; initialId?: string; writable?: boolean; enabled: boolean; frame: (contents: ReactNode) => ReactNode;
}) {
  const [journeyId, setJourneyId] = useState(initialId);
  const [activeId, setActiveId] = useState("");
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
  }

  useEffect(() => {
    if (expiresAt === null) return;
    const timer = window.setTimeout(() => {
      clear();
      setMessage("Terminó la ventana local de acceso. Presenta un permiso vigente para volver a consultar.");
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

  function open(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || lock.current) return;
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

  function publish(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!view || view.expiresAt <= Date.now() || (event && pending)) return;
    const form = event ? new FormData(event.currentTarget) : null;
    const type = form?.get("type");
    const operationId = form ? crypto.randomUUID() : pending;
    if (!operationId) return;
    const body = form ? { action: "publish", operationId, journeyId: activeId, type, expectedVersion: view.context.version,
      studyId: form.get("studyId") || undefined, clinicId: form.get("clinicId") || undefined,
      to: form.get("to") || undefined } : { action: "retry", operationId, journeyId: activeId };
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
    <p>Orquestador omnicanal. Usa un permiso temporal emitido para este canal y trámite en el entorno autorizado.</p>
    {!enabled && <p>Integración deshabilitada. Falta la configuración privada del servidor.</p>}
    <form onSubmit={open}>
      <fieldset className="fields" disabled={busy || !!pending || !enabled}>
        <label>Folio del trámite (UUID)<input required value={journeyId} minLength={36} maxLength={36}
          onChange={(event) => setJourneyId(event.target.value)} /></label>
        <label>Permiso temporal<input name="grant" type="password" autoComplete="off" required minLength={43} maxLength={43} /></label>
        <button type="submit">Consultar trámite</button>
      </fieldset>
    </form>
    <p role="status">{busy ? "Consultando el servicio… " : ""}{outcome} {message}</p>
    {activeId && <>
      <button type="button" disabled={busy} onClick={refresh}>Actualizar desde el orquestador</button>
      <button type="button" disabled={busy} onClick={close}>Cerrar acceso al trámite</button>
    </>}
    {view && <>
      <dl className="context-data break-words">
        <div><dt>Folio del trámite (UUID)</dt><dd>{activeId}</dd></div>
        <div><dt>Estado vigente</dt><dd>{statusLabel(view.status)}</dd></div>
        <div><dt>Paso vigente</dt><dd>{view.context.currentStep}</dd></div>
        <div><dt>Versión</dt><dd>{view.context.version}</dd></div>
        {Object.entries(view.context.externalRefs).map(([key, value]) => <div key={key}><dt>{referenceLabels[key] ?? key}</dt><dd>{value}</dd></div>)}
      </dl>
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
            <option value="PENDING_CONFIRMATION">Pendiente de confirmación</option><option value="CANCELLED">Cancelado</option>
          </select></label>
          <button type="submit">Publicar cambio de estado</button>
        </form>
      </fieldset>}
      {writable && pending && <button type="button" disabled={busy} onClick={() => publish()}>Reintentar el mismo avance</button>}
      <h3>Línea de tiempo entre canales</h3>
      {!view.history ? <p>El historial no está disponible. Actualiza para volver a consultarlo.</p> :
        !view.history.items.length ? <p>Sin eventos disponibles.</p> : <ol className="event-list">
          {view.history.items.map((item) => <li className="break-words" key={item.id}><div>
            <strong>{item.type}</strong><p>Canal: {item.producerCode} · <time dateTime={item.occurredAt}>{new Date(item.occurredAt).toLocaleString("es-MX")}</time></p>
            {item.data.version && <p>Versión {item.data.version}</p>}
            {item.data.currentStep && <p>{item.data.currentStep}</p>}
            {item.data.from && item.data.to && <p>{statusLabel(item.data.from)} → {statusLabel(item.data.to)}</p>}
          </div></li>)}
        </ol>}
      {view.history?.nextCursor && <button type="button" disabled={busy} onClick={() => more(view.history!.nextCursor!)}>Cargar más eventos</button>}
    </>}
  </>);
}
