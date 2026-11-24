import Link from "next/link";
import { ServiceUnavailable } from "@/components/service-unavailable";
import { searchClinics } from "@/features/catalog/clinics";
import { EmptyState } from "@/features/catalog/empty-state";
import { Pagination } from "@/features/catalog/pagination";
import { PAGE_SIZE, formatPrice, listHref } from "@/features/catalog/params";
import { SearchForm } from "@/features/catalog/search-form";
import { generalData } from "@/lib/composition";
import type { BookingRequest } from "@/lib/domain/model";
import { chooseClinic, chooseSlot, chooseStudy } from "./actions";
import { RequestForm } from "./parts";
import { listDays } from "./schedule";
import type { Editable } from "./steps";

type PickerProps = {
  request: BookingRequest;
  /** Dato que se está cambiando, si el paciente volvió a un paso anterior. */
  editing?: Editable;
  filters: { q: string; city: string; page: number; day: string };
};

function hrefFor(request: BookingRequest, editing: Editable | undefined, filters: Record<string, string | number | undefined>) {
  return listHref(`/tramite/${request.id}`, { cambiar: editing, ...filters });
}

export async function StudyPicker({ request, editing, filters }: PickerProps) {
  const { q, page } = filters;
  const retry = hrefFor(request, editing, { q, pagina: page });
  const result = await generalData.listStudies({ page, limit: PAGE_SIZE, search: q || undefined });
  if (!result.ok) return <ServiceUnavailable retryHref={retry} />;

  const { items, hasMore } = result.data;

  return (
    <section aria-labelledby="paso-estudio">
      <h2 id="paso-estudio" className="mt-6 text-xl font-semibold">
        Elige un estudio
      </h2>
      <SearchForm
        action={`/tramite/${request.id}`}
        label="Buscar estudios"
        hidden={{ cambiar: editing }}
        fields={[{ name: "q", label: "Nombre del estudio", defaultValue: q }]}
      />
      {items.length > 0 ? (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {items.map((study) => (
            <li key={study.id} className="flex flex-col rounded-lg border border-line bg-canvas p-4">
              <h3 className="text-lg font-semibold">{study.name}</h3>
              {study.description ? <p className="mt-1 text-sm text-muted">{study.description}</p> : null}
              <p className="mt-2 font-semibold">{formatPrice(study.price)}</p>
              <div className="mt-3">
                {study.id === request.selections.studyId ? (
                  <p className="text-sm font-semibold text-success">Estudio elegido</p>
                ) : (
                  <RequestForm action={chooseStudy} request={request} values={{ studyId: study.id }} label="Elegir este estudio" />
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState resetHref={hrefFor(request, editing, {})} resetLabel="Ver todos los estudios">
          No encontramos estudios con esa búsqueda.
        </EmptyState>
      )}
      <Pagination page={page} hasMore={hasMore} hrefFor={(target) => hrefFor(request, editing, { q, pagina: target })} />
    </section>
  );
}

export async function ClinicPicker({ request, editing, filters }: PickerProps) {
  const { q, city, page } = filters;
  const retry = hrefFor(request, editing, { q, ciudad: city, pagina: page });
  const result = await searchClinics({ q, city, page });
  if (!result.ok) return <ServiceUnavailable retryHref={retry} />;

  return (
    <section aria-labelledby="paso-clinica">
      <h2 id="paso-clinica" className="mt-6 text-xl font-semibold">
        Elige una clínica
      </h2>
      <SearchForm
        action={`/tramite/${request.id}`}
        label="Buscar clínicas"
        hidden={{ cambiar: editing }}
        fields={[
          { name: "q", label: "Nombre de la clínica", defaultValue: q },
          { name: "ciudad", label: "Ciudad", defaultValue: city },
        ]}
      />
      {result.items.length > 0 ? (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {result.items.map((clinic) => (
            <li key={clinic.id} className="flex flex-col rounded-lg border border-line bg-canvas p-4">
              <h3 className="text-lg font-semibold">{clinic.name}</h3>
              <p className="mt-1 text-sm text-muted">{clinic.address}</p>
              <p className="mt-1 text-sm">
                {clinic.city}, {clinic.state}
              </p>
              <div className="mt-3">
                {clinic.id === request.selections.clinicId ? (
                  <p className="text-sm font-semibold text-success">Clínica elegida</p>
                ) : (
                  <RequestForm action={chooseClinic} request={request} values={{ clinicId: clinic.id }} label="Elegir esta clínica" />
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState resetHref={hrefFor(request, editing, {})} resetLabel="Ver todas las clínicas">
          No encontramos clínicas con esos filtros.
        </EmptyState>
      )}
      <Pagination
        page={page}
        hasMore={result.hasMore}
        hrefFor={(target) => hrefFor(request, editing, { q, ciudad: city, pagina: target })}
      />
    </section>
  );
}

export function SlotPicker({ request, editing, filters }: PickerProps) {
  const days = listDays();
  const selected = days.find((day) => day.date === filters.day) ?? days[0];

  return (
    <section aria-labelledby="paso-horario">
      <h2 id="paso-horario" className="mt-6 text-xl font-semibold">
        Elige fecha y hora
      </h2>
      <p className="mt-2 inline-block rounded-lg border border-warning/30 bg-warning-soft px-3 py-1 text-sm font-semibold text-warning">
        Horarios de demostración
      </p>
      <p className="mt-2 text-sm text-muted">
        No reflejan la disponibilidad real de la clínica. Hora del centro de México.
      </p>
      {selected ? (
        <>
          <nav aria-label="Días disponibles" className="mt-4">
            <ul className="flex flex-wrap gap-2">
              {days.map((day) => (
                <li key={day.date}>
                  <Link
                    href={hrefFor(request, editing, { dia: day.date })}
                    aria-current={day.date === selected.date ? "date" : undefined}
                    className="inline-flex min-h-11 items-center rounded-lg border border-line bg-canvas px-3 text-sm font-medium text-ink hover:bg-brand-soft aria-[current]:border-brand aria-[current]:bg-brand-soft aria-[current]:font-semibold aria-[current]:text-brand-strong"
                  >
                    {day.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <h3 className="mt-6 font-semibold">Horarios del {selected.label}</h3>
          <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {selected.slots.map((slot) => (
              <li key={slot.value}>
                <RequestForm
                  action={chooseSlot}
                  request={request}
                  values={{ scheduledAt: slot.value }}
                  label={slot.time}
                  pendingLabel="…"
                  secondary
                />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <EmptyState>No hay horarios de demostración disponibles en este momento.</EmptyState>
      )}
    </section>
  );
}
