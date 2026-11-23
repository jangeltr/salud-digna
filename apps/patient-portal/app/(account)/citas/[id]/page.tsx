import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/page-placeholder";
import { ServiceUnavailable } from "@/components/service-unavailable";
import { requireAccount } from "@/lib/session/session";

export const metadata: Metadata = { title: "Detalle de la cita" };

export default async function AppointmentDetailPage() {
  if (!(await requireAccount())) return <ServiceUnavailable />;

  return <PagePlaceholder title="Detalle de la cita" />;
}
