import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SignUpForm } from "@/features/auth/sign-up-form";
import { isRegistrationEnabled } from "@/lib/settings";

export const metadata: Metadata = { title: "Registro" };

export default function SignUpPage() {
  // Con `REGISTRATION_ENABLED` apagada esta página no existe.
  if (!isRegistrationEnabled()) notFound();

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-bold tracking-tight">Registro</h1>
      <p className="mt-2 text-muted">Crea tu cuenta de paciente. Usa solo datos sintéticos en este prototipo.</p>
      <SignUpForm />
      <p className="mt-6 text-sm text-muted">
        ¿Ya tienes cuenta?{" "}
        <Link href="/acceso" className="inline-flex min-h-11 items-center font-semibold text-brand underline underline-offset-4">
          Entrar
        </Link>
      </p>
    </div>
  );
}
