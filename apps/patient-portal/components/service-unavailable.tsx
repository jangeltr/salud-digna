export function ServiceUnavailable() {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Servicio no disponible</h1>
      <p className="mt-2 text-muted">
        No pudimos conectar con el servicio. Inténtalo de nuevo en unos minutos.
      </p>
    </>
  );
}
