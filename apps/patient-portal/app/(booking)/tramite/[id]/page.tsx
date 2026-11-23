import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ServiceUnavailable } from "@/components/service-unavailable";
import { isUuid, readPage, readText } from "@/features/catalog/params";
import { pauseAndLeave } from "@/features/requests/actions";
import { findAppointment, loadSelections } from "@/features/requests/data";
import { NoticeBanner, Progress, RequestForm } from "@/features/requests/parts";
import { ClinicPicker, SlotPicker, StudyPicker } from "@/features/requests/pickers";
import { ConfirmedStep, ReviewStep } from "@/features/requests/review";
import { continuityNotice, isOpen, readEditable, readNotice, type Editable } from "@/features/requests/steps";
import { getRequest } from "@/lib/api/requests";
import { expireSession, requireSession } from "@/lib/session/session";

export const metadata: Metadata = { title: "Trámite" };

const EDIT_WARNINGS: Record<Editable, string> = {
  estudio: "Si cambias el estudio se borran la clínica y el horario que elegiste.",
  clinica: "Si cambias la clínica se borra el horario que elegiste.",
  horario: "Al elegir otro horario se sustituye el que tenías.",
};

export default async function RequestPage({ params, searchParams }: PageProps<"/tramite/[id]">) {
  const { id } = await params;
  // Un identificador que no es UUID nunca llega a la API.
  if (!isUuid(id)) notFound();

  const path = `/tramite/${id}`;
  const session = await requireSession();
  if (!session) return <ServiceUnavailable retryHref={path} />;

  const result = await getRequest(session.token, id);
  if (!result.ok) {
    if (result.status === 401) await expireSession();
    // 404 cubre por igual el trámite inexistente y el de otro paciente.
    if (result.status === 404 || result.status === 400) notFound();
    return <ServiceUnavailable retryHref={path} />;
  }

  const request = result.data;
  const query = await searchParams;
  const notice = readNotice(query.aviso);
  const open = isOpen(request);
  // La pantalla la deciden `status` y `currentStep`. `cambiar` solo abre el selector de un dato ya elegido.
  const editing = readEditable(query.cambiar, request);
  const view = editing ?? (open ? request.currentStep : request.status);
  const filters = {
    q: readText(query.q),
    city: readText(query.ciudad),
    page: readPage(query.pagina),
    day: readText(query.dia),
  };
  const selections = await loadSelections(request.context);
  const continuity = continuityNotice(request);
  const chosen = [selections.study?.name, selections.clinic?.name].filter(Boolean).join(" · ");

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Trámite de agendamiento</h1>
      {notice ? <NoticeBanner notice={notice} /> : null}
      {continuity ? (
        <p role="status" className="mt-4 rounded-lg border border-line bg-brand-soft px-3 py-2 text-sm font-medium text-brand-strong">
          {continuity} Puedes seguir desde aquí.
        </p>
      ) : null}
      {open ? <Progress request={request} editing={editing} /> : null}
      {open && chosen && view !== "REVIEW" ? <p className="mt-3 text-sm text-muted">Llevas elegido: {chosen}</p> : null}
      {editing ? (
        <p role="alert" className="mt-4 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-sm font-medium text-warning">
          {EDIT_WARNINGS[editing]}{" "}
          <Link href={path} className="font-semibold underline underline-offset-4">
            Conservar lo que tengo
          </Link>
        </p>
      ) : null}

      {view === "SELECT_STUDY" || view === "estudio" ? (
        <StudyPicker request={request} editing={editing} filters={filters} />
      ) : view === "SELECT_CLINIC" || view === "clinica" ? (
        <ClinicPicker request={request} editing={editing} filters={filters} />
      ) : view === "SELECT_DATETIME" || view === "horario" ? (
        <SlotPicker request={request} editing={editing} filters={filters} />
      ) : view === "REVIEW" ? (
        <ReviewStep request={request} selections={selections} />
      ) : view === "COMPLETED" ? (
        <ConfirmedStep request={request} selections={selections} appointment={await findAppointment(session.token, id)} />
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

      {open ? (
        <div className="mt-10 border-t border-line pt-6">
          <RequestForm action={pauseAndLeave} request={request} label="Guardar y continuar después" secondary />
          <p className="mt-2 text-sm text-muted">Tu avance queda guardado. Podrás retomarlo aquí, por WhatsApp o con un asesor.</p>
        </div>
      ) : null}
    </>
  );
}
