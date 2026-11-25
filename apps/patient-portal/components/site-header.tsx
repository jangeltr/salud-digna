"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { HeaderMenu } from "@/components/header-menu";
import { NavLink } from "@/components/nav-link";
import { APP_NAME } from "@/lib/brand";
import { hasSignedInCookie } from "@/lib/session/indicator";

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

// La cookie indicadora cambia solo al iniciar o cerrar sesión, y las dos cosas recargan la página.
const subscribe = () => () => undefined;
const readIndicator = () => hasSignedInCookie(document.cookie);

type SiteHeaderProps = {
  /**
   * Lo decide el servidor en las páginas que ya se generan en cada petición.
   * Sin valor, lo decide el navegador con la cookie indicadora: así las páginas de catálogo son
   * iguales para todos y se pueden servir desde caché. Sin JavaScript, esas páginas muestran «Acceso».
   */
  signedIn?: boolean;
};

export function SiteHeader({ signedIn }: SiteHeaderProps) {
  const fromCookie = useSyncExternalStore(subscribe, readIndicator, () => false);
  const items = (signedIn ?? fromCookie) ? SIGNED_IN : SIGNED_OUT;

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
