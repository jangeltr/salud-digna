import "server-only";
import { getClinic, getStudy, type Clinic, type Study } from "@/lib/api/catalog";
import { listAppointments, type Appointment, type RequestSnapshot } from "@/lib/api/requests";

export type Selections = { study?: Study; clinic?: Clinic };

/** Nombres y precio de lo ya elegido. Si un registro dejó de estar disponible, queda sin detalle. */
export async function loadSelections(context: RequestSnapshot["context"]): Promise<Selections> {
  const [study, clinic] = await Promise.all([
    context.studyId ? getStudy(context.studyId) : undefined,
    context.clinicId ? getClinic(context.clinicId) : undefined,
  ]);
  return { study: study?.ok ? study.data : undefined, clinic: clinic?.ok ? clinic.data : undefined };
}

const APPOINTMENT_PAGES = 3;

/**
 * Busca la cita de un trámite confirmado. El contrato no ofrece esa consulta directa,
 * así que se recorre el listado de citas propias y se compara `requestId`.
 */
export async function findAppointment(token: string, requestId: string): Promise<Appointment | undefined> {
  for (let page = 1; page <= APPOINTMENT_PAGES; page++) {
    const result = await listAppointments(token, page, 100);
    if (!result.ok) return undefined;
    const match = result.data.items.find((appointment) => appointment.requestId === requestId);
    if (match || !result.data.hasMore) return match;
  }
  return undefined;
}
