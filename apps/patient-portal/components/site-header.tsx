import Link from "next/link";
import { NavLink } from "@/components/nav-link";
import { APP_NAME } from "@/lib/brand";
import { hasSessionCookie } from "@/lib/session/session";

const linkClass =
  "flex min-h-11 min-w-11 items-center px-3 font-medium text-muted underline-offset-8 hover:text-brand [&[aria-current]]:font-semibold [&[aria-current]]:text-brand [&[aria-current]]:underline";

export async function SiteHeader() {
  // Solo mira si la cookie existe. La validez se comprueba al entrar a una ruta protegida.
  const signedIn = await hasSessionCookie();

  return (
    <header className="border-b border-line bg-canvas">
      <div className="safe-x mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-4">
        <Link href="/" className="flex min-h-11 items-center text-lg font-bold text-brand">
          {APP_NAME}
        </Link>
        <nav aria-label="Principal" className="standalone:hidden">
          <ul className="-mx-3 flex">
            <li>
              <NavLink href="/estudios" className={linkClass}>
                Estudios
              </NavLink>
            </li>
            <li>
              <NavLink href="/clinicas" className={linkClass}>
                Clínicas
              </NavLink>
            </li>
            <li>
              {signedIn ? (
                <NavLink href="/mi-espacio" prefetch={false} className={linkClass}>
                  Mi espacio
                </NavLink>
              ) : (
                <NavLink href="/acceso" className={linkClass}>
                  Acceso
                </NavLink>
              )}
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
