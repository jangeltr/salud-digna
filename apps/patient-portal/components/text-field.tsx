import type { InputHTMLAttributes } from "react";

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "name"> & {
  name: string;
  label: string;
  hint?: string;
  error?: string;
};

export function TextField({ name, label, hint, error, required, ...input }: TextFieldProps) {
  const hintId = hint ? `${name}-hint` : undefined;
  const errorId = error ? `${name}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div>
      <label htmlFor={name} className="block text-sm font-semibold">
        {label}
        {required ? null : <span className="font-normal text-muted"> (opcional)</span>}
      </label>
      <input
        {...input}
        id={name}
        name={name}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className="mt-1 block min-h-11 w-full rounded-lg border border-line bg-canvas px-3 text-base text-ink aria-[invalid=true]:border-danger"
      />
      {hint ? (
        <p id={hintId} className="mt-1 text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="mt-1 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
