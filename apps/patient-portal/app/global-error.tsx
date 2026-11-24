"use client";

type GlobalErrorProps = {
  error: unknown;
  retry: () => void;
};

/**
 * Error en el diseño raíz. Sustituye al documento entero, así que trae sus propias etiquetas
 * y no carga los estilos del portal. Tampoco da detalles técnicos.
 */
export default function GlobalError({ retry }: GlobalErrorProps) {
  return (
    <html lang="es">
      <body>
        <main role="alert">
          <h1>Algo salió mal</h1>
          <p>No pudimos mostrar el portal. Inténtalo de nuevo en unos minutos.</p>
          <p>
            <button type="button" onClick={() => retry()}>
              Reintentar
            </button>
          </p>
          <p>
            <a href="/">Volver al inicio</a>
          </p>
        </main>
      </body>
    </html>
  );
}
