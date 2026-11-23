import { signOut } from "./actions";

export function SignOutForm() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-canvas px-4 font-semibold text-brand hover:bg-brand-soft"
      >
        Cerrar sesión
      </button>
    </form>
  );
}
