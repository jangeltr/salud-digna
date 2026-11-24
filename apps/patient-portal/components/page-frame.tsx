import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";

type PageFrameProps = {
  /** Ver `SiteHeader`. Sin valor, el encabezado se decide en el navegador. */
  signedIn?: boolean;
  children: ReactNode;
};

/**
 * Encabezado y contenido de una página. No está en el diseño raíz: así las páginas de catálogo
 * no dependen de la cookie de sesión y pueden generarse una vez y servirse desde caché.
 */
export function PageFrame({ signedIn, children }: PageFrameProps) {
  return (
    <>
      <SiteHeader signedIn={signedIn} />
      <main id="contenido" tabIndex={-1} className="safe-x mx-auto w-full max-w-3xl flex-1 scroll-mt-12 py-8 outline-none">
        {children}
      </main>
    </>
  );
}
