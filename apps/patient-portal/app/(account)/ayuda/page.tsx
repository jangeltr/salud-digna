import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata: Metadata = { title: "Ayuda" };

export default function HelpPage() {
  return <PagePlaceholder title="Ayuda" />;
}
