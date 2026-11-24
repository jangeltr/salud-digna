import type { Clinic } from "@/lib/domain/model";

/** Los textos del catálogo se muestran como texto: React los escapa. */
export function ClinicCard({ clinic }: { clinic: Clinic }) {
  return (
    <li className="rounded-lg border border-line bg-canvas p-4">
      <h2 className="text-lg font-semibold">{clinic.name}</h2>
      <p className="mt-1 text-sm text-muted">{clinic.address}</p>
      <p className="mt-1 text-sm">
        {clinic.city}, {clinic.state}
      </p>
    </li>
  );
}
