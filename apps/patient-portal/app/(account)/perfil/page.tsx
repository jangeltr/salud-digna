import type { Metadata } from "next";
import { ServiceUnavailable } from "@/components/service-unavailable";
import { ProfileSummary } from "@/features/auth/profile-summary";
import { SignOutForm } from "@/features/auth/sign-out-form";
import { requireAccount } from "@/lib/session/session";

export const metadata: Metadata = { title: "Perfil" };

export default async function ProfilePage() {
  const patient = await requireAccount();
  if (!patient) return <ServiceUnavailable />;

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Perfil</h1>
      <p className="mt-2 text-muted">Estos son los datos de tu cuenta. Por ahora solo se pueden consultar.</p>
      <ProfileSummary patient={patient} />
      <div className="mt-6">
        <SignOutForm />
      </div>
    </>
  );
}
