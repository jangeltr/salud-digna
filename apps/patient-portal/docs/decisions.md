# Decisiones del portal del paciente

`apps/patient-portal/` es la web pública del paciente. Usa Next.js, TypeScript y Tailwind CSS. Desde el 2026-11-24 es solo un sitio web, como explica «El portal es solo un sitio web».

Este documento registra las decisiones del portal y el estado de la API del que dependen. El estado corresponde al contrato y a las guías publicados en `main` el 2026-11-22, y al contrato del orquestador publicado en `main` el 2026-11-24. El documento vive junto a la aplicación porque cada equipo mantiene la documentación de la suya, según la [guía de revisión de pull requests](../../../docs/revision-pull-requests.md).

El portal tiene su carcasa, con identidad, rutas y un encabezado con la navegación, además de registro, acceso, sesión, catálogo y trámite de agendamiento contra la API. El trámite puede registrarse también en el orquestador, como explica «Adaptador del orquestador». `/mi-espacio`, `/citas`, `/citas/[id]` y `/ayuda` muestran solo su título.

Las decisiones que dejaron de aplicarse se conservan al final, en «Decisiones retiradas», con su fecha y su motivo.

## Contrato

El contrato oficial es [`docs/openapi.json`](../../../docs/openapi.json). El portal lo lee en esa ubicación y evita copiarlo. `lib/adapters/` y `mocks/` se rigen por ese archivo. Es el contrato de la API general. El del orquestador está en `apps/orchestrator/docs/`, como explica «Adaptador del orquestador».

**Regla.** El portal usa únicamente operaciones y propiedades que figuran en `docs/openapi.json`. Lo que falte se reporta al equipo de API con método, ruta, rol y código HTTP, y queda pendiente en el portal hasta que exista un contrato acordado. Así lo piden [AGENTS.md](../../../AGENTS.md) y la [guía de integración](../../../docs/INTEGRACION-FRONTENDS.md), sección «Inconsistencias y trabajo con agentes».

La URL base de integración es `https://api.salud-digna.app/api/v1` y las rutas del contrato ya incluyen el prefijo `/api/v1`. El contrato documenta también operaciones de simulación y webhooks que dependen de la configuración de cada entorno. Su inclusión no implica que estén habilitadas en el despliegue, según la sección «Flujos y disponibilidad» de la misma guía.

## Estructura

| Ruta | Propósito |
| --- | --- |
| `app/` | Rutas del App Router. Los grupos `(public)`, `(booking)` y `(account)` separan las páginas sin sesión, el flujo de agendamiento y el área personal. `api/` contiene los manejadores de servidor del portal. |
| `features/` | Un módulo por dominio: `catalog`, `requests`, `appointments`, `auth`, `identity` y `help`. |
| `lib/` | Código transversal: `domain` con el modelo, los errores y las interfaces; `adapters` con sus implementaciones; `composition.ts`, que elige el adaptador de cada interfaz; `session` para la sesión del paciente; y `brand.ts` con el nombre y los colores del portal. |
| `components/` | Interfaz compartida y el encabezado con la navegación. |
| `mocks/` | Respuestas simuladas de operaciones del contrato. |
| `public/` | Archivos estáticos. Hoy está vacía. |
| `docs/` | Este documento. |

## Idioma y rutas

Los textos visibles y la documentación se escriben en español. El código y las carpetas usan nombres en inglés alineados con los módulos de la API.

La excepción son los segmentos de URL. Van en español y sin acentos porque los ve el paciente, así que las carpetas de ruta bajo `app/` se llaman `estudios`, `clinicas`, `tramite` o `mi-espacio`. Los grupos de rutas quedan fuera de la URL y `api/` es una ruta técnica: siguen en inglés.

| Grupo | Rutas |
| --- | --- |
| `(public)` | `/`, `/estudios`, `/estudios/[id]`, `/clinicas`, `/acceso`, `/registro` |
| `(booking)` | `/tramite/nuevo`, `/tramite/[id]` |
| `(account)` | `/mi-espacio`, `/continuar`, `/citas`, `/citas/[id]`, `/ayuda`, `/perfil` |

El inicio, el catálogo, `/registro`, `/acceso`, `/perfil`, `/tramite/nuevo`, `/tramite/[id]` y `/continuar` ya funcionan contra la API. `/mi-espacio`, `/citas`, `/citas/[id]` y `/ayuda` muestran por ahora su título y el aviso «Disponible en un paso posterior», sin datos de ejemplo.

Los filtros de los listados viajan en la URL con nombres en español: `q` para el nombre, `ciudad`, `pagina` y, en la rejilla de horarios, `dia`.

## Base técnica

El portal es el paquete `@salud-digna/patient-portal` del workspace. Usa Node.js 24 y pnpm 11.28.11, fijados en el `package.json` de la raíz. Las versiones se declaran exactas, sin rangos, y resuelven a las mismas que usan las otras aplicaciones Next.js del monorepo.

| Paquete | Versión |
| --- | --- |
| `next` | 16.4.6 |
| `react` y `react-dom` | 19.3.1 |
| `typescript` | 5.9.3 |
| `tailwindcss` y `@tailwindcss/postcss` | 4.3.5 |
| `@types/node` | 24.19.2 |
| `@types/react` y `@types/react-dom` | 19.3.0 |
| `openapi-typescript`, solo en desarrollo | 7.13.0 |

Los scripts siguen el patrón de las otras aplicaciones. Se ejecutan desde la raíz con `pnpm --filter @salud-digna/patient-portal <script>`.

| Script | Comando | Uso |
| --- | --- | --- |
| `dev` | `next dev --hostname 127.0.0.1 --port 5173` | Servidor de desarrollo. |
| `build` | `next build` | Compilación de producción. La ejecuta también la revisión de integración. |
| `start` | `next start --hostname 127.0.0.1 --port 5173` | Sirve la compilación. |
| `check` | `next typegen && tsc --noEmit` | Genera los tipos de rutas y comprueba TypeScript en modo estricto. |
| `api:types` | `openapi-typescript ../../docs/openapi.json --output lib/adapters/general-api/schema.d.ts` | Genera los tipos de la API a partir del contrato. Solo lee ese archivo. |

Configuración de `next.config.ts`:

- `agentRules: false` evita que `next dev` escriba un bloque administrado en un `AGENTS.md` del portal.
- `poweredByHeader: false` retira la cabecera `X-Powered-By`.
- Todas las rutas responden con `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` y `X-Frame-Options: DENY`.

Tailwind CSS 4 se carga con `@tailwindcss/postcss` y `@import "tailwindcss"` en `app/globals.css`. El `.gitignore` local excluye `.next/` y `next-env.d.ts`. El alias `@/*` de `tsconfig.json` apunta a la raíz del portal.

`next dev` guarda tipos de rutas en `.next/dev/`. Si `check` o `build` fallan por una ruta que ya se movió o se borró, elimina la carpeta `.next/` y repite.

## Decisiones

### El portal es solo un sitio web

**Fecha.** 2026-11-24.

**Decisión.** El portal es únicamente un sitio web. Se usa desde el navegador, también en el teléfono, y no se instala.

**Motivo.** El proyecto cambió de arquitectura. El portal pasa a simular el canal Web existente y habla con dos servicios, descritos en «Dos servicios y tres interfaces». Deja de cubrir el canal móvil, así que la PWA instalable ya no tiene función.

**Qué cambió.** Se retiraron el manifiesto, los iconos de instalación, la barra inferior del modo instalado, las reglas CSS de ese modo y la carpeta reservada para detectarlo. La navegación pasó a un único encabezado, descrito en «Navegación». El detalle de lo retirado está en «Decisiones retiradas».

**Efecto sobre el resto del documento.** Las secciones sobre la API describen la API actual. Con `REQUESTS_BACKEND=legacy`, el valor por defecto, el código la usa para todo. «Adaptador del orquestador» describe el otro modo.

### Dos servicios y tres interfaces

**Fecha.** 2026-11-24.

**Los dos servicios.**

| Servicio | Qué atiende | Contrato |
| --- | --- | --- |
| API general | Datos del paciente, catálogo y acceso. Es la API actual. | `docs/openapi.json`. |
| Orquestador | Recibe de cada canal mensajes JSON con los cambios del trámite. Cada canal le consulta el último estado registrado de un trámite. | `apps/orchestrator/docs/journey-writes.md` y `journey-queries.md`. Sin OpenAPI. |

El portal es el simulador del canal Web. Hacia el orquestador tiene dos módulos: notificar y consultar. `REQUESTS_BACKEND` decide quién los atiende: las operaciones `/requests` de la API actual, por defecto, o el orquestador.

**Modelo propio.** `lib/domain/model.ts` define paciente, estudio, clínica, trámite, entrada de historial y cita con el vocabulario del portal. El trámite lleva estado, paso, selecciones, último canal, última actividad y versión. El último canal falta cuando el servicio no lo informa. La entrada de historial la usa `/tramite/[id]/historial`.

**Errores propios.** `lib/domain/errors.ts` define los errores que devuelven las interfaces.

| Error | Significado |
| --- | --- |
| `not-found` | El recurso no existe o no pertenece al paciente. |
| `conflict` | El recurso cambió desde la última lectura, o ya existe. |
| `session` | No hay sesión o ya no es válida. |
| `rate-limited` | Límite de intentos excedido, con los segundos de espera si el servicio los indica. |
| `invalid` | El servicio rechazó los datos enviados. |
| `unavailable` | No hubo respuesta útil. En una escritura, el resultado es incierto. |
| `rejected` | El servicio respondió y rechazó la operación por un motivo que el portal no distingue, o el adaptador activo no la soporta. |
| `access-expired` | El trámite es del paciente, pero el portal no tiene un permiso vigente para consultarlo ni modificarlo. Solo lo devuelve el adaptador del orquestador. |

`rejected` existe porque la API actual documenta `403` en todas las operaciones del trámite. El portal ya trataba ese caso como un rechazo seguro, distinto de «servicio no disponible»: al crear un trámite muestra el error sin consultar los pendientes.

**Las tres interfaces.** Están en `lib/domain/ports.ts`. Todas devuelven `Result`, que es el dato o uno de los errores anteriores.

| Interfaz | Operaciones | Quién la implementa |
| --- | --- | --- |
| `GeneralData`, datos generales | `listStudies`, `getStudy`, `listClinics`, `getClinic`, `getProfile`, `signIn`, `signUp` | `lib/adapters/general-api/general-data.ts` |
| `RequestNotifier`, notificación del trámite | `notify(event)` | `notifier.ts` de `lib/adapters/legacy-requests` o de `lib/adapters/orchestrator` |
| `RequestQuery`, consulta del trámite | `listPending`, `getRequest`, `getAppointment`, `getHistory` | `query.ts` de las mismas carpetas |

`signIn` comprueba las credenciales y deja abierta la sesión del portal. `signUp` crea la cuenta sin abrir la sesión. Las consultas del trámite se refieren siempre al paciente de la sesión actual.

**Eventos de negocio.** Cada acción del paciente sobre su trámite se notifica como un evento.

| Evento | Acción del paciente | Operación de la API actual |
| --- | --- | --- |
| `request-started` | «Empezar el trámite» | `POST /requests` |
| `study-chosen` | Elegir un estudio | `PATCH /requests/{id}/context` |
| `clinic-chosen` | Elegir una clínica | `PATCH /requests/{id}/context` |
| `slot-chosen` | Elegir fecha y hora | `PATCH /requests/{id}/context` |
| `note-saved` | Guardar o quitar la nota | `PATCH /requests/{id}/context` |
| `request-paused` | «Guardar y continuar después» | `POST /requests/{id}/pause` |
| `request-resumed` | «Continuar este trámite» | `POST /requests/{id}/resume` |
| `appointment-confirmed` | «Confirmar mi cita» | `POST /requests/{id}/confirm` |
| `help-requested` | «Pedir ayuda a un asesor» | `POST /requests/{id}/assistance-code` |
| `confirmation-requested` | «Enviar a confirmación» | Ninguna: la API actual pasa sola a pendiente de confirmación. |
| `request-cancelled` | «Cancelar trámite» | Ninguna: el contrato no ofrece cancelar. |

Cada evento lleva un `eventId` único, que la acción genera al ejecutarse, el identificador del trámite y, de forma opcional, la versión que vio el paciente en `expectedVersion`. Empezar un trámite desde un estudio emite dos eventos: `request-started` y `study-chosen`. Un evento que el adaptador activo no soporta devuelve `rejected` sin llamar a ningún servicio.

La notificación devuelve un acuse, no el estado del trámite: el identificador del trámite, la versión resultante si el servicio la informa y, en `help-requested`, el código de asistencia. Después de cada evento la página vuelve a consultar el trámite. Con el error `unavailable` el resultado es incierto, así que el portal consulta los pendientes antes de permitir otro intento.

**El adaptador heredado.** `lib/adapters/legacy-requests` traduce cada evento a la operación de la tabla. Acepta el `eventId` y lo ignora, porque la API actual no tiene dónde recibirlo. La API actual exige la versión en cada escritura: si el evento no la trae, el adaptador lee antes la vigente.

**Composición.** `lib/composition.ts` decide qué adaptador atiende cada interfaz, según `REQUESTS_BACKEND`, y es el único archivo que conoce las implementaciones. Exporta `generalData`, `requestNotifier`, `requestQuery` y `requestCapabilities`, y `checkConfiguration()` para el arranque.

**Reglas de dependencia.**

- Páginas, acciones y componentes importan solo `lib/domain` y `lib/composition.ts`.
- Los tipos generados del contrato y los códigos HTTP solo aparecen dentro de `lib/adapters`. `failures.ts` es la única traducción de códigos HTTP a errores del portal.
- El token queda fuera de páginas y acciones. `authorized.ts` lo lee del módulo de sesión en cada llamada, y `signIn` lo guarda en la cookie sin devolverlo.
- La clave del canal y los permisos de trámite del orquestador tampoco salen de su adaptador.
- Las pantallas muestran solo lo que declara `requestCapabilities`, y las acciones lo comprueban de nuevo en el servidor.

**Estado.** El adaptador del orquestador ya existe para la parte firme de su contrato. El heredado se conserva y sigue siendo el modo por defecto. La sección siguiente describe qué resolvió el contrato y qué sigue abierto.

### Adaptador del orquestador

**Fecha.** 2026-11-24.

**Contrato.** `apps/orchestrator/docs/journey-writes.md`, `journey-queries.md` y `data-model.md`, y `apps/orchestrator/README.md`, tal como están en `main` en el commit `4958614`. El orquestador no publica un OpenAPI, así que este adaptador no tiene tipos generados: `mapping.ts` comprueba la forma de cada respuesta antes de usarla.

**Decisiones del propietario del portal.**

- Lo que el orquestador no soporta se oculta. El portal no guarda la fecha ni la nota por su cuenta y no crea copias del trámite en la API general.
- La adopción de trámites iniciados en otro canal y la carpeta de traspaso quedan para después.

**Selección.** `REQUESTS_BACKEND` decide quién atiende `RequestNotifier` y `RequestQuery`: `legacy`, por defecto, o `orchestrator`. `lib/composition.ts` lee la variable al cargar el servidor. Acceso, perfil y catálogo siguen en la API general en los dos modos. Un valor distinto de esos dos detiene el arranque.

**Capacidades.** Cada adaptador declara lo que soporta en su `capabilities.ts`, y `lib/composition.ts` exporta las del adaptador activo como `requestCapabilities`. Las pantallas muestran solo lo soportado. Cada acción lo comprueba otra vez en el servidor con `requireSupport`: si llega una acción no soportada, vuelve al trámite sin notificar nada.

| Capacidad | Heredado | Orquestador | Motivo en el orquestador |
| --- | --- | --- | --- |
| `slot`, horario | Sí | No | El contexto solo admite `studyId` y `clinicId`. Cualquier otro campo se rechaza. |
| `note`, nota | Sí | No | El mismo. |
| `pause`, pausa y reanudación | Sí | No | Sin estado ni evento de pausa. |
| `advisorHelp`, ayuda de asesor | Sí | No | Sin código de asistencia. |
| `patientConfirmation`, confirmación por el paciente | Sí | No | Ningún evento lleva el trámite a `COMPLETED`. |
| `cancellation`, cancelación | No | Sí | `JOURNEY_STATUS_CHANGED` a `CANCELLED`. La API general no tiene operación. |
| `history`, historial | No | Sí | `GET /journeys/:journeyId/history`. |
| `patientListing`, lista por paciente | Sí | No | Sin consulta de los trámites de un paciente. |

`patientListing` es una capacidad añadida a las siete pedidas. De ella dependen el texto de `/continuar` y lo que ocurre tras un inicio de trámite con resultado incierto.

**Eventos.**

| Evento | Llamada al orquestador |
| --- | --- |
| `request-started` | `POST /journeys` con `{"type":"APPOINTMENT"}`. El `eventId` no viaja: la ruta rechaza cualquier otro campo. |
| `study-chosen`, `clinic-chosen` | `POST /events` con `JOURNEY_CONTEXT_UPDATED`. |
| `confirmation-requested` | `POST /events` con `JOURNEY_STATUS_CHANGED` a `PENDING_CONFIRMATION`. |
| `request-cancelled` | `POST /events` con `JOURNEY_STATUS_CHANGED` a `CANCELLED`. |
| Los otros seis | Ninguna. El adaptador devuelve `rejected` sin llamar. |

Cada `POST /events` lleva el `eventId` como `externalEventId`, `schemaVersion: 1`, `expectedVersion` con la versión que vio el paciente y `occurredAt` en UTC con milisegundos. Antes de publicar un estudio o una clínica, el adaptador comprueba en el catálogo de la API general que existe: el orquestador guarda referencias opacas y no las valida.

**Lectura.** `getRequest` hace dos consultas, `GET /journeys/:journeyId` y `…/context`, y las une en el trámite del modelo. No son atómicas entre sí: un evento de otro canal puede caer entre ambas. El orquestador no informa del último canal, así que `lastChannel` queda vacío y el aviso de continuidad solo indica el tiempo transcurrido. `getAppointment` devuelve siempre «sin cita»: el contexto puede traer `appointmentId`, pero ningún evento lo escribe. `getHistory` lee `…/history` con `limit` y `cursor`.

**Respuestas del orquestador.** `failures.ts` es la única traducción de sus códigos HTTP.

| Respuesta | Qué hace el adaptador |
| --- | --- |
| `400` | `invalid`. |
| `401` y `403` | `unavailable`. Hablan de la clave del canal, no del paciente: su sesión sigue abierta. |
| `404` | `access-expired`, y olvida el permiso. Solo se llama por trámites que el registro atribuye al paciente. |
| `409` | Vuelve a leer el contexto y devuelve `conflict`. Si la versión no cambió, deja constancia en el log. |
| Tiempo de espera agotado en `POST /events` | Un único reenvío con el mismo cuerpo, byte a byte. Si también falla, `unavailable`. |
| Tiempo de espera agotado en `POST /journeys` | Sin reenvío. `unavailable`. |
| Sin respuesta o `5xx` | `unavailable`. |

**Cabeceras secretas.** `Authorization` y `X-Journey-Grant` se escriben en un solo lugar, `client.ts`, y no salen de esa función. La clave del canal y los permisos viajan dentro de `Secret`, que devuelve una marca si alguien lo convierte a texto, a JSON o lo inspecciona. El log registra solo el método, la ruta del contrato y el motivo: nunca cabeceras, cuerpos ni identificadores. El cliente rechaza las redirecciones, que reenviarían las cabeceras a otro destino. Ningún resultado que llega a páginas o acciones contiene un permiso.

**Registro del canal Web.** El orquestador no ofrece consultar los trámites de un paciente, así que el portal anota los que inicia. `registry.ts` los guarda en `web-channel-registry.json`, dentro de `PORTAL_DATA_DIR`. Por defecto es `.data/` en el portal, que Git ignora.

- Contiene, por identificador de cuenta, el identificador de cada trámite, cuándo lo registró el portal y cuándo supo que quedó cerrado. Nunca permisos ni claves.
- La escritura es atómica: el contenido completo va a un archivo temporal de la misma carpeta y sustituye al registro con un renombrado.
- La carpeta se crea con permisos `0700` y el archivo con `0600`. En Windows los permisos los fija la carpeta.
- Las escrituras pasan por una cola, de una en una. La copia en memoria solo cambia si el archivo quedó escrito.
- Sirve con un único proceso del portal. Varias instancias necesitarían un almacén compartido.

**Permisos.** `grants.ts` guarda cada permiso solo en memoria, asociado a cuenta y trámite, con el vencimiento que informó el orquestador. Al reiniciar el servidor se pierden. Un trámite del paciente sin permiso vigente devuelve el error `access-expired`.

**Pertenencia.** Toda lectura o escritura pasa por `resolveAccess`. Primero pide el perfil a la API general, porque el orquestador no conoce al paciente ni su sesión. Después comprueba en el registro que el trámite es de esa cuenta: si no lo es, responde «no encontrado» sin llamar al orquestador. Por último busca el permiso: sin uno vigente responde `access-expired`, también sin llamar.

**Pantallas en modo orquestador.**

| Pantalla | Qué muestra |
| --- | --- |
| `/tramite/nuevo` | Texto del flujo sin horario. La lista de abiertos sale del registro. |
| `/tramite/[id]` | Estudio, clínica y revisión. Sin horario, nota, «Guardar y continuar después», confirmación directa ni ayuda de asesor. |
| Revisión | Resumen y botón «Enviar a confirmación». |
| Pendiente de confirmación | Título «Pendiente de confirmación», resumen, folio del trámite con botón de copiar y «Puedes continuar por WhatsApp o Call Center.». |
| Cancelar | Enlace «Cancelar trámite». El formulario que cancela solo existe en la página tras pedirlo, con `?cancelar=1`. |
| `/continuar` | Lista del registro. Con permiso vigente, el estado del trámite. Sin él, «Necesita un permiso nuevo», con folio y fecha de registro y sin datos del trámite. |
| `/tramite/[id]/historial` | Línea de tiempo con el tipo de evento en español, el canal que lo produjo y la fecha. En modo heredado responde `404`. |

El folio es el identificador del trámite. Mientras el trámite está pendiente de confirmación, el paciente puede cambiar el estudio o la clínica: el orquestador lo devuelve a revisión.

**Qué quedó terminado.**

- Selección de adaptador y capacidades, con las pantallas y las acciones de los dos modos.
- Cliente HTTP del orquestador, con sus cabeceras fuera de logs, errores y respuestas.
- Los cuatro eventos de la tabla, la lectura del trámite y el historial paginado.
- Reenvío idéntico tras un tiempo de espera agotado, relectura del contexto tras un `409` y traducción de `401` y `403`.
- Registro en archivo, permisos en memoria, error `access-expired` y comprobación de pertenencia.
- Un orquestador simulado y una suite para este modo, fuera del repositorio.

**Qué es provisional y por qué.**

| Provisional | Por qué |
| --- | --- |
| El registro del canal Web | Sustituye a la consulta por paciente, que el orquestador no ofrece. Un trámite iniciado en otro canal no aparece en el portal. |
| «Necesita un permiso nuevo» | El permiso dura cinco minutos y el contrato deja pendiente su renovación. Pasado ese tiempo, el portal no puede leer ni cambiar el trámite, y hoy no tiene cómo recibir otro permiso. |
| El flujo sin fecha, nota ni cita | El contrato no los cubre. El trámite termina en «Pendiente de confirmación» y la cita oficial no se crea desde el portal. |
| El último canal y los nombres de canal | El orquestador no informa del último canal. En el historial, el canal se reconoce por su código: `web`, `whatsapp` o `call` dentro del nombre. Cualquier otro se muestra tal cual. |
| Un solo proceso | Registro y permisos viven en el proceso del portal. |

**Riesgo: crear un trámite con resultado incierto.** `POST /journeys` no es idempotente y el permiso llega solo en su respuesta. Si la respuesta se pierde, el trámite pudo crearse en el orquestador, pero el portal no conoce su identificador ni su permiso: queda huérfano y no se puede recuperar. Por eso el portal no reintenta por su cuenta. Informa al paciente de que no pudo confirmar la creación y le deja decidir si empieza otro. Cada reintento del paciente puede dejar otro trámite huérfano. El mensaje es el mismo cuando el orquestador rechaza la clave del canal, porque `401` y `403` se traducen a `unavailable`: en ese caso no se creó nada.

**Ambigüedades del contrato y cómo se resolvieron.**

| Ambigüedad | Resolución |
| --- | --- |
| El `404` no distingue trámite inexistente de permiso ausente, vencido, revocado o ajeno. | Como solo se llama por trámites del registro del paciente, se trata como permiso sin vigencia: `access-expired`. |
| El `409` cubre versión obsoleta, transición inválida e identificador de evento reutilizado, sin cuerpo que los distinga. | Los tres son `conflict`. La relectura del contexto permite anotar en el log cuándo la versión no cambió. |
| La respuesta de `POST /events` no trae la versión nueva. | El acuse va sin versión y la página vuelve a leer el trámite. Al crear, la versión es 1 porque así lo fija el contrato. |
| El contrato no enumera los códigos de canal. Solo usa `demo-web` como ejemplo. | Reconocimiento por nombre, descrito arriba. |
| La clave se describe como `<keyId>.<secret>` y el permiso como opaco, sin longitudes. | La validación comprueba solo esa forma y que el permiso sea apto para una cabecera. |
| Los pasos `SELECT_DATETIME` y `CONFIRMED` se pueden leer, pero ningún evento los produce. | Si llegan, la pantalla indica que el paso continúa en otro canal y muestra el folio. |
| `journey-writes.md` dice que un cambio de contexto deja el trámite `IN_PROGRESS`. `data-model.md` añade que desde `PENDING_CONFIRMATION` se vuelve a `IN_PROGRESS` si cambian datos. | El portal permite cambiar estudio o clínica en un trámite pendiente. |
| El orquestador no comprueba que el estudio y la clínica existan. | El adaptador lo comprueba en el catálogo antes de publicar. |

**Preguntas abiertas para el equipo del orquestador.**

1. **Permiso.** ¿Cómo obtiene el canal Web un permiso nuevo para un trámite propio pasados los cinco minutos? ¿Solo con la CLI de demostración? ¿Cómo llega al backend del portal?
2. **Fecha.** ¿`JOURNEY_CONTEXT_UPDATED` aceptará `scheduledAt`? Sin fecha, la API general no puede crear la cita.
3. **Confirmación.** ¿Quién crea la cita oficial y cómo se informa `COMPLETED` y `appointmentId` al orquestador?
4. **Paciente.** ¿Cómo encuentra un canal los trámites de un paciente? En la demo, ¿cómo conoce el paciente el identificador de un trámite iniciado en otro canal?
5. **Acceso.** ¿Qué URL usará el backend del portal, cuál es el código de canal del portal y quién entrega la clave con los scopes `EVENTS_PUBLISH` y `JOURNEYS_READ`? ¿Qué códigos tienen los demás canales?

**Puesta en marcha.** Define en `.env.local` `REQUESTS_BACKEND=orchestrator`, `ORCHESTRATOR_BASE_URL` y `ORCHESTRATOR_CHANNEL_KEY`. La clave tiene la forma `<keyId>.<secret>`, sin el prefijo `Bearer`, y necesita los dos scopes. `PORTAL_DATA_DIR` es opcional. Con un valor ausente o inválido, el servidor registra el motivo al arrancar, sin el valor, y responde `500` a todas las peticiones.

### Canal de origen

La API determina el canal en el servidor y registra como `WEB` toda petición autenticada con JWT. El cliente carece de un campo o una cabecera para declararlo. Consulta el [contrato de solicitudes](../../../docs/api-requests.md), secciones «Actualización parcial» y «Canales, acceso y trazabilidad».

El portal actúa solo como canal Web. El aviso de continuidad nombra los canales `WEB`, `WHATSAPP` y `CALL_CENTER`, y muestra «otro canal» para cualquier otro valor.

### Identidad

El sitio se llama «Portal del Paciente». Usa una paleta propia, definida como variables CSS en `app/globals.css`, y prescinde del verde y del logotipo de Salud Digna. Todas las pantallas muestran una franja fija con el texto «Prototipo Hackatec · datos sintéticos · no es el sitio oficial de Salud Digna».

| Uso | Variables | Contraste |
| --- | --- | --- |
| Texto principal | `--ink` sobre `--canvas` o `--surface` | 16.9:1 y 15.7:1 |
| Texto secundario | `--muted` sobre `--canvas` o `--surface` | 7.3:1 y 6.8:1 |
| Primario azul índigo | `--brand` sobre `--canvas`, y el inverso | 9.9:1 |
| Primario sobre su tono suave | `--brand` sobre `--brand-soft` | 8.1:1 |
| Éxito | `--success` sobre `--canvas` o `--success-soft` | 5.5:1 y 4.9:1 |
| Aviso | `--warning` sobre `--canvas` o `--warning-soft` | 6.9:1 y 6.2:1 |
| Error | `--danger` sobre `--canvas` o `--danger-soft` | 6.5:1 y 5.3:1 |

Todas las combinaciones superan el 4.5:1 del nivel AA. El portal usa las fuentes del sistema y carga cero fuentes, scripts o imágenes de terceros.

### Navegación

El portal tiene una sola navegación, en el encabezado. Sin sesión ofrece Estudios, Clínicas y Acceso. Con la cookie de sesión ofrece todas las secciones: Estudios, Clínicas, Mi espacio, Continuar, Citas, Ayuda y Perfil. Cerrar sesión está en `/perfil`.

**Pantallas de teléfono.** Por debajo de 640 px de ancho, la lista se pliega tras el botón «Menú» y se despliega debajo del encabezado, con un enlace por fila. El contenido baja en lugar de quedar tapado. El botón es un `<details>` nativo y la lista se muestra con CSS mientras está abierto, así que funciona sin JavaScript. Desde 640 px el botón desaparece y la lista queda siempre visible; si no cabe junto al nombre, pasa a la línea siguiente.

**Teclado.** El orden de tabulación es «Saltar al contenido», el nombre del portal, «Menú» y los enlaces. «Menú» se abre y se cierra con Intro o con Espacio, que es el comportamiento nativo de `<details>`. `components/header-menu.tsx` es un Client Component que solo añade el cierre del menú al cambiar de página, porque el encabezado persiste entre páginas.

**Tamaños y foco.** Los enlaces y el botón miden al menos 44 px de alto y de ancho. El encabezado y la franja de prototipo respetan las áreas seguras con `env(safe-area-inset-*)` y `viewport-fit=cover`. El `nav` lleva su etiqueta y hay un enlace «Saltar al contenido». El recuadro de foco usa `:focus-visible`: aparece al navegar con teclado y no al hacer clic en enlaces o botones. En el encabezado se dibuja por dentro de cada enlace, porque la franja de prototipo taparía su borde superior. Los campos de texto lo muestran también al hacer clic, porque así define el navegador esa pseudoclase. El enlace de la página abierta lleva `aria-current="page"`, y el de su sección lleva `aria-current="true"` cuando se está en una página interior. `components/nav-link.tsx` es un Client Component porque `usePathname` lo exige.

### Iconos

`app/icon.tsx` genera el icono de pestaña y `app/apple-icon.tsx` el que iOS usa en marcadores y favoritos. Ambos dibujan la figura de `app/icons/mark.tsx` con `ImageResponse` de `next/og`, que forma parte de Next, sin archivos binarios en el repositorio.

### Sesión

`POST /api/v1/auth/register` crea la cuenta y devuelve la cuenta y el perfil, sin token. Después del registro el portal llama a `POST /api/v1/auth/login` para obtener el JWT. Consulta la [guía pública](../../../docs/frontend-publico.md), sección «Cuenta e identidad».

El token dura `expiresIn` segundos. La API carece de renovación y de una operación de cierre de sesión. Al vencer, el paciente vuelve a iniciar sesión. Cerrar sesión en el portal elimina su cookie, y el token conserva su validez en la API hasta que vence. Consulta la misma sección de la guía pública y el [contrato de autenticación](../../../docs/api-auth.md), sección «Límites del MVP y comprobación local».

Las guías piden enviar `Authorization: Bearer <accessToken>` y omiten dónde guardar el token. El portal lo guarda en una cookie `HttpOnly` de su propio origen. El código del navegador no puede leer el token y nunca llama a la API. El navegador habla con el portal, y el servidor de Next llama a la API con el token de la cookie. Los manejadores de `app/api/` y los adaptadores de `lib/adapters` se ejecutan solo en el servidor. El token tampoco viaja por páginas ni acciones: el adaptador lo lee de la cookie al llamar, y al iniciar sesión lo guarda en ella directamente.

**Cookie.** Tras `POST /api/v1/auth/login`, el portal guarda `accessToken` en una cookie `HttpOnly`, `SameSite=Lax`, `Path=/` y con `Max-Age` igual a `expiresIn`. En producción la cookie lleva además `Secure` y el nombre `__Host-portal-session`. En desarrollo se llama `portal-session`. El token queda fuera del HTML, de las props, de la URL y del almacenamiento del navegador. El borrado repite los mismos atributos, porque el navegador rechaza un `Set-Cookie` con prefijo `__Host-` que omita `Secure`.

**Cierre de sesión.** Cerrar sesión borra la cookie del portal. La API carece de una operación para revocar el token, así que el token sigue siendo válido en la API hasta que vence. Quien lo hubiera copiado antes podría usarlo durante ese tiempo.

**Rutas protegidas.** Las rutas de `(account)` y `(booking)` exigen sesión, en dos pasos que siguen la guía de autenticación de Next.js:

1. `proxy.ts` hace una comprobación optimista. Si falta la cookie, redirige a `/acceso?destino=<ruta original>` sin llamar a la API.
2. Cada página protegida llama a `requireAccount()`, de `lib/session/session.ts`, que valida la sesión en el servidor pidiendo el perfil del paciente, hoy con `GET /api/v1/auth/me`. El portal nunca decodifica el token.

Cuando la API responde `401`, la página redirige a `/api/session/expired`. Ese manejador vuelve a preguntar a la API, borra la cookie solo si la sesión ya es inválida y lleva a `/acceso` con el destino original. Hace falta porque un Server Component no puede borrar cookies. Si la API no responde, la página muestra «Servicio no disponible» y conserva la cookie.

El destino solo puede ser una ruta interna. `safeDestination()` rechaza lo que no empiece por `/`, lo que empiece por `//`, las barras invertidas y las rutas de acceso, y usa `/mi-espacio` en su lugar.

Al añadir una ruta a `(account)` o `(booking)` hay que registrar su prefijo en `lib/session/routes.ts` y llamar a `requireAccount()` en la página. Los grupos de rutas no aparecen en la URL, así que el proxy no puede deducirlos.

**Mutaciones.** Registro, acceso y cierre de sesión son Server Actions. Next solo las acepta por `POST` y compara la cabecera `Origin` con `Host`: una petición de otro origen se rechaza antes de ejecutar la acción. Next responde `500` en ese caso. `proxy.ts` repite antes la misma comparación y responde `403`, sin sustituir la comprobación de Next, que sigue activa. Si algún día se configura `serverActions.allowedOrigins`, el proxy debe aceptar los mismos orígenes.

**Encabezado.** Los enlaces cambian de «Acceso» a las secciones del área personal según exista la cookie, sin llamar a la API. Los enlaces a rutas protegidas no se precargan, para no validar la sesión en cada precarga. Como el encabezado lee la cookie, todas las páginas se generan en cada petición y Next las sirve con `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`.

### Cliente de API y configuración

`API_BASE_URL` es obligatoria. `REQUESTS_BACKEND`, `ORCHESTRATOR_BASE_URL`, `ORCHESTRATOR_CHANNEL_KEY` y `PORTAL_DATA_DIR` solo importan en modo orquestador y se describen en «Adaptador del orquestador». Todas las lee solo el servidor, sin prefijo `NEXT_PUBLIC_`. `.env.example` documenta los nombres y los valores reales van en `.env.local`, que Git ignora. Sobre `API_BASE_URL`: `instrumentation.ts` la valida al arrancar con `checkConfiguration()`, de `lib/composition.ts`: debe usar `https`, salvo en `localhost` y `127.0.0.1`. Con un valor inválido, el servidor registra el error al arrancar y responde `500` a todas las peticiones. `next build` funciona sin la variable, porque ninguna página llama a la API durante la compilación.

`lib/adapters/general-api/client.ts` es el único punto de salida hacia la API y lleva `server-only`, así que un componente de cliente no puede importarlo. Cada llamada:

- construye sus propias cabeceras y envía solo `Accept`, `Content-Type` y `Authorization`, sin reenviar nada del navegador;
- tiene un tiempo de espera de 8 segundos y trata el fallo de red como «servicio no disponible»;
- registra en el log solo el método, la ruta y el motivo del fallo, nunca tokens, contraseñas ni cuerpos;
- descarta el cuerpo de los errores, de modo que el mensaje de la API nunca llega a la interfaz.

Los tipos salen del contrato. `pnpm --filter @salud-digna/patient-portal api:types` lee `docs/openapi.json` y genera `lib/adapters/general-api/schema.d.ts` con `openapi-typescript`. Hay que repetirlo cuando cambie el contrato. `ApiPath` limita las rutas del cliente a las que existen en ese archivo.

### Registro y acceso

`/registro` pide nombre, apellidos, correo, contraseña de 12 a 128 caracteres y teléfono opcional, con los límites de `RegisterDto`. `/acceso` pide correo y contraseña. El portal valida los datos antes de llamar a la API, porque la API cuenta cada intento de registro y de acceso, también los fallidos.

| Respuesta | Mensaje al paciente |
| --- | --- |
| `400` | Genérico, para revisar el formulario. |
| `401` | Genérico, sin distinguir cuenta inexistente de contraseña incorrecta. |
| `409` en registro | No se pudo crear la cuenta con ese correo. |
| `429` | Demasiados intentos, con la espera que indica `Retry-After`. |
| Sin respuesta o `5xx` | Servicio no disponible. |

`/perfil` muestra en solo lectura los datos de `GET /api/v1/auth/me` y el botón para cerrar sesión.

### Catálogo

`/estudios` y `/clinicas` listan `GET /api/v1/studies` y `GET /api/v1/clinics`. El portal envía solo los parámetros del contrato: `page`, `limit` y `q`. Muestra 12 tarjetas por página y pagina con `hasMore`. `/estudios/[id]` muestra `GET /api/v1/studies/{id}` y enlaza a `/tramite/nuevo?estudio=<id>` para agendar.

**Validación.** El servidor recorta `q` y `ciudad` a 100 caracteres, que es el máximo del contrato, y acepta `pagina` entre 1 y 10 000. Cualquier otro valor vuelve a la primera página. El identificador del detalle debe ser un UUID: si no lo es, el portal responde «no encontrado» sin llamar a la API. Un `400` o un `404` de la API también se muestran como «no encontrado».

**Textos y precio.** Los textos de la API se muestran siempre como texto, escapados por React. El precio llega como cadena decimal y solo se le da formato de pesos mexicanos al mostrarlo.

**Filtro por ciudad.** El contrato no filtra por ciudad. Con ese filtro, el portal recorre el listado de la API en páginas de 100, compara la ciudad sin distinguir mayúsculas ni acentos y pagina sobre las coincidencias. Se detiene en cuanto tiene las necesarias para la página pedida. El enfoque tiene límites:

- revisa como máximo 500 clínicas, y avisa en pantalla cuando llega a ese tope porque puede faltar alguna;
- una búsqueda puede costar hasta cinco llamadas a la API, y más cuanto más avanzada sea la página;
- compara el texto libre de `city`, así que «CDMX» no encuentra «Ciudad de México».

La solución de fondo es un parámetro de ciudad en la API.

**Caché.** Las respuestas públicas del catálogo se reutilizan durante 30 segundos con la opción `next.revalidate` de `fetch`. Next solo guarda respuestas `200`, así que un fallo de la API no queda en caché. Las peticiones con token usan siempre `cache: "no-store"`.

**Carga, vacío y error.** Los botones de búsqueda y los enlaces muestran «Buscando…» o «Cargando…» mientras dura la navegación, con `useFormStatus` y `useLinkStatus`. El portal prescinde de `loading.tsx` a propósito: con ese archivo la respuesta empieza con `200` antes de consultar la API, y el detalle de un estudio inexistente dejaría de responder `404`. Además, los listados seguirían cargando para siempre en un navegador sin JavaScript. Una lista vacía ofrece quitar los filtros. Si la API no responde, la página muestra «Servicio no disponible» con un enlace para reintentar la misma URL.

### Confirmación de la cita y ayuda del asesor

El paciente confirma su cita en el portal con `POST /api/v1/requests/{id}/confirm` y la versión vigente de la solicitud. Un reintento compatible recupera la misma cita. Consulta la guía pública, sección «Catálogos, solicitudes y citas».

Si el paciente necesita ayuda, genera un código de asistencia con `POST /api/v1/requests/{id}/assistance-code`, sin cuerpo, y lo entrega al asesor. El código tiene 22 caracteres, vence a los cinco minutos y se consume una vez. Con él, el asesor obtiene un permiso de 30 minutos para consultar la solicitud y confirmarla. Para editar las selecciones, el paciente usa su propia sesión. Consulta la [guía de Call Center](../../../docs/frontend-callcenter.md), sección «Recuperar una atención», y el [contrato de Call Center](../../../docs/api-call-center.md), sección «Emitir y canjear».

### Vinculación de WhatsApp

El paciente inicia la vinculación en el portal. `features/identity` llama a `POST /api/v1/identity/links` con `{"provider":"WHATSAPP"}` y muestra el `linkId` y el `code` de la respuesta. El paciente envía `vincular <linkId> <code>` desde su teléfono al remitente configurado. El desafío vence a los cinco minutos. `GET /api/v1/identity` lista las identidades de la cuenta. El campo `phone` del registro carece de efecto sobre la vinculación.

El recorrido requiere un proveedor de WhatsApp configurado en el entorno y un número de prueba habilitado. Consulta la guía pública, secciones «Cuenta e identidad» y «Demostración Web → WhatsApp → Call Center», y el [contrato de identidad](../../../docs/api-identity.md).

### Historial de la solicitud

En modo orquestador, `/tramite/[id]/historial` muestra la línea de tiempo de `GET /journeys/:journeyId/history`. En modo heredado el historial sigue sin pantalla: el adaptador heredado no lee `GET /api/v1/requests/{id}/journey`, descrito en el [contrato de Journey](../../../docs/api-journey.md).

### Actualización sin tiempo real

La API carece de tiempo real. El portal consulta el estado por REST a intervalos y compara `version` para detectar cambios hechos desde otro canal. La guía pública indica recargar `GET /api/v1/requests/{id}` al volver a la web, en su sección «Demostración Web → WhatsApp → Call Center».

### Dirección de desarrollo

El portal se sirve en `http://127.0.0.1:5173` durante el desarrollo. El puerto 3000, predeterminado de Next.js, es también el de la API local. El ejemplo de configuración de la API permite `http://localhost:5173`, que es un origen distinto, según [Desarrollo e integración](../../../docs/development.md). El portal prescinde de CORS porque sus llamadas a la API salen del servidor de Next.

### Trámite de agendamiento

El trámite sigue las reglas de la [guía pública](../../../docs/frontend-publico.md), sección «Catálogos, solicitudes y citas», y del [contrato de solicitudes](../../../docs/api-requests.md).

**Inicio.** `/tramite/nuevo?estudio=<id>` solo consulta: lee `GET /api/v1/requests/pending` y, si hay trámites abiertos, ofrece continuarlos o empezar otro. El trámite se crea con `POST /api/v1/requests` únicamente cuando el paciente pulsa el botón, mediante una Server Action y con el botón bloqueado durante el envío. Si llegó un estudio válido, se guarda en el contexto y el portal abre `/tramite/<id>`. Cuando la respuesta de la creación es incierta, por un fallo de red o un `5xx`, el portal consulta los pendientes antes de permitir otro intento: si encuentra el trámite recién creado continúa con él, y si no puede consultarlos bloquea el botón y pide revisar los trámites.

**Pantalla guiada por la API.** `/tramite/[id]` es una sola ruta. La pantalla la deciden `status` y `currentStep` de `GET /api/v1/requests/{id}`, nunca la URL ni datos guardados en el navegador.

| Estado | Paso | Pantalla |
| --- | --- | --- |
| `DRAFT` | `SELECT_STUDY` | Elegir estudio. |
| `IN_PROGRESS` | `SELECT_CLINIC` | Elegir clínica. |
| `IN_PROGRESS` | `SELECT_DATETIME` | Elegir fecha y hora. |
| `PENDING_CONFIRMATION` | `REVIEW` | Revisión, con las dos salidas. |
| `COMPLETED` | `CONFIRMED` | Cita confirmada. |
| `CANCELLED` | Cualquiera | Trámite cerrado. |

**Volver a un paso anterior.** La API no permite vaciar el estudio ni la clínica, solo sustituirlos, así que el servidor nunca retrocede a esos pasos por sí mismo. El parámetro `cambiar`, con los valores `estudio`, `clinica` u `horario`, abre el selector de un dato que ya está elegido y avisa de lo que se pierde: cambiar el estudio borra la clínica y el horario, y cambiar la clínica borra el horario. El parámetro no puede adelantar pasos ni abrir la revisión: se ignora si el dato aún no existe o si el trámite está cerrado. Nada cambia hasta que el paciente elige otro valor.

**Versiones.** Cada formulario envía la `version` que devolvió la API al pintar la página. Tras cualquier acción, el portal redirige a `/tramite/[id]`, que vuelve a leer el trámite: la pantalla refleja siempre lo guardado, también cuando la respuesta fue un error.

**Continuidad.** La página muestra un aviso con `lastChannel` y `updatedAt`, por ejemplo «Dejaste este trámite en WhatsApp hace 2 horas», cuando la última actividad fue en otro canal o hace más de cinco minutos. «Guardar y continuar después» llama a `POST /api/v1/requests/{id}/pause` y lleva a `/continuar`. Desde esa lista, «Continuar este trámite» llama a `POST /api/v1/requests/{id}/resume` antes de abrirlo.

**Horarios.** La API no ofrece disponibilidad, así que la rejilla es de demostración y se define en un solo archivo, `features/requests/schedule.config.ts`: 14 días naturales desde hoy, de 08:00 a 18:00 cada 30 minutos, con el último horario a las 17:30, en la zona `America/Mexico_City` y solo con horarios futuros. La pantalla lleva la etiqueta «Horarios de demostración». `scheduledAt` se envía en ISO 8601 con segundos y zona explícita, como `2026-11-26T10:00:00-06:00`. El servidor comprueba que el horario recibido pertenece a la rejilla antes de llamar a la API.

**Revisión.** Muestra estudio, clínica, fecha y hora y precio, y admite una nota opcional de hasta 500 caracteres con el aviso de no incluir datos clínicos. Tiene dos salidas:

- «Confirmar mi cita» llama a `POST /api/v1/requests/{id}/confirm`. Al terminar, la página muestra «Cita confirmada» con el enlace a `/citas/<id de la cita>`.
- «Pedir ayuda a un asesor» llama a `POST /api/v1/requests/{id}/assistance-code`. El código se genera solo al pulsar el botón. Llega en la respuesta de la acción, nunca en la URL, y desaparece al recargar. La pantalla indica su vencimiento y que es de un solo uso.

**Errores.**

| Respuesta | Qué hace el portal |
| --- | --- |
| `409` | Vuelve a leer el trámite y muestra el estado actual con el aviso «Tu trámite cambió desde otro canal». El paciente debe repetir la acción sobre ese estado. |
| `404` | Página de no encontrado, idéntica para un trámite inexistente y para uno ajeno. |
| `401` | Flujo de sesión vencida: borra la cookie y lleva a `/acceso` con el trámite como destino. |
| `400` | Mensaje genérico, sin el texto de la API. |
| Sin respuesta o `5xx` | Aviso de servicio y vuelta al estado guardado. |

Next entrega el `404` de una página dinámica como un documento mínimo que se completa con JavaScript. El estado HTTP es correcto, pero sin JavaScript la página queda en blanco. Ocurre igual en el detalle de un estudio.

**Seguridad.** Todas las escrituras son Server Actions. Las llamadas del trámite llevan token, así que ninguna respuesta se guarda en caché, y el portal no usa almacenamiento del navegador.

**Pendiente.** `/citas/[id]` y, en modo heredado, el historial de `GET /api/v1/requests/{id}/journey` aún no tienen pantalla.

## Lo que la API no ofrece

| Función | Estado en la API | Fuente |
| --- | --- | --- |
| Cancelar o reprogramar una cita | Sin operación. | Guía pública, «Catálogos, solicitudes y citas». |
| Cancelar un trámite | Sin operación. El contrato define el estado `CANCELLED` y carece de una operación para cancelar. | `docs/openapi.json`. |
| Disponibilidad de horarios | Los horarios son demostrativos y carecen de verificación de disponibilidad real. | Guía pública, «Catálogos, solicitudes y citas». |
| Edición de perfil | Sin operación. `GET /api/v1/auth/me` solo consulta. | `docs/openapi.json`. |
| Tiempo real | Sin operación ni eventos publicados. | [Arquitectura](../../../docs/architecture.md), «Integración pública». |
| Resultados | Sin operaciones ni estados. `COMPLETED` significa cita confirmada, con paso `CONFIRMED`. | Guía pública, tabla de estados. |
| Vaciar el estudio o la clínica de un trámite | Sin operación. Solo `scheduledAt` y `notes` admiten `null`: el estudio y la clínica se sustituyen por otros. | `docs/openapi.json`, `UpdateRequestContextDto`. |
| Consultar la cita de un trámite | Sin operación directa. El portal recorre `GET /api/v1/appointments` y compara `requestId`. | `docs/openapi.json`. |

El portal deja estas funciones fuera hasta que exista un contrato acordado.

## Pendientes con el equipo de API

| Pendiente | Efecto en el portal |
| --- | --- |
| Sugerencia: filtrar clínicas por ciudad en `GET /clinics` | Sin ella, el portal filtra en su servidor con el tope de 500 clínicas descrito en «Catálogo». |
| Límite de registro e inicio de sesión por IP | Ambas operaciones comparten 10 intentos por IP cada 15 minutos, según el contrato de autenticación. Todas las llamadas llegan desde el servidor del portal, así que los pacientes compartirían ese límite. |

Las preguntas abiertas para el equipo del orquestador están en «Adaptador del orquestador».

## Decisiones retiradas

Esta sección conserva lo que el portal decidió antes y ya no aplica. Nada de lo descrito aquí existe en el código actual.

### PWA instalable y canal móvil

**Vigencia.** Del 2026-11-22 al 2026-11-24. La sustituye «El portal es solo un sitio web», por el cambio de arquitectura del proyecto. El último commit que la contiene es `464e3fe`.

**Qué decidía.**

- El canal móvil se cubría instalando este mismo portal como PWA, sin un proyecto móvil aparte.
- El portal detectaba con `display-mode: standalone` si corría instalado y usaba esa señal solo para su interfaz, mediante la variante `standalone:` de `app/globals.css`. `lib/channel` quedaba reservado para leer el modo desde el código.
- Había dos navegaciones, ambas siempre en el HTML. En el navegador se veía el encabezado con Estudios, Clínicas y Acceso. En modo instalado se ocultaba ese menú y aparecía una barra inferior con Inicio, Continuar, Citas y Ayuda.
- `app/manifest.ts` generaba `/manifest.webmanifest` con `display: standalone`, `start_url: /mi-espacio`, `scope: /`, `lang: es`, el nombre corto «Paciente», el color de tema `#3730a3` y el fondo `#ffffff`.
- `app/icons/[file]/route.tsx` producía en la compilación los iconos de instalación de 192 y 512 px y uno maskable de 512 px.
- El service worker quedaba para un cambio posterior. Chrome dejó de exigirlo para instalar desde su menú a partir de la versión 108 en Android y la 112 en escritorio, según [su blog para desarrolladores](https://developer.chrome.com/blog/update-install-criteria).
- Quedaba pendiente con el equipo de API la sugerencia de distinguir `MOBILE` de `WEB`, porque el uso instalado se registraba como `WEB`.

**Qué se retiró del código.** `app/manifest.ts`, `app/icons/[file]/route.tsx`, `components/installed-nav.tsx`, `lib/channel/`, la variante `standalone:` y la utilidad `safe-bottom` de `app/globals.css`, la constante `APP_SHORT_NAME` de `lib/brand.ts`, el nombre del canal `MOBILE` en `features/requests/steps.ts` y las excepciones del manifiesto y de los iconos en el `matcher` de `proxy.ts`.

**Qué se conserva.** El icono de pestaña y el de iOS, `viewport-fit=cover` con las áreas seguras, y el tipo `Channel` de `lib/adapters/general-api/schema.d.ts`, que se genera desde el contrato de la API y por eso incluye `MOBILE`.
