import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignInForm } from "@/features/auth/sign-in-form";
import { safeDestination } from "@/lib/session/routes";
import { hasSessionCookie } from "@/lib/session/session";
import { isRegistrationEnabled } from "@/lib/settings";

export const metadata: Metadata = { title: "Acceso" };

export default async function SignInPage({ searchParams }: PageProps<"/acceso">) {
  const params = await searchParams;
  const destination = safeDestination(params.destino);
  const accountCreated = params.cuenta === "creada";

  // Con sesión abierta no hay nada que hacer aquí. Sin JavaScript, las páginas de catálogo muestran
  // «Acceso» aunque haya sesión: este paso lleva al paciente a su destino. La página de destino
  // valida la sesión y, si venció, la cierra y vuelve aquí sin cookie.
  if (await hasSessionCookie()) redirect(destination);

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-bold tracking-tight">Acceso</h1>
      <p className="mt-2 text-muted">Entra con el correo y la contraseña de tu cuenta.</p>
      {accountCreated ? (
        <p role="status" className="mt-4 rounded-lg border border-success/30 bg-success-soft px-3 py-2 text-sm font-medium text-success">
          Tu cuenta se creó. Inicia sesión para continuar.
        </p>
      ) : null}
      <SignInForm destination={destination} />
      {isRegistrationEnabled() ? (
        <p className="mt-6 text-sm text-muted">
          ¿Aún no tienes cuenta?{" "}
          <Link href="/registro" className="inline-flex min-h-11 items-center font-semibold text-brand underline underline-offset-4">
            Crear cuenta
          </Link>
        </p>
      ) : null}
    </div>
  );
}
