import type { Patient } from "@/lib/domain/model";

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm font-semibold text-muted">{label}</dt>
      <dd className="sm:col-span-2">{value || "Sin registrar"}</dd>
    </div>
  );
}

/** Perfil del paciente, en solo lectura. El servicio no ofrece edición de perfil. */
export function ProfileSummary({ patient }: { patient: Patient }) {
  return (
    <dl className="mt-6 divide-y divide-line rounded-lg border border-line bg-canvas px-4">
      <Row label="Nombre" value={patient.firstName} />
      <Row label="Apellidos" value={patient.lastName} />
      <Row label="Correo de acceso" value={patient.email} />
      <Row label="Teléfono" value={patient.phone} />
    </dl>
  );
}
