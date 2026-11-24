import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ServiceUnavailable } from "@/components/service-unavailable";
import { isUuid, readPage, readText } from "@/features/catalog/params";
import { pauseAndLeave } from "@/features/requests/actions";
import { findAppointment, loadSelections } from "@/features/requests/data";
import {
  AccessExpired,
  CancelSection,
  ContinuitySection,
  OtherChannelStep,
  PendingConfirmationStep,
  SubmitStep,
} from "@/features/requests/handoff";
import { NoticeBanner, Progress, RequestForm } from "@/features/requests/parts";
import { ClinicPicker, SlotPicker, StudyPicker } from "@/features/requests/pickers";
import { ConfirmedStep, ReviewStep } from "@/features/requests/review";
import { continuityNotice, flowSteps, isOpen, readEditable, readNotice, type Editable } from "@/features/requests/steps";
import { requestCapabilities, requestQuery } from "@/lib/composition";
import { expireSession, requireAccount } from "@/lib/session/session";

export const metadata: Metadata = { title: "Trámite" };

const EDIT_WARNINGS: Record<Editable, string> = {
  estudio: "Si cambias el estudio se borran la clínica y el horario que elegiste.",
  clinica: "Si cambias la clínica se borra el horario que elegiste.",
  horario: "Al elegir otro horario se sustituye el que tenías.",
};

// Sin horario, cambiar un dato solo afecta a la clínica.
const EDIT_WARNINGS_WITHOUT_SLOT: Record<Editable, string> = {
  estudio: "Si cambias el estudio se borra la clínica que elegiste.",
  clinica: "Al elegir otra clínica se sustituye la que tenías.",
  horario: "",
};

const historyLink = "inline-flex min-h-11 items-center font-semibold text-brand underline underline-offset-4";

export default async function RequestPage({ params, searchParams }: PageProps<"/tramite/[id]">) {
  const { id } = await params;
  // Un identificador que no es UUID nunca llega al servicio.
  if (!isUuid(id)) notFound();

  const path = `/tramite/${id}`;
  // La sesión y el trámite se leen a la vez. El perfil se pide una sola vez por petición:
  // la sesión y el adaptador del trámite comparten la misma lectura.
  const [account, result] = await Promise.all([requireAccount(), requestQuery.getRequest(id)]);
  if (!account) return <ServiceUnavailable retryHref={path} />;

  if (!result.ok) {
    if (result.error.kind === "session") await expireSession();
    // «No encontrado» cubre por igual el trámite inexistente y el de otro paciente.
    if (result.error.kind === "not-found" || result.error.kind === "invalid") notFound();
    if (result.error.kind === "access-expired") {
      return (
        <>
          <h1 className="text-2xl font-bold tracking-tight">Trámite de agendamiento</h1>
          <AccessExpired requestId={id} />
        </>
      );
    }
    return <ServiceUnavailable retryHref={path} />;
  }

  const request = result.data;
  const query = await searchParams;
  const notice = readNotice(query.aviso);
  const open = isOpen(request);
  const capabilities = requestCapabilities;
  // La pantalla la deciden el estado y el paso del trámite. `cambiar` solo abre el selector de un dato ya elegido.
  const editing = readEditable(query.cambiar, request);
  const view = editing ?? (open ? request.step : request.status);
  const filters = {
    q: readText(query.q),
    city: readText(query.ciudad),
    page: readPage(query.pagina),
    day: readText(query.dia),
  };
  // El estudio y la clínica salen del índice del catálogo; la cita solo se busca si el trámite terminó.
  const [selections, appointment] = await Promise.all([
    loadSelections(request.selections),
    view === "completed" ? findAppointment(id) : undefined,
  ]);
  const continuity = continuityNotice(request);
  const chosen = [selections.study?.name, selections.clinic?.name].filter(Boolean).join(" · ");
  const warnings = capabilities.slot ? EDIT_WARNINGS : EDIT_WARNINGS_WITHOUT_SLOT;
  // Sin confirmación directa, la revisión termina al enviarla: después solo queda esperar a otro canal.
  const waiting = !capabilities.patientConfirmation && request.status === "pending-confirmation";
  const cancelling = capabilities.cancellation && open && query.cancelar === "1";

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Trámite de agendamiento</h1>
      {notice ? <NoticeBanner notice={notice} /> : null}
      {continuity ? (
        <p role="status" className="mt-4 rounded-lg border border-line bg-brand-soft px-3 py-2 text-sm font-medium text-brand-strong">
          {continuity} Puedes seguir desde aquí.
        </p>
      ) : null}
      {open ? <Progress request={request} steps={flowSteps(capabilities)} editing={editing} /> : null}
      {open && chosen && view !== "review" ? <p className="mt-3 text-sm text-muted">Llevas elegido: {chosen}</p> : null}
      {editing ? (
        <p role="alert" className="mt-4 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-sm font-medium text-warning">
          {warnings[editing]}{" "}
          <Link href={path} className="font-semibold underline underline-offset-4">
            Conservar lo que tengo
          </Link>
        </p>
      ) : null}

      {view === "study" || view === "estudio" ? (
        <StudyPicker request={request} editing={editing} filters={filters} />
      ) : view === "clinic" || view === "clinica" ? (
        <ClinicPicker request={request} editing={editing} filters={filters} />
      ) : view === "datetime" || view === "horario" ? (
        capabilities.slot ? (
          <SlotPicker request={request} editing={editing} filters={filters} />
        ) : (
          <OtherChannelStep requestId={request.id} />
        )
      ) : view === "review" ? (
        capabilities.patientConfirmation ? (
          <ReviewStep request={request} selections={selections} />
        ) : waiting ? (
          <PendingConfirmationStep request={request} selections={selections} />
        ) : (
          <SubmitStep request={request} selections={selections} />
        )
      ) : view === "completed" ? (
        <ConfirmedStep
          request={request}
          selections={selections}
          appointment={appointment}
          showSchedule={capabilities.slot}
        />
      ) : (
        <section>
          <h2 className="mt-6 text-xl font-semibold">Trámite cerrado</h2>
          <p className="mt-2 text-muted">Este trámite ya no admite cambios.</p>
          <p className="mt-4">
            <Link href="/estudios" className="inline-flex min-h-11 items-center font-semibold text-brand underline underline-offset-4">
              Buscar un estudio
            </Link>
          </p>
        </section>
      )}

      {capabilities.history ? (
        <p className="mt-6">
          <Link href={`${path}/historial`} prefetch={false} className={historyLink}>
            Ver el historial del trámite
          </Link>
        </p>
      ) : null}

      {open && capabilities.pause ? (
        <div className="mt-10 border-t border-line pt-6">
          <RequestForm action={pauseAndLeave} request={request} label="Guardar y continuar después" secondary />
          <p className="mt-2 text-sm text-muted">Tu avance queda guardado. Podrás retomarlo aquí, por WhatsApp o con un asesor.</p>
        </div>
      ) : null}

      {open && capabilities.continuityCodes && request.selections.studyId ? (
        <ContinuitySection requestId={request.id} />
      ) : null}

      {open && capabilities.cancellation ? (
        <div className="mt-10 border-t border-line pt-6">
          <CancelSection request={request} confirming={cancelling} />
        </div>
      ) : null}
    </>
  );
}
