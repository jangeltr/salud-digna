"use client";

import { PageFrame } from "@/components/page-frame";

type ErrorPageProps = {
  /** No se muestra ni se registra: en producción solo trae un mensaje genérico y un identificador. */
  error: unknown;
  retry: () => void;
};

/**
 * Página de error del portal. No da detalles técnicos: solo permite reintentar o volver al inicio.
 * Sustituye al marco de los grupos de rutas, así que trae el suyo.
 */
export default function ErrorPage({ retry }: ErrorPageProps) {
  return (
    <PageFrame>
      <div role="alert">
        <h1 className="text-2xl font-bold tracking-tight">Algo salió mal</h1>
        <p className="mt-2 text-muted">No pudimos mostrar esta página. Inténtalo de nuevo en unos minutos.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => retry()}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand px-4 font-semibold text-canvas hover:bg-brand-strong"
          >
            Reintentar
          </button>
          {/* Enlace normal, sin navegación de cliente, para cargar el inicio desde cero. */}
          <a
            href="/"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-canvas px-4 font-semibold text-brand hover:bg-brand-soft"
          >
            Volver al inicio
          </a>
        </div>
      </div>
    </PageFrame>
  );
}
