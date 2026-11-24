export function PagePlaceholder({ title }: { title: string }) {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="mt-2 text-muted">Disponible en un paso posterior</p>
    </>
  );
}
