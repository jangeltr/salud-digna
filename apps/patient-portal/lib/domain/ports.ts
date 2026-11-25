import type { Result } from "./errors";
import type {
  Appointment,
  AssistanceCode,
  BookingRequest,
  CatalogQuery,
  Clinic,
  ContinuityCode,
  Credentials,
  HistoryPage,
  HistoryQuery,
  Page,
  PageQuery,
  Patient,
  PendingPage,
  Registration,
  Study,
} from "./model";

/**
 * Las tres interfaces internas del portal. Páginas, acciones y componentes las usan
 * a través de `lib/composition.ts`, que es el único archivo que conoce quién las implementa.
 * Ninguna recibe el token ni ninguna otra credencial: cada adaptador obtiene las suyas.
 */

/** Datos generales: catálogo, perfil del paciente, acceso y registro. */
export interface GeneralData {
  listStudies(query: CatalogQuery): Promise<Result<Page<Study>>>;
  getStudy(id: string): Promise<Result<Study>>;
  listClinics(query: CatalogQuery): Promise<Result<Page<Clinic>>>;
  getClinic(id: string): Promise<Result<Clinic>>;
  /**
   * Todas las clínicas, hasta un tope. `truncated` indica que el tope dejó fuera alguna.
   * Sirve para filtrar por ciudad, que el catálogo no ofrece.
   */
  allClinics(): Promise<Result<{ items: Clinic[]; truncated: boolean }>>;
  /** Perfil del paciente de la sesión actual. Sirve también para comprobar que la sesión sigue vigente. */
  getProfile(): Promise<Result<Patient>>;
  /** Comprueba las credenciales y abre la sesión del portal. */
  signIn(credentials: Credentials): Promise<Result<void>>;
  /** Crea la cuenta. No abre la sesión. */
  signUp(registration: Registration): Promise<Result<void>>;
  /** Cierra la sesión del portal. */
  signOut(): Promise<void>;
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
  | (OnRequest & { type: "help-requested" })
  /** El paciente da por completas sus selecciones y pide que un canal de atención confirme la cita. */
  | (OnRequest & { type: "confirmation-requested" })
  | (OnRequest & { type: "request-cancelled" })
  /** El paciente pide un código para continuar este trámite en otro canal. */
  | (OnRequest & { type: "continuity-requested" })
  /** El paciente trae un código emitido en otro canal. El acuse lleva el trámite que pasa a ser suyo en este. */
  | { type: "continuity-redeemed"; eventId: string; code: string };

/**
 * Lo que soporta el adaptador activo del trámite. Las pantallas muestran solo lo soportado
 * y las acciones rechazan lo demás sin notificar nada.
 */
export type RequestCapabilities = {
  /** Elegir fecha y hora. */
  slot: boolean;
  /** Guardar una nota para la clínica. */
  note: boolean;
  /** Pausar y reanudar el trámite. */
  pause: boolean;
  /** Pedir un código de asistencia para terminar con un asesor. */
  advisorHelp: boolean;
  /** El paciente confirma la cita por su cuenta. Sin esto, la envía a confirmación. */
  patientConfirmation: boolean;
  cancellation: boolean;
  history: boolean;
  /** Emitir un código para continuar en otro canal y canjear el que emitió otro. */
  continuityCodes: boolean;
  /**
   * Continuidad identificada: el servicio reconoce al paciente por una acreditación institucional,
   * lista sus trámites de cualquier canal y renueva solo el permiso de cada uno.
   * El código de continuidad queda como alternativa.
   */
  identifiedContinuity: boolean;
  /**
   * El servicio lista los trámites por paciente, también los de otros canales. Sin esto, la lista
   * sale del registro del portal y un inicio de trámite con resultado incierto no se puede comprobar.
   */
  patientListing: boolean;
};

/** Acuse de un evento. No es el estado del trámite: el portal lo consulta después. */
export type Receipt = {
  /**
   * Trámite sobre el que se aplicó el evento. En `request-started` es el trámite nuevo
   * y en `continuity-redeemed`, el que el código permite continuar.
   */
  requestId: string;
  /** Versión resultante, si el servicio la informa. Permite encadenar otro evento sin consultar antes. */
  version?: number;
  /** Solo en `help-requested`. */
  assistance?: AssistanceCode;
  /** Solo en `continuity-requested`. */
  continuity?: ContinuityCode;
};

/** Notificación del trámite: el portal informa de lo que hizo el paciente. */
export interface RequestNotifier {
  /**
   * Con el error `unavailable` el resultado es incierto: el evento pudo haberse aplicado.
   * Antes de reintentar hay que consultar el estado.
   * Un evento que el adaptador no soporta devuelve `rejected` sin llamar a ningún servicio.
   */
  notify(event: RequestEvent): Promise<Result<Receipt>>;
}

/** Consulta del trámite: último estado registrado del paciente de la sesión actual. */
export interface RequestQuery {
  /** Trámites abiertos del paciente. */
  listPending(query: PageQuery): Promise<Result<PendingPage>>;
  getRequest(id: string): Promise<Result<BookingRequest>>;
  /** Cita asociada a un trámite confirmado. `undefined` si no existe. */
  getAppointment(requestId: string): Promise<Result<Appointment | undefined>>;
  /** Historial del trámite. Solo lo atienden los adaptadores que declaran `history`. */
  getHistory(requestId: string, query: HistoryQuery): Promise<Result<HistoryPage>>;
}
