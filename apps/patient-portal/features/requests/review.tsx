import Link from "next/link";
import type { ReactNode } from "react";
import { formatPrice } from "@/features/catalog/params";
import type { Appointment, RequestSnapshot } from "@/lib/api/requests";
import { confirmAppointment, saveNotes } from "./actions";
import { AssistanceForm } from "./assistance-form";
import type { Selections } from "./data";
import { RequestForm } from "./parts";
import { formatDateTime } from "./schedule";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm font-semibold text-muted">{label}</dt>
      <dd className="sm:col-span-2">{children}</dd>
    </div>
  );
}

/** Resumen de lo elegido. Sirve para la revisión y para la cita confirmada. */
export function Summary({ request, selections }: { request: RequestSnapshot; selections: Selections }) {
  const { study, clinic } = selections;
  const { scheduledAt, notes } = request.context;

  return (
    <dl className="mt-4 divide-y divide-line rounded-lg border border-line bg-canvas px-4">
      <Row label="Estudio">{study?.name ?? "Estudio no disponible"}</Row>
      <Row label="Clínica">
        {clinic ? (
          <>
            {clinic.name}
            <span className="block text-sm text-muted">
              {clinic.address}. {clinic.city}, {clinic.state}
            </span>
          </>
        ) : (
          "Clínica no disponible"
        )}
      </Row>
      <Row label="Fecha y hora">
        {scheduledAt ? formatDateTime(scheduledAt) : "Sin elegir"}
        <span className="block text-sm text-muted">Hora del centro de México. Horarios de demostración.</span>
      </Row>
      <Row label="Precio">{study ? formatPrice(study.price) : "No disponible"}</Row>
      {notes ? <Row label="Nota">{notes}</Row> : null}
    </dl>
  );
}

export function ReviewStep({ request, selections }: { request: RequestSnapshot; selections: Selections }) {
  return (
    <section aria-labelledby="paso-revision">
      <h2 id="paso-revision" className="mt-6 text-xl font-semibold">
        Revisa tu cita
      </h2>
      <Summary request={request} selections={selections} />

      <RequestForm action={saveNotes} request={request} label="Guardar nota" secondary>
        <label htmlFor="notes" className="mt-6 block text-sm font-semibold">
          Nota para la clínica <span className="font-normal text-muted">(opcional)</span>
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          maxLength={500}
          defaultValue={request.context.notes ?? ""}
          aria-describedby="notes-hint"
          className="mt-1 block w-full rounded-lg border border-line bg-canvas px-3 py-2 text-base text-ink"
        />
        <p id="notes-hint" className="mt-1 mb-3 text-sm text-muted">
          Máximo 500 caracteres. No incluyas datos clínicos, diagnósticos ni resultados.
        </p>
      </RequestForm>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <div className="rounded-lg border border-line bg-canvas p-4">
          <h3 className="font-semibold">Confirmar por mi cuenta</h3>
          <p className="mt-1 mb-3 text-sm text-muted">Si todo es correcto, confirma la cita ahora.</p>
          <RequestForm action={confirmAppointment} request={request} label="Confirmar mi cita" pendingLabel="Confirmando…" />
        </div>
        <div className="rounded-lg border border-line bg-canvas p-4">
          <h3 className="font-semibold">Terminar con un asesor</h3>
          <p className="mt-1 mb-3 text-sm text-muted">
            Genera un código y díctalo al asesor del Call Center. Verá tu avance y podrá confirmar la cita contigo.
          </p>
          <AssistanceForm requestId={request.id} />
        </div>
      </div>
    </section>
  );
}

type ConfirmedProps = {
  request: RequestSnapshot;
  selections: Selections;
  appointment?: Appointment;
};

export function ConfirmedStep({ request, selections, appointment }: ConfirmedProps) {
  return (
    <section aria-labelledby="cita-confirmada">
      <h2 id="cita-confirmada" className="mt-6 text-xl font-semibold text-success">
        Cita confirmada
      </h2>
      <Summary request={request} selections={selections} />
      <p className="mt-6">
        <Link
          href={appointment ? `/citas/${appointment.id}` : "/citas"}
          prefetch={false}
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand px-4 font-semibold text-canvas hover:bg-brand-strong"
        >
          {appointment ? "Ver el detalle de la cita" : "Ver mis citas"}
        </Link>
      </p>
    </section>
  );
}
