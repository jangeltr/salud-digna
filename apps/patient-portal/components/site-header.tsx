import Link from "next/link";
import { HeaderMenu } from "@/components/header-menu";
import { NavLink } from "@/components/nav-link";
import { APP_NAME } from "@/lib/brand";
import { hasSessionCookie } from "@/lib/session/session";

type Item = {
  href: string;
  label: string;
  /** Ruta con sesión. No se precarga, para no validar la sesión en cada precarga. */
  account?: boolean;
};

const CATALOG: Item[] = [
  { href: "/estudios", label: "Estudios" },
  { href: "/clinicas", label: "Clínicas" },
];

const SIGNED_OUT: Item[] = [...CATALOG, { href: "/acceso", label: "Acceso" }];

/** Con sesión, el encabezado da acceso a todas las secciones del área personal. */
const SIGNED_IN: Item[] = [
  ...CATALOG,
  { href: "/mi-espacio", label: "Mi espacio", account: true },
  { href: "/continuar", label: "Continuar", account: true },
  { href: "/citas", label: "Citas", account: true },
  { href: "/ayuda", label: "Ayuda", account: true },
  { href: "/perfil", label: "Perfil", account: true },
];

// El recuadro de foco va por dentro del enlace, para que la franja de prototipo no tape su borde superior.
const linkClass =
  "flex min-h-11 min-w-11 items-center px-3 font-medium text-muted -outline-offset-3 underline-offset-8 hover:text-brand [&[aria-current]]:font-semibold [&[aria-current]]:text-brand [&[aria-current]]:underline";

export async function SiteHeader() {
  // Solo mira si la cookie existe. La validez se comprueba al entrar a una ruta protegida.
  const signedIn = await hasSessionCookie();
  const items = signedIn ? SIGNED_IN : SIGNED_OUT;

  return (
    <header className="border-b border-line bg-canvas">
      <div className="safe-x mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-4">
        <Link href="/" className="flex min-h-11 items-center text-lg font-bold text-brand -outline-offset-3">
          {APP_NAME}
        </Link>
        <HeaderMenu>
          <ul className="-mx-3 flex flex-col border-t border-line py-2 sm:flex-row sm:flex-wrap sm:border-0 sm:py-0">
            {items.map(({ href, label, account }) => (
              <li key={href}>
                <NavLink href={href} prefetch={account ? false : undefined} className={linkClass}>
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </HeaderMenu>
      </div>
    </header>
  );
}
