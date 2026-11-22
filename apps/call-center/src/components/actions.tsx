"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { CalendarDays, ClipboardList, MessageSquare, NotebookPen, ShieldCheck, X } from "lucide-react";
import { IntegrationNotice } from "./ui";

export const actions = {
  otp: { title: "Verificar identidad", icon: ShieldCheck, submit: "Verificar código" },
  request: { title: "Actualizar solicitud", icon: ClipboardList, submit: "Guardar cambios" },
  note: { title: "Agregar nota interna", icon: NotebookPen, submit: "Guardar nota" },
  message: { title: "Redactar mensaje", icon: MessageSquare, submit: "Enviar mensaje" },
  appointment: { title: "Confirmar cita", icon: CalendarDays, submit: "Confirmar cita" },
} as const;

export type Action = keyof typeof actions;

export function PendingFields({ noticeId, children }: { noticeId: string; children: ReactNode }) {
  return <fieldset disabled className="fields" aria-describedby={noticeId}>{children}</fieldset>;
}

export function AppointmentFields() {
  return (
    <>
      <label>Estudio<select defaultValue=""><option value="">Seleccionar estudio</option></select></label>
      <label>Clínica<select defaultValue=""><option value="">Seleccionar clínica</option></select></label>
      <div className="field-row">
        <label>Fecha<input type="date" /></label>
        <label>Horario<select defaultValue=""><option value="">Seleccionar horario</option></select></label>
      </div>
    </>
  );
}

const actionFields: Record<Action, ReactNode> = {
  otp: <>
    <button type="button">Solicitar código temporal</button>
    <label>Código temporal<input type="text" inputMode="numeric" autoComplete="one-time-code" /></label>
  </>,
  request: <>
    <label>Estado<select defaultValue=""><option value="">Seleccionar estado</option></select></label>
    <label>Motivo del cambio<textarea rows={3} /></label>
  </>,
  note: <label>Nota interna<textarea rows={4} /></label>,
  message: <>
    <label>Canal de envío<select defaultValue=""><option value="">Seleccionar canal</option></select></label>
    <label>Mensaje<textarea rows={4} /></label>
  </>,
  appointment: <AppointmentFields />,
};

export function ActionDialog({ action, close }: { action: Action; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  return (
    <dialog ref={dialog} aria-labelledby="action-title" onClose={close}>
      <div className="dialog-heading">
        <h2 id="action-title">{actions[action].title}</h2>
        <button type="button" aria-label="Cerrar formulario" onClick={() => dialog.current?.close()}>
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <IntegrationNotice id="action-status">Operación pendiente de integración con la API.</IntegrationNotice>
      <PendingFields noticeId="action-status">
        {actionFields[action]}
        <button type="button" className="primary">{actions[action].submit}</button>
      </PendingFields>
    </dialog>
  );
}
