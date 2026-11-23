import Link from "next/link";
import { NavLink } from "@/components/nav-link";
import { APP_NAME } from "@/lib/brand";

const links = [
  { href: "/estudios", label: "Estudios" },
  { href: "/clinicas", label: "Clínicas" },
  { href: "/acceso", label: "Acceso" },
];

export function SiteHeader() {
  return (
    <header className="border-b border-line bg-canvas">
      <div className="safe-x mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-4">
        <Link href="/" className="flex min-h-11 items-center text-lg font-bold text-brand">
          {APP_NAME}
        </Link>
        <nav aria-label="Principal" className="standalone:hidden">
          <ul className="-mx-3 flex">
            {links.map(({ href, label }) => (
              <li key={href}>
                <NavLink
                  href={href}
                  className="flex min-h-11 min-w-11 items-center px-3 font-medium text-muted underline-offset-8 hover:text-brand [&[aria-current]]:font-semibold [&[aria-current]]:text-brand [&[aria-current]]:underline"
                >
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
