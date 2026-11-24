import Link from "next/link";
import { generalData, requestCapabilities } from "@/lib/composition";
import type { BookingRequest } from "@/lib/domain/model";
import { continueRequest } from "./actions";
import { RequestForm } from "./parts";
import { lastActivity, statusName, stepLabel } from "./steps";

/**
 * Trámites abiertos del paciente. Con pausa, «Continuar» registra la reanudación antes de abrir el trámite.
 * Sin ella no hay nada que registrar: es un enlace al trámite.
 */
export async function PendingList({ requests }: { requests: BookingRequest[] }) {
  const studies = await Promise.all(
    requests.map((request) => (request.selections.studyId ? generalData.getStudy(request.selections.studyId) : undefined)),
  );

  return (
    <ul className="mt-4 grid gap-4">
      {requests.map((request, index) => {
        const study = studies[index];
        // Cuando el paciente no confirma por su cuenta, «pendiente de confirmación» ya no espera nada de él.
        const waiting = !requestCapabilities.patientConfirmation && request.status === "pending-confirmation";
        return (
          <li key={request.id} className="rounded-lg border border-line bg-canvas p-4">
            <h3 className="text-lg font-semibold">{study?.ok ? study.data.name : "Trámite sin estudio elegido"}</h3>
            <p className="mt-1 text-sm">
              {waiting ? `Estado: ${statusName(request.status)}` : `Siguiente paso: ${stepLabel(request.step)}`}
            </p>
            <p className="mt-1 mb-3 text-sm text-muted">{lastActivity(request)}</p>
            {requestCapabilities.pause ? (
              <RequestForm action={continueRequest} request={request} label="Continuar este trámite" pendingLabel="Abriendo…" />
            ) : (
              <Link
                href={`/tramite/${request.id}`}
                prefetch={false}
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand px-4 font-semibold text-canvas hover:bg-brand-strong"
              >
                {waiting ? "Ver este trámite" : "Continuar este trámite"}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
