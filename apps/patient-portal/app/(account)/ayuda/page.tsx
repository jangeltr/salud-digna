import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/page-placeholder";
import { ServiceUnavailable } from "@/components/service-unavailable";
import { requireAccount } from "@/lib/session/session";

export const metadata: Metadata = { title: "Ayuda" };

export default async function HelpPage() {
  if (!(await requireAccount())) return <ServiceUnavailable />;

  return <PagePlaceholder title="Ayuda" />;
}
