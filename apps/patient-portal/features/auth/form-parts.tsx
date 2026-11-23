export function FormMessage({ message }: { message?: string }) {
  // La región existe siempre para que el lector de pantalla anuncie los cambios.
  return (
    <div role="alert" aria-live="assertive">
      {message ? (
        <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
          {message}
        </p>
      ) : null}
    </div>
  );
}

export function SubmitButton({ pending, children }: { pending: boolean; children: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-brand px-4 font-semibold text-canvas hover:bg-brand-strong disabled:opacity-70"
    >
      {pending ? "Enviando…" : children}
    </button>
  );
}
