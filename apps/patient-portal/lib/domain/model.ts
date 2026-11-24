/**
 * Modelo propio del portal. Estas formas no dependen de ningún servicio:
 * los adaptadores de `lib/adapters` traducen hacia y desde ellas.
 */

// --- Paciente y acceso -------------------------------------------------------

/** Paciente de la sesión actual, con los datos de su cuenta. */
export type Patient = {
  accountId: string;
  /** Falta si la cuenta no tiene perfil de paciente. */
  patientId?: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
};

export type Credentials = { email: string; password: string };

export type Registration = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  /** Se omite cuando no se conoce. */
  phone?: string;
};

// --- Catálogo ----------------------------------------------------------------

export type Study = {
  id: string;
  name: string;
  description?: string;
  /** Importe en pesos mexicanos como cadena decimal, por ejemplo "120.00". */
  price: string;
};

export type Clinic = {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
};

export type PageQuery = { page: number; limit: number };

/** `search` filtra por nombre. */
export type CatalogQuery = PageQuery & { search?: string };

export type Page<Item> = { items: Item[]; hasMore: boolean };

// --- Trámite -----------------------------------------------------------------

/** Los tres primeros estados admiten cambios. `completed` y `cancelled` están cerrados. */
export type RequestStatus = "draft" | "in-progress" | "pending-confirmation" | "completed" | "cancelled";

/** Paso en el que está el trámite. Lo decide el servicio, nunca el portal. */
export type RequestStep = "study" | "clinic" | "datetime" | "review" | "confirmed";

/** `other` cubre cualquier canal que el portal no sabe nombrar. */
export type Channel = "web" | "whatsapp" | "call-center" | "other";

export type Selections = {
  studyId?: string;
  clinicId?: string;
  /** Fecha y hora en ISO 8601. */
  scheduledAt?: string;
  notes?: string;
};

/** Trámite de agendamiento tal como lo registró el servicio en su última actividad. */
export type BookingRequest = {
  id: string;
  status: RequestStatus;
  step: RequestStep;
  selections: Selections;
  lastChannel: Channel;
  /** Fecha y hora en ISO 8601. */
  lastActivityAt: string;
  createdAt: string;
  /** Versión del trámite. Viaja con cada evento como versión esperada. */
  version: number;
};

/** Entrada del historial de un trámite. Aún no la usa ninguna pantalla ni interfaz. */
export type HistoryEntry = {
  id: string;
  kind:
    | "created"
    | "selections-updated"
    | "paused"
    | "resumed"
    | "channel-switched"
    | "status-changed"
    | "appointment-confirmed";
  channel: Channel;
  actor: "patient" | "advisor" | "admin" | "system";
  occurredAt: string;
};

export type Appointment = {
  id: string;
  requestId: string;
  scheduledAt: string;
  status: "pending" | "confirmed" | "cancelled";
};

/** Código que el paciente dicta al asesor. Es de un solo uso. */
export type AssistanceCode = { code: string; expiresAt: string };
