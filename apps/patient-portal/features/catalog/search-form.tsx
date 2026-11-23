import Form from "next/form";
import { SubmitButton } from "@/components/submit-button";
import { LIMITS } from "./params";

type Field = {
  name: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
};

type SearchFormProps = {
  action: string;
  /** Nombre accesible del formulario. */
  label: string;
  fields: Field[];
};

/** Formulario GET: los filtros viajan en la URL y funciona también sin JavaScript. */
export function SearchForm({ action, label, fields }: SearchFormProps) {
  const idPrefix = `buscar-${action.replace(/\W+/g, "") || "inicio"}`;

  return (
    <Form action={action} role="search" aria-label={label} className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
      {fields.map(({ name, label: fieldLabel, placeholder, defaultValue }) => (
        <div key={name} className="flex-1">
          <label htmlFor={`${idPrefix}-${name}`} className="block text-sm font-semibold">
            {fieldLabel}
          </label>
          <input
            id={`${idPrefix}-${name}`}
            name={name}
            type="search"
            defaultValue={defaultValue}
            placeholder={placeholder}
            maxLength={LIMITS.text}
            autoComplete="off"
            enterKeyHint="search"
            className="mt-1 block min-h-11 w-full rounded-lg border border-line bg-canvas px-3 text-base text-ink"
          />
        </div>
      ))}
      <SubmitButton pendingLabel="Buscando…">Buscar</SubmitButton>
    </Form>
  );
}
