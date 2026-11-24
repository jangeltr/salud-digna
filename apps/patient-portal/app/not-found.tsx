import type { Metadata } from "next";
import Link from "next/link";
import { PageFrame } from "@/components/page-frame";

export const metadata: Metadata = { title: "Página no encontrada" };

// Se pinta dentro del diseño raíz, sin el marco de los grupos de rutas: trae el suyo.
export default function NotFound() {
  return (
    <PageFrame>
      <h1 className="text-2xl font-bold tracking-tight">Página no encontrada</h1>
      <p className="mt-2 text-muted">La dirección no existe en el portal.</p>
      <p className="mt-4">
        <Link href="/" className="inline-flex min-h-11 items-center font-semibold text-brand underline underline-offset-4">
          Volver al inicio
        </Link>
      </p>
    </PageFrame>
  );
}
