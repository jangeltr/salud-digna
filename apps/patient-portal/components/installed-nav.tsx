import { NavLink } from "@/components/nav-link";

const items = [
  { href: "/mi-espacio", label: "Inicio" },
  { href: "/continuar", label: "Continuar" },
  { href: "/citas", label: "Citas" },
  { href: "/ayuda", label: "Ayuda" },
];

export function InstalledNav() {
  return (
    <nav
      aria-label="Aplicación"
      className="safe-bottom sticky bottom-0 z-40 hidden border-t border-line bg-canvas standalone:block"
    >
      <ul className="safe-x mx-auto flex max-w-3xl">
        {items.map(({ href, label }) => (
          <li key={href} className="flex-1">
            <NavLink
              href={href}
              prefetch={false}
              className="flex min-h-14 items-center justify-center border-t-2 border-transparent px-1 text-sm font-medium text-muted [&[aria-current]]:border-brand [&[aria-current]]:font-semibold [&[aria-current]]:text-brand"
            >
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
