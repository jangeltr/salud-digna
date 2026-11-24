type ServiceUnavailableProps = {
  /** Ruta interna que vuelve a cargar la misma vista. */
  retryHref?: string;
};

export function ServiceUnavailable({ retryHref }: ServiceUnavailableProps) {
  return (
    <div role="alert">
      <h1 className="text-2xl font-bold tracking-tight">Servicio no disponible</h1>
      <p className="mt-2 text-muted">No pudimos conectar con el servicio. Inténtalo de nuevo en unos minutos.</p>
      {retryHref ? (
        <p className="mt-4">
          {/* Enlace normal, sin navegación de cliente, para repetir la petición completa. */}
          <a
            href={retryHref}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-canvas px-4 font-semibold text-brand hover:bg-brand-soft"
          >
            Reintentar
          </a>
        </p>
      ) : null}
    </div>
  );
}
