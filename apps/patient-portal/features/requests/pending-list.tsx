import { getStudy } from "@/lib/api/catalog";
import type { RequestSnapshot } from "@/lib/api/requests";
import { continueRequest } from "./actions";
import { RequestForm } from "./parts";
import { channelName, stepLabel, timeAgo } from "./steps";

/** Trámites abiertos del paciente. «Continuar» registra la reanudación antes de abrir el trámite. */
export async function PendingList({ requests }: { requests: RequestSnapshot[] }) {
  const studies = await Promise.all(
    requests.map((request) => (request.context.studyId ? getStudy(request.context.studyId) : undefined)),
  );

  return (
    <ul className="mt-4 grid gap-4">
      {requests.map((request, index) => {
        const study = studies[index];
        return (
          <li key={request.id} className="rounded-lg border border-line bg-canvas p-4">
            <h3 className="text-lg font-semibold">{study?.ok ? study.data.name : "Trámite sin estudio elegido"}</h3>
            <p className="mt-1 text-sm">Siguiente paso: {stepLabel(request.currentStep)}</p>
            <p className="mt-1 mb-3 text-sm text-muted">
              Última actividad en {channelName(request.lastChannel)}, {timeAgo(request.updatedAt)}.
            </p>
            <RequestForm action={continueRequest} request={request} label="Continuar este trámite" pendingLabel="Abriendo…" />
          </li>
        );
      })}
    </ul>
  );
}
