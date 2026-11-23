import Link from "next/link";
import type { ReactNode } from "react";
import { SubmitButton } from "@/components/submit-button";
import type { RequestSnapshot } from "@/lib/api/requests";
import { STEPS, type Notice } from "./steps";

const TONES = {
  success: "border-success/30 bg-success-soft text-success",
  warning: "border-warning/30 bg-warning-soft text-warning",
  danger: "border-danger/30 bg-danger-soft text-danger",
} as const;

export function NoticeBanner({ notice }: { notice: Notice }) {
  return (
    <p
      role={notice.tone === "success" ? "status" : "alert"}
      className={`mt-4 rounded-lg border px-3 py-2 text-sm font-medium ${TONES[notice.tone]}`}
    >
      {notice.text}
    </p>
  );
}

export const secondaryButton =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-canvas px-4 font-semibold text-brand hover:bg-brand-soft disabled:opacity-70";

type RequestFormProps = {
  action: (formData: FormData) => Promise<void>;
  request: RequestSnapshot;
  /** Campos ocultos adicionales, como el estudio o el horario elegido. */
  values?: Record<string, string>;
  label: string;
  pendingLabel?: string;
  secondary?: boolean;
  children?: ReactNode;
};

/** Formulario de una acción de servidor sobre el trámite. Envía siempre la versión que mostró la API. */
export function RequestForm({ action, request, values, label, pendingLabel, secondary, children }: RequestFormProps) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={request.id} />
      <input type="hidden" name="version" value={request.version} />
      {Object.entries(values ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      <SubmitButton pendingLabel={pendingLabel ?? "Guardando…"} className={secondary ? secondaryButton : undefined}>
        {label}
      </SubmitButton>
    </form>
  );
}

/** Indicador de avance. El paso actual lo decide la API: los anteriores enlazan a su cambio. */
export function Progress({ request, editing }: { request: RequestSnapshot; editing?: string }) {
  const currentIndex = STEPS.findIndex((item) => item.step === request.currentStep);

  return (
    <nav aria-label="Avance del trámite" className="mt-4">
      <ol className="flex flex-wrap gap-2 text-sm">
        {STEPS.map((item, index) => {
          const done = currentIndex === -1 || index < currentIndex;
          const current = index === currentIndex && !editing;
          const base = "inline-flex min-h-11 items-center rounded-lg border px-3 font-medium";

          return (
            <li key={item.step}>
              {done && item.editable ? (
                <Link
                  href={`/tramite/${request.id}?cambiar=${item.editable}`}
                  aria-current={editing === item.editable ? "step" : undefined}
                  className={`${base} border-line bg-canvas text-brand underline-offset-4 hover:underline aria-[current]:border-brand aria-[current]:bg-brand-soft`}
                >
                  {index + 1}. {item.label}
                  <span className="sr-only"> (completado, cambiar)</span>
                </Link>
              ) : (
                <span
                  aria-current={current ? "step" : undefined}
                  className={`${base} ${current ? "border-brand bg-brand-soft font-semibold text-brand-strong" : "border-line text-muted"}`}
                >
                  {index + 1}. {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
