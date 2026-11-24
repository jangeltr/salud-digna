import "server-only";
import { generalData, requestQuery } from "@/lib/composition";
import type { Appointment, Clinic, Selections, Study } from "@/lib/domain/model";

/** Estudio y clínica ya elegidos, con sus datos de catálogo. */
export type SelectionDetails = { study?: Study; clinic?: Clinic };

/** Nombres y precio de lo ya elegido. Si un registro dejó de estar disponible, queda sin detalle. */
export async function loadSelections(selections: Selections): Promise<SelectionDetails> {
  const [study, clinic] = await Promise.all([
    selections.studyId ? generalData.getStudy(selections.studyId) : undefined,
    selections.clinicId ? generalData.getClinic(selections.clinicId) : undefined,
  ]);
  return { study: study?.ok ? study.data : undefined, clinic: clinic?.ok ? clinic.data : undefined };
}

/** Cita de un trámite confirmado. Si no se puede consultar, la pantalla enlaza al listado de citas. */
export async function findAppointment(requestId: string): Promise<Appointment | undefined> {
  const result = await requestQuery.getAppointment(requestId);
  return result.ok ? result.data : undefined;
}
