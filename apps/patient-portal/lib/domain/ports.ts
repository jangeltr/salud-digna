import type { Result } from "./errors";
import type {
  Appointment,
  AssistanceCode,
  BookingRequest,
  CatalogQuery,
  Clinic,
  Credentials,
  Page,
  PageQuery,
  Patient,
  Registration,
  Study,
} from "./model";

/**
 * Las tres interfaces internas del portal. Páginas, acciones y componentes las usan
 * a través de `lib/composition.ts`, que es el único archivo que conoce quién las implementa.
 * Ninguna recibe el token: cada adaptador lo toma del módulo de sesión.
 */

/** Datos generales: catálogo, perfil del paciente, acceso y registro. */
export interface GeneralData {
  listStudies(query: CatalogQuery): Promise<Result<Page<Study>>>;
  getStudy(id: string): Promise<Result<Study>>;
  listClinics(query: CatalogQuery): Promise<Result<Page<Clinic>>>;
  getClinic(id: string): Promise<Result<Clinic>>;
  /** Perfil del paciente de la sesión actual. Sirve también para comprobar que la sesión sigue vigente. */
  getProfile(): Promise<Result<Patient>>;
  /** Comprueba las credenciales y abre la sesión del portal. */
  signIn(credentials: Credentials): Promise<Result<void>>;
  /** Crea la cuenta. No abre la sesión. */
  signUp(registration: Registration): Promise<Result<void>>;
}

/** Datos comunes de un evento sobre un trámite que ya existe. */
type OnRequest = {
  /** Identificador único del evento. Lo genera la acción al ejecutarse. */
  eventId: string;
  requestId: string;
  /** Versión del trámite que vio el paciente. Si falta, el evento se aplica sobre la versión vigente. */
  expectedVersion?: number;
};

/** Cada acción del paciente sobre su trámite, expresada como evento de negocio. */
export type RequestEvent =
  | { type: "request-started"; eventId: string }
  | (OnRequest & { type: "study-chosen"; studyId: string })
  | (OnRequest & { type: "clinic-chosen"; clinicId: string })
  | (OnRequest & { type: "slot-chosen"; scheduledAt: string })
  /** `note: null` quita la nota. */
  | (OnRequest & { type: "note-saved"; note: string | null })
  | (OnRequest & { type: "request-paused" })
  | (OnRequest & { type: "request-resumed" })
  | (OnRequest & { type: "appointment-confirmed" })
  | (OnRequest & { type: "help-requested" });

/** Acuse de un evento. No es el estado del trámite: el portal lo consulta después. */
export type Receipt = {
  /** Trámite sobre el que se aplicó el evento. En `request-started` es el trámite nuevo. */
  requestId: string;
  /** Versión resultante, si el servicio la informa. Permite encadenar otro evento sin consultar antes. */
  version?: number;
  /** Solo en `help-requested`. */
  assistance?: AssistanceCode;
};

/** Notificación del trámite: el portal informa de lo que hizo el paciente. */
export interface RequestNotifier {
  /**
   * Con el error `unavailable` el resultado es incierto: el evento pudo haberse aplicado.
   * Antes de reintentar hay que consultar el estado.
   */
  notify(event: RequestEvent): Promise<Result<Receipt>>;
}

/** Consulta del trámite: último estado registrado del paciente de la sesión actual. */
export interface RequestQuery {
  /** Trámites abiertos del paciente. */
  listPending(query: PageQuery): Promise<Result<Page<BookingRequest>>>;
  getRequest(id: string): Promise<Result<BookingRequest>>;
  /** Cita asociada a un trámite confirmado. `undefined` si no existe. */
  getAppointment(requestId: string): Promise<Result<Appointment | undefined>>;
}
