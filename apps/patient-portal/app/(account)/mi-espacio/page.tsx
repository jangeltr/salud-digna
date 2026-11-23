import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata: Metadata = { title: "Mi espacio" };

export default function MySpacePage() {
  return <PagePlaceholder title="Mi espacio" />;
}
