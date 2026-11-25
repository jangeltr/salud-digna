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
  /** Falta cuando el servicio no informa qué canal registró la última actividad. */
  lastChannel?: Channel;
  /** Fecha y hora en ISO 8601. */
  lastActivityAt: string;
  createdAt: string;
  /** Versión del trámite. Viaja con cada evento como versión esperada. */
  version: number;
};

/**
 * Trámite que el portal sabe que es del paciente, pero que no puede consultar:
 * su permiso falta o venció. No lleva ningún dato del trámite.
 */
export type LockedRequest = {
  id: string;
  /** Cuándo lo registró el portal, en ISO 8601. */
  registeredAt: string;
};

/**
 * Resumen de un trámite activo del paciente, tal como lo lista el servicio: folio, estado y fechas.
 * El detalle se lee al abrir el trámite.
 */
export type RequestSummary = {
  id: string;
  status: RequestStatus;
  createdAt: string;
  lastActivityAt: string;
};

/**
 * Trámites abiertos del paciente. `locked` solo aparece con servicios que exigen un permiso por trámite.
 * `summaries` solo aparece cuando el servicio lista los trámites del paciente por su identidad:
 * entonces `items` va vacío y el detalle se lee al abrir cada trámite.
 */
export type PendingPage = Page<BookingRequest> & { locked?: LockedRequest[]; summaries?: RequestSummary[] };

/** Entrada del historial de un trámite. */
export type HistoryEntry = {
  id: string;
  /** `other` cubre cualquier evento que el portal no sabe nombrar. */
  kind:
    | "created"
    | "selections-updated"
    | "paused"
    | "resumed"
    | "channel-switched"
    | "status-changed"
    | "appointment-confirmed"
    | "other";
  /** Canal que produjo el evento. */
  channel: Channel;
  /** Nombre con el que el servicio identifica al canal. Se muestra cuando `channel` es `other`. */
  channelCode?: string;
  actor?: "patient" | "advisor" | "admin" | "system";
  occurredAt: string;
  /** Solo en `selections-updated`: paso en el que quedó el trámite. */
  step?: RequestStep;
  /** Solo en `status-changed`. */
  from?: RequestStatus;
  to?: RequestStatus;
};

/** `cursor` es el valor de `nextCursor` de la página anterior. */
export type HistoryQuery = { limit: number; cursor?: string };

/** Página del historial, del evento más antiguo al más reciente. */
export type HistoryPage = { items: HistoryEntry[]; nextCursor?: string };

export type Appointment = {
  id: string;
  requestId: string;
  scheduledAt: string;
  status: "pending" | "confirmed" | "cancelled";
};

/** Código que el paciente dicta al asesor. Es de un solo uso. */
export type AssistanceCode = { code: string; expiresAt: string };

/**
 * Código para continuar el trámite en otro canal. Es una credencial de un solo uso:
 * quien lo canjea puede seguir con el trámite. No se guarda en ningún sitio.
 */
export type ContinuityCode = { code: string; expiresAt: string };
