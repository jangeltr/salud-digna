import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Página no encontrada" };

export default function NotFound() {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Página no encontrada</h1>
      <p className="mt-2 text-muted">La dirección no existe en el portal.</p>
      <p className="mt-4">
        <Link href="/" className="inline-flex min-h-11 items-center font-semibold text-brand underline underline-offset-4">
          Volver al inicio
        </Link>
      </p>
    </>
  );
}
