import Link from "next/link";
import { LinkPending } from "@/components/link-pending";
import { SearchForm } from "@/features/catalog/search-form";
import { APP_NAME } from "@/lib/brand";

const shortcuts = [
  { href: "/estudios", title: "Estudios", text: "Consulta los estudios disponibles y su precio." },
  { href: "/clinicas", title: "Clínicas", text: "Busca una clínica por nombre o por ciudad." },
];

export default function HomePage() {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">{APP_NAME}</h1>
      <p className="mt-2 text-muted">Busca un estudio para conocer su precio y agendarlo.</p>
      <SearchForm
        action="/estudios"
        label="Buscar estudios"
        fields={[{ name: "q", label: "Nombre del estudio", placeholder: "Por ejemplo, glucosa" }]}
      />
      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {shortcuts.map(({ href, title, text }) => (
          <li key={href} className="rounded-lg border border-line bg-canvas p-4">
            <h2 className="text-lg font-semibold">
              <Link href={href} className="inline-flex min-h-11 items-center text-brand underline-offset-4 hover:underline">
                {title}
                <LinkPending visible />
              </Link>
            </h2>
            <p className="mt-1 text-sm text-muted">{text}</p>
          </li>
        ))}
      </ul>
    </>
  );
}
