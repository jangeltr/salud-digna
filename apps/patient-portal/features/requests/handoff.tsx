import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import { requestCapabilities } from "@/lib/composition";
import type { BookingRequest, LockedRequest } from "@/lib/domain/model";
import { cancelRequest, requestConfirmation } from "./actions";
import { ContinuityForm } from "./continuity-form";
import type { SelectionDetails } from "./data";
import { RequestForm, secondaryButton } from "./parts";
import { Summary } from "./review";
import { formatDateTime } from "./schedule";

/**
 * Pantallas del trámite cuando el paciente no confirma la cita por su cuenta:
 * la envía a confirmación y la termina un canal de atención.
 */

/**
 * Dónde puede seguir el paciente. Con continuidad identificada le basta identificarse en el otro canal.
 * WhatsApp quedó fuera del MVP el 2026-11-24: ver «Continuidad identificada» en `docs/decisions.md`.
 */
const OTHER_CHANNELS = requestCapabilities.identifiedContinuity
  ? "Puedes continuar en la app móvil o en Call Center: al identificarte verás este trámite, sin código."
  : "Puedes continuar en la app móvil o en Call Center.";

const dangerButton =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-danger px-4 font-semibold text-canvas hover:opacity-90 disabled:opacity-70";

/** Folio del trámite: su identificador, para dictarlo o pegarlo en otro canal. */
export function Folio({ requestId }: { requestId: string }) {
  return (
    <div className="mt-6 rounded-lg border border-line bg-canvas p-4">
      <p className="text-sm font-semibold">Folio del trámite</p>
      <p className="mt-1 mb-3 font-mono text-lg font-bold break-all select-all">{requestId}</p>
      <CopyButton value={requestId} label="Copiar folio" />
    </div>
  );
}

/**
 * «Continuar en otro canal». Se ofrece desde que el trámite tiene un estudio.
 * Con continuidad identificada, el paciente solo tiene que identificarse en el otro canal, y el código
 * queda como alternativa discreta, plegada bajo «Otra forma de continuar».
 */
export function ContinuitySection({ requestId }: { requestId: string }) {
  if (requestCapabilities.identifiedContinuity) {
    return (
      <section aria-labelledby="continuidad" className="mt-10 border-t border-line pt-6">
        <h2 id="continuidad" className="text-lg font-semibold">
          Continuar en otro canal
        </h2>
        <p className="mt-1 text-sm text-muted">
          Puedes seguir con este trámite en la app móvil o en Call Center. Al identificarte allí verás tus trámites
          activos, sin necesidad de código.
        </p>
        <details className="mt-4">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-brand underline underline-offset-4">
            Otra forma de continuar
          </summary>
          <p className="mt-2 mb-3 text-sm text-muted">
            Si el otro canal te pide un código, genéralo aquí. Dura cinco minutos como máximo y sirve una sola vez.
          </p>
          <ContinuityForm requestId={requestId} />
        </details>
      </section>
    );
  }

  return (
    <section aria-labelledby="continuidad" className="mt-10 border-t border-line pt-6">
      <h2 id="continuidad" className="text-lg font-semibold">
        Continuar en otro canal
      </h2>
      <p className="mt-1 mb-3 text-sm text-muted">
        Genera un código y úsalo en la app móvil o en Call Center para seguir con este trámite. Dura cinco minutos como máximo
        y sirve una sola vez.
      </p>
      <ContinuityForm requestId={requestId} />
    </section>
  );
}

/** Revisión sin confirmación directa: resumen y envío a confirmación. */
export function SubmitStep({ request, selections }: { request: BookingRequest; selections: SelectionDetails }) {
  return (
    <section aria-labelledby="paso-revision">
      <h2 id="paso-revision" className="mt-6 text-xl font-semibold">
        Revisa tu trámite
      </h2>
      <Summary request={request} selections={selections} showSchedule={false} />
      <p className="mt-6 mb-3 text-sm text-muted">
        Si todo es correcto, envíalo a confirmación. La fecha y la hora se acuerdan después en la app móvil o en Call Center.
      </p>
      <RequestForm action={requestConfirmation} request={request} label="Enviar a confirmación" pendingLabel="Enviando…" />
    </section>
  );
}

export function PendingConfirmationStep({ request, selections }: { request: BookingRequest; selections: SelectionDetails }) {
  return (
    <section aria-labelledby="pendiente-confirmacion">
      <h2 id="pendiente-confirmacion" className="mt-6 text-xl font-semibold">
        Pendiente de confirmación
      </h2>
      <Summary request={request} selections={selections} showSchedule={false} />
      <Folio requestId={request.id} />
      <p className="mt-4">{OTHER_CHANNELS}</p>
    </section>
  );
}

/** Paso que el portal no puede atender con el servicio activo, como la fecha y la hora. */
export function OtherChannelStep({ requestId }: { requestId: string }) {
  return (
    <section aria-labelledby="otro-canal">
      <h2 id="otro-canal" className="mt-6 text-xl font-semibold">
        Este paso continúa en otro canal
      </h2>
      <p className="mt-2 text-muted">El portal todavía no puede registrar este paso.</p>
      <Folio requestId={requestId} />
      <p className="mt-4">{OTHER_CHANNELS}</p>
    </section>
  );
}

/** El trámite es del paciente, pero el portal no tiene un permiso vigente: no muestra ningún dato suyo. */
export function AccessExpired({ requestId }: { requestId: string }) {
  return (
    <section aria-labelledby="permiso-vencido">
      <h2 id="permiso-vencido" className="mt-6 text-xl font-semibold">
        Necesita un permiso nuevo
      </h2>
      <p className="mt-2 text-muted">
        El permiso del portal para consultar este trámite venció. Tu avance sigue guardado, pero desde aquí no se puede ver
        ni cambiar hasta que el portal reciba un permiso nuevo.
      </p>
      <Folio requestId={requestId} />
      <p className="mt-4">{OTHER_CHANNELS}</p>
      <p className="mt-4">
        <Link href="/continuar" prefetch={false} className="inline-flex min-h-11 items-center font-semibold text-brand underline underline-offset-4">
          Ver mis trámites
        </Link>
      </p>
    </section>
  );
}

type CancelProps = {
  request: BookingRequest;
  /** El paciente ya pidió cancelar: se muestra la confirmación con el formulario. */
  confirming: boolean;
};

/**
 * «Cancelar trámite» con confirmación previa. El formulario que cancela solo existe en la página
 * después de pedirlo, así que hacen falta dos pasos, también sin JavaScript.
 */
export function CancelSection({ request, confirming }: CancelProps) {
  const path = `/tramite/${request.id}`;

  if (!confirming) {
    return (
      <p>
        <Link href={`${path}?cancelar=1#cancelar`} prefetch={false} className={secondaryButton}>
          Cancelar trámite
        </Link>
      </p>
    );
  }

  return (
    <section id="cancelar" aria-labelledby="cancelar-titulo" className="rounded-lg border border-danger/30 bg-danger-soft p-4">
      <h2 id="cancelar-titulo" className="text-lg font-semibold text-danger">
        ¿Cancelar este trámite?
      </h2>
      <p className="mt-1 mb-4 text-sm">
        El trámite se cerrará y no podrá retomarse en ningún canal. Esta acción no se puede deshacer.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <RequestForm action={cancelRequest} request={request} label="Sí, cancelar el trámite" pendingLabel="Cancelando…" className={dangerButton} />
        <Link href={path} className={secondaryButton}>
          No, conservar el trámite
        </Link>
      </div>
    </section>
  );
}

/** Trámites del registro que el portal no puede consultar. Sin datos del trámite: solo folio y fecha de registro. */
export function LockedList({ requests }: { requests: LockedRequest[] }) {
  return (
    <ul className="mt-4 grid gap-4">
      {requests.map((request) => (
        <li key={request.id} className="rounded-lg border border-line bg-canvas p-4">
          <h3 className="text-lg font-semibold">Necesita un permiso nuevo</h3>
          <p className="mt-1 text-sm">Trámite registrado en este portal el {formatDateTime(request.registeredAt)}.</p>
          <p className="mt-1 text-sm text-muted">
            Folio: <span className="font-mono break-all select-all">{request.id}</span>
          </p>
          <p className="mt-2 text-sm text-muted">
            El permiso del portal para consultarlo venció. {OTHER_CHANNELS}
          </p>
        </li>
      ))}
    </ul>
  );
}
