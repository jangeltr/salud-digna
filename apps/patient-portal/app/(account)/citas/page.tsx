import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/page-placeholder";
import { ServiceUnavailable } from "@/components/service-unavailable";
import { requireAccount } from "@/lib/session/session";

export const metadata: Metadata = { title: "Citas" };

export default async function AppointmentsPage() {
  if (!(await requireAccount())) return <ServiceUnavailable />;

  return <PagePlaceholder title="Citas" />;
}
