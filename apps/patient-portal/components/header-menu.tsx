"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";

const icon = {
  "aria-hidden": true,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
} as const;

/**
 * Navegación principal del encabezado. En pantallas de teléfono la lista se pliega tras «Menú»,
 * un `<details>` nativo: se abre con un toque, con Intro o con Espacio, también sin JavaScript.
 * Desde 640 px de ancho el botón desaparece y la lista queda siempre visible.
 */
export function HeaderMenu({ children }: { children: ReactNode }) {
  const toggle = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();

  // El encabezado persiste entre páginas, así que al cambiar de página hay que plegar el menú.
  useEffect(() => {
    if (toggle.current) toggle.current.open = false;
  }, [pathname]);

  // Cubre el enlace a la página que ya está abierta, donde la ruta no cambia.
  function closeOnLink(event: MouseEvent<HTMLElement>) {
    if (toggle.current && (event.target as Element).closest("a")) toggle.current.open = false;
  }

  return (
    <>
      <details ref={toggle} className="group peer sm:hidden">
        <summary className="-mr-3 block cursor-pointer list-none rounded-lg font-semibold text-brand -outline-offset-3 select-none hover:bg-brand-soft [&::-webkit-details-marker]:hidden">
          {/* El contenido se alinea en un span: algunos navegadores no aplican flex a summary. */}
          <span className="flex min-h-11 min-w-11 items-center gap-2 px-3">
            <svg {...icon} className="size-5 group-open:hidden">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
            <svg {...icon} className="hidden size-5 group-open:block">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
            Menú
          </span>
        </summary>
      </details>
      <nav
        aria-label="Principal"
        onClick={closeOnLink}
        className="hidden basis-full peer-open:block sm:block sm:basis-auto"
      >
        {children}
      </nav>
    </>
  );
}
