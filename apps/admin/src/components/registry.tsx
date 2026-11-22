"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { EmptyTable, Panel, Pending } from "./ui";

export type RegistrySpec = {
  title: string;
  columns: readonly string[];
  searchLabel: string;
  createLabel: string;
  editLabel: string;
  fields: ReactNode;
};

export const registries = {
  Usuarios: {
    title: "Cuentas de usuario", columns: ["Nombre", "Correo", "Rol", "Estado", "Acciones"], searchLabel: "Nombre o correo",
    createLabel: "Crear usuario", editLabel: "Editar usuario",
    fields: <>
      <label>Nombre<input /></label><label>Correo institucional<input type="email" /></label>
      <label>Rol<select defaultValue=""><option value="">Seleccionar rol</option><option>Administrador</option><option>Asesor</option><option>Paciente</option></select></label>
      <label>Estado<select defaultValue=""><option value="">Seleccionar estado</option><option>Activo</option><option>Inactivo</option></select></label>
    </>,
  },
  Estudios: {
    title: "Catálogo de estudios", columns: ["Estudio", "Precio", "Estado", "Acciones"], searchLabel: "Nombre del estudio",
    createLabel: "Nuevo estudio", editLabel: "Editar estudio",
    fields: <>
      <label>Nombre<input maxLength={120} /></label>
      <label>Precio<input inputMode="decimal" /></label>
      <label>Descripción<textarea rows={3} maxLength={1000} /></label>
      <label className="inline-field"><input type="checkbox" /> Estudio activo</label>
    </>,
  },
  Clínicas: {
    title: "Catálogo de clínicas", columns: ["Sucursal", "Dirección", "Ciudad", "Estado", "Activación", "Acciones"], searchLabel: "Nombre o ubicación de la clínica",
    createLabel: "Nueva clínica", editLabel: "Editar clínica",
    fields: <>
      <label>Nombre<input maxLength={120} /></label>
      <label>Dirección<input maxLength={250} /></label>
      <div className="field-pair"><label>Ciudad<input maxLength={100} /></label><label>Estado<input maxLength={100} /></label></div>
      <label className="inline-field"><input type="checkbox" /> Clínica activa</label>
    </>,
  },
} satisfies Record<string, RegistrySpec>;

export function DesignDialog({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  return (
    <dialog ref={dialog} onClose={close} aria-labelledby="dialog-title" aria-describedby="dialog-status">
      <header><h2 id="dialog-title">{title}</h2><button type="button" aria-label="Cerrar formulario" onClick={() => dialog.current?.close()}><X size={18} aria-hidden="true" /></button></header>
      <Pending id="dialog-status">Operación pendiente de integración con la API.</Pending>
      {children}
    </dialog>
  );
}

export function Registry({ spec }: { spec: RegistrySpec }) {
  const [form, setForm] = useState<"create" | "edit" | "deactivate" | null>(null);
  const title = form === "create" ? spec.createLabel : form === "edit" ? spec.editLabel : "Desactivar usuario";

  return (
    <Panel title={spec.title}>
      <fieldset disabled className="filters" aria-describedby="registry-status">
        <label>{spec.searchLabel}<input type="search" /></label>
        <label>Estado<select><option>Todos</option><option>Activo</option><option>Inactivo</option></select></label>
        <button type="button">Buscar</button>
      </fieldset>
      <Pending id="registry-status">Consulta y cambios pendientes de integración.</Pending>
      <EmptyTable title={spec.title} columns={spec.columns}>Sin registros para mostrar.</EmptyTable>
      <div className="form-preview" aria-label="Vistas de formularios">
        <button type="button" aria-haspopup="dialog" onClick={() => setForm("create")}><Plus size={17} aria-hidden="true" /> Ver alta</button>
        <button type="button" aria-haspopup="dialog" onClick={() => setForm("edit")}>Ver edición</button>
        {spec === registries.Usuarios && <button type="button" aria-haspopup="dialog" onClick={() => setForm("deactivate")}>Ver desactivación</button>}
      </div>
      {form && <DesignDialog title={title} close={() => setForm(null)}>
        <fieldset disabled className="fields" aria-describedby="dialog-status">
          {form === "deactivate" ? <label>Cuenta<input /></label> : spec.fields}
          <button type="button" className="primary">{form === "deactivate" ? "Desactivar cuenta" : "Guardar"}</button>
        </fieldset>
      </DesignDialog>}
    </Panel>
  );
}
