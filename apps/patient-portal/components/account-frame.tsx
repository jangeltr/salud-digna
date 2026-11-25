import "server-only";
import type { ReactNode } from "react";
import { PageFrame } from "@/components/page-frame";
import { hasSessionCookie } from "@/lib/session/session";

/**
 * Marco de las páginas con sesión, que se generan en cada petición. El encabezado lo decide
 * el servidor, así que también se ve bien sin JavaScript. Solo mira si existe la cookie de sesión:
 * cada página valida la sesión por su cuenta.
 */
export async function AccountFrame({ children }: { children: ReactNode }) {
  return <PageFrame signedIn={await hasSessionCookie()}>{children}</PageFrame>;
}
