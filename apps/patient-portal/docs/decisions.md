# Decisiones del portal del paciente

`apps/patient-portal/` es la web pública del paciente. Usa Next.js, TypeScript y Tailwind CSS. Desde el 2026-11-24 es solo un sitio web, como explica «El portal es solo un sitio web».

Este documento registra las decisiones del portal y el estado de la API del que dependen. El estado corresponde al contrato y a las guías publicados en `main` el 2026-11-22, y al contrato del orquestador publicado en `main` el 2026-11-24. El documento vive junto a la aplicación porque cada equipo mantiene la documentación de la suya, según la [guía de revisión de pull requests](../../../docs/revision-pull-requests.md).

El portal tiene su carcasa, con identidad, rutas y un encabezado con la navegación, además de registro, acceso, sesión, catálogo y trámite de agendamiento contra la API. El trámite puede registrarse también en el orquestador, como explica «Adaptador del orquestador», y, con continuidad identificada, el paciente ve sus trámites de cualquier canal, como explica «Continuidad identificada». `/mi-espacio` lista los trámites activos en ese modo y muestra solo su título en los demás. `/citas`, `/citas/[id]` y `/ayuda` muestran solo su título.

El estado del trabajo, para retomarlo en otra sesión, está en [estado.md](estado.md).

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
| Orquestador | Recibe de cada canal mensajes JSON con los cambios del trámite. Cada canal le consulta el último estado registrado de un trámite. | `apps/orchestrator/docs/journey-writes.md`, `journey-queries.md` y `continuity-codes.md`. Sin OpenAPI. |

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
| `continuity-requested` | «Generar código de continuidad» | Ninguna: la API actual no tiene códigos de continuidad. |
| `continuity-redeemed` | «Continuar con este código» | Ninguna. |

Cada evento lleva un `eventId` único, que la acción genera al ejecutarse, el identificador del trámite y, de forma opcional, la versión que vio el paciente en `expectedVersion`. Empezar un trámite desde un estudio emite dos eventos: `request-started` y `study-chosen`. Un evento que el adaptador activo no soporta devuelve `rejected` sin llamar a ningún servicio.

La notificación devuelve un acuse, no el estado del trámite: el identificador del trámite, la versión resultante si el servicio la informa, en `help-requested` el código de asistencia y en `continuity-requested` el código de continuidad. Después de cada evento la página vuelve a consultar el trámite. Con el error `unavailable` el resultado es incierto, así que el portal consulta los pendientes antes de permitir otro intento.

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

**Contrato.** `apps/orchestrator/docs/journey-writes.md`, `journey-queries.md`, `continuity-codes.md`, `patient-identity.md` y `data-model.md`, y `apps/orchestrator/README.md`, tal como están en `main` en el commit `ff989cc`, que esta rama integra. El orquestador no publica un OpenAPI, así que este adaptador no tiene tipos generados: `mapping.ts` comprueba la forma de cada respuesta antes de usarla.

**Decisiones del propietario del portal.**

- Lo que el orquestador no soporta se oculta. El portal no guarda la fecha ni la nota por su cuenta y no crea copias del trámite en la API general.
- Un trámite de otro canal entra al portal con un código de continuidad. No hay carpeta de traspaso.
- Una creación con resultado incierto se reenvía con la misma clave de idempotencia.
- El listado de trámites por paciente del orquestador no se integra todavía. «Identidad del paciente» explica qué haría falta.

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
| `continuityCodes`, códigos de continuidad | No | Sí | `continuity-codes.md`. La API general no los tiene. |
| `patientListing`, lista por paciente | Sí | No | La consulta por paciente del orquestador exige una afirmación de identidad que el portal no puede obtener. |

**Eventos.**

| Evento | Llamada al orquestador |
| --- | --- |
| `request-started` | `POST /journeys` con `{"type":"APPOINTMENT"}` y la cabecera `Idempotency-Key`. |
| `study-chosen`, `clinic-chosen` | `POST /events` con `JOURNEY_CONTEXT_UPDATED`. |
| `confirmation-requested` | `POST /events` con `JOURNEY_STATUS_CHANGED` a `PENDING_CONFIRMATION`. |
| `request-cancelled` | `POST /events` con `JOURNEY_STATUS_CHANGED` a `CANCELLED`. |
| `continuity-requested` | `POST /journeys/:journeyId/continuity-codes`, sin cuerpo. |
| `continuity-redeemed` | `POST /continuity-codes/redeem` con `{"code":"…"}`. |
| Los otros seis | Ninguna. El adaptador devuelve `rejected` sin llamar. |

Cada `POST /events` lleva el `eventId` como `externalEventId`, `schemaVersion: 1`, `expectedVersion` con la versión que vio el paciente y `occurredAt` en UTC con milisegundos. Antes de publicar un estudio o una clínica, el adaptador comprueba en el catálogo de la API general que existe: el orquestador guarda referencias opacas y no las valida.

**Lectura.** `getRequest` hace dos consultas, `GET /journeys/:journeyId` y `…/context`, y las une en el trámite del modelo. No son atómicas entre sí: un evento de otro canal puede caer entre ambas. El orquestador no informa del último canal, así que `lastChannel` queda vacío y el aviso de continuidad solo indica el tiempo transcurrido. `getAppointment` devuelve siempre «sin cita»: el contexto puede traer `appointmentId`, pero ningún evento lo escribe. `getHistory` lee `…/history` con `limit` y `cursor`.

**Respuestas del orquestador.** `failures.ts` es la única traducción de sus códigos HTTP.

| Respuesta | Qué hace el adaptador |
| --- | --- |
| `400` | `invalid`. |
| `401` y `403` | `unavailable`. Hablan de la clave del canal, no del paciente: su sesión sigue abierta. |
| `401`, `403` y `404` al crear un trámite | `rejected`. No se creó nada, así que el aviso al paciente no habla de resultado incierto. |
| `404` | `access-expired`, y olvida el permiso. Solo se llama por trámites que el registro atribuye al paciente. |
| `404` al canjear un código | `not-found`: código desconocido, vencido, ya usado o emitido por este mismo canal. |
| `409` | Vuelve a leer el contexto y devuelve `conflict`. Si la versión no cambió, deja constancia en el log. |
| `429` | `rate-limited`. El orquestador limita el canje a diez intentos por minuto para todo el canal. |
| Tiempo de espera agotado en `POST /events` | Un único reenvío con el mismo cuerpo, byte a byte. Si también falla, `unavailable`. |
| Sin respuesta o `5xx` en `POST /journeys` | Un único reenvío con la misma `Idempotency-Key`. Si también falla, `unavailable`. |
| Sin respuesta o `5xx` en el resto | `unavailable`. |

**Creación idempotente.** `POST /journeys` exige `Idempotency-Key`: 32 bytes en base64url. El adaptador la deriva con SHA-256 del `eventId`, que la acción genera al azar. Reenviar la misma petición con la misma clave devuelve el mismo trámite y, mientras el permiso inicial siga vigente, un permiso nuevo.

- Si el primer envío queda sin respuesta útil, el adaptador lo repite una vez.
- Si el segundo tampoco responde, guarda la clave en memoria, por paciente, durante cinco minutos. El siguiente intento de ese paciente la reutiliza: recupera el trámite si llegó a crearse y lo crea si no. No hay duplicado ni trámite huérfano.
- Tras un reenvío el acuse va sin versión: la respuesta repite el estado inicial aunque el trámite haya avanzado.
- Un reintento tardío puede llegar sin permiso. El trámite se anota igual y aparece como «Necesita un permiso nuevo».

**Códigos de continuidad.** Un código permite seguir un trámite en otro canal. Tiene doce caracteres, es de un solo uso y vence a los cinco minutos como máximo, nunca después del permiso con el que se emitió.

- **Emitir.** «Continuar en otro canal» aparece desde que el trámite tiene un estudio. El código se pide solo al pulsar el botón. Llega en la respuesta de la acción y se muestra con su vencimiento: no viaja en la URL ni en una cookie, y no se guarda en el navegador, en el registro ni en el servidor. Al recargar la página desaparece. Cada pulsación emite un código distinto.
- **Canjear.** `/continuar` tiene el campo «Tengo un código de continuidad». Al canjearlo, el trámite se añade al registro del paciente de la sesión y el permiso queda solo en memoria.
- **Validación.** El servidor quita espacios y guiones, pasa a mayúsculas y corrige las letras que el alfabeto excluye por parecerse a un número: O pasa a 0, e I y L pasan a 1. Lo que no tenga forma de código no llega al orquestador.
- **Mensaje único.** Código mal escrito, desconocido, vencido, ya usado o emitido en este mismo canal muestran el mismo texto. Lo escrito no vuelve en la página.
- **Límite de intentos.** Cinco canjes fallidos por paciente cada diez minutos, contados por el almacén de intentos de `lib/state`. Se cuenta por cuenta, así que cubre todas las sesiones del paciente. Un canje correcto y los avisos `429` o `5xx` del orquestador no gastan intentos.
- **El código es la autorización.** No prueba la identidad de quien lo trae: el trámite pasa al registro de quien lo canjea con sesión.
- **Mismo canal.** El orquestador no deja canjear en Web un código emitido en Web. Un trámite propio con el permiso vencido solo se recupera con un código emitido en otro canal.

**Cabeceras secretas.** `Authorization`, `X-Journey-Grant` e `Idempotency-Key` se escriben en un solo lugar, `client.ts`, y no salen de esa función. La clave del canal y los permisos viajan dentro de `Secret`, que devuelve una marca si alguien lo convierte a texto, a JSON o lo inspecciona. El log registra solo el método, la ruta del contrato y el motivo: nunca cabeceras, cuerpos, códigos ni identificadores. El cliente rechaza las redirecciones, que reenviarían las cabeceras a otro destino. Ningún resultado que llega a páginas o acciones contiene un permiso.

**Registro del canal Web.** El portal anota los trámites que inicia y los que adopta con un código. `lib/state/file-registry.ts` los guarda en `web-channel-registry.json`, dentro de `PORTAL_DATA_DIR`. Por defecto es `.data/` en el portal, que Git ignora.

- Contiene, por identificador de cuenta, el identificador de cada trámite, cuándo lo registró el portal y cuándo supo que quedó cerrado. Nunca permisos, claves ni códigos.
- La escritura es atómica: el contenido completo va a un archivo temporal de la misma carpeta y sustituye al registro con un renombrado.
- La carpeta se crea con permisos `0700` y el archivo con `0600`. En Windows los permisos los fija la carpeta.
- Las escrituras pasan por una cola, de una en una. La copia en memoria solo cambia si el archivo quedó escrito.
- Sirve con un único proceso del portal. Varias instancias necesitarían un almacén compartido.

**Permisos.** El almacén de permisos de `lib/state/memory.ts` guarda cada permiso solo en memoria, asociado a cuenta y trámite, con el vencimiento que informó el orquestador. Al reiniciar el servidor se pierden. Un trámite del paciente sin permiso vigente devuelve el error `access-expired`.

**Pertenencia.** Toda lectura o escritura pasa por `resolveAccess`. Primero pide el perfil a la API general, porque el orquestador no conoce al paciente ni su sesión. Después comprueba en el registro que el trámite es de esa cuenta: si no lo es, responde «no encontrado» sin llamar al orquestador. Por último busca el permiso: sin uno vigente responde `access-expired`, también sin llamar.

**Pantallas en modo orquestador.**

| Pantalla | Qué muestra |
| --- | --- |
| `/tramite/nuevo` | Texto del flujo sin horario. La lista de abiertos sale del registro. |
| `/tramite/[id]` | Estudio, clínica y revisión. Sin horario, nota, «Guardar y continuar después», confirmación directa ni ayuda de asesor. |
| Continuar en otro canal | Desde que hay estudio: botón «Generar código de continuidad», el código, su vencimiento y «Copiar código». |
| Revisión | Resumen y botón «Enviar a confirmación». |
| Pendiente de confirmación | Título «Pendiente de confirmación», resumen, folio del trámite con botón de copiar y «Puedes continuar por WhatsApp o Call Center.». |
| Cancelar | Enlace «Cancelar trámite». El formulario que cancela solo existe en la página tras pedirlo, con `?cancelar=1`. |
| `/continuar` | Lista del registro. Con permiso vigente, el estado del trámite. Sin él, «Necesita un permiso nuevo», con folio y fecha de registro y sin datos del trámite. Debajo, el campo «Tengo un código de continuidad». |
| `/tramite/[id]/historial` | Línea de tiempo con el tipo de evento en español, el canal que lo produjo y la fecha. En modo heredado responde `404`. |

El folio es el identificador del trámite. Mientras el trámite está pendiente de confirmación, el paciente puede cambiar el estudio o la clínica: el orquestador lo devuelve a revisión. El aviso «Copiado.» vale solo para la pantalla en la que se pulsó: desaparece al cambiar la ruta o sus parámetros, por ejemplo al abrir la confirmación de cancelar.

**Identidad del paciente.** `patient-identity.md` añade `GET /journeys`, que lista hasta cien trámites de un paciente, y la creación identificada. Las dos exigen la cabecera `X-Patient-Assertion`. El portal no lo integra porque le falta lo siguiente:

- Una forma de obtener la afirmación. Hoy solo la emite un operador con una CLI local, para pacientes ficticios, ligada a un canal y a una sesión, y vence a los cinco minutos. El contrato deja pendiente su emisión automática.
- La correspondencia entre la cuenta de la API general y el identificador institucional del paciente. La API general no ofrece ese identificador.
- Guardar la afirmación en el servidor, ligada a la sesión, y fuera de los logs.

Aun con el listado, el portal solo vería resúmenes: identificador, tipo, estado y fechas. Para abrir un trámite haría falta igualmente un permiso, que llega con un código de continuidad.

**Prueba contra los servicios reales.** El 2026-11-24 se hizo un recorrido contra la API general y el orquestador desplegados, con la cuenta de prueba: un acceso, un trámite creado, estudio, código de continuidad, clínica, historial y cancelación. El trámite pasó por cuatro versiones: la 1 al crearse en `DRAFT`, la 2 en `IN_PROGRESS` y `SELECT_CLINIC`, la 3 en `REVIEW` y la 4 al quedar `CANCELLED`. Todas las respuestas tuvieron la forma, los códigos y la cabecera `Cache-Control: no-store` que describe el contrato. El canal del portal figura en el historial con el código `demo-web`. No se probaron contra el servicio real el canje, la paginación del historial, el envío a confirmación ni las respuestas de error.

**Qué quedó terminado.**

- Selección de adaptador y capacidades, con las pantallas y las acciones de los dos modos.
- Cliente HTTP del orquestador, con sus cabeceras fuera de logs, errores y respuestas.
- Crear el trámite con reenvío idempotente, estudio, clínica, envío a confirmación, cancelación, lectura e historial paginado.
- Emitir y canjear códigos de continuidad, con validación, mensaje único y límite de intentos.
- Registro en archivo, permisos en memoria, error `access-expired` y comprobación de pertenencia.
- Un orquestador simulado y una suite para este modo, fuera del repositorio.

**Qué es provisional y por qué.**

| Provisional | Por qué |
| --- | --- |
| El registro del canal Web | Sustituye a la consulta por paciente, que el portal no puede usar. Un trámite de otro canal solo aparece tras canjear un código. |
| «Necesita un permiso nuevo» | El permiso dura cinco minutos y el contrato deja pendiente su renovación. Pasado ese tiempo, el portal solo recupera el trámite con un código emitido en otro canal. |
| El flujo sin fecha, nota ni cita | El contrato no los cubre. El trámite termina en «Pendiente de confirmación» y la cita oficial no se crea desde el portal. |
| El último canal y los nombres de canal | El orquestador no informa del último canal. En el historial, el canal se reconoce por su código: `web`, `whatsapp` o `call` dentro del nombre. Cualquier otro se muestra tal cual. |
| Un solo proceso | Registro, permisos, claves de creación pendientes y contador de intentos viven en el proceso del portal. |
| Límite de canje del canal | Los diez canjes por minuto del orquestador son de todo el canal Web. Unas pocas sesiones pueden agotarlos para todos. |

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
| `Idempotency-Key` pide 32 bytes aleatorios generados por el canal y conservados para los reintentos. | La clave es el SHA-256 del `eventId`, que la acción genera al azar. Tras un resultado incierto se conserva en memoria, por paciente, cinco minutos. |
| El contrato dice que el código tiene «12 caracteres Base32», sin fijar el alfabeto. | El ejemplo del contrato usa cifras que el Base32 estándar no tiene. El portal usa el alfabeto sin I, L, O ni U y corrige esas letras al canjear. |
| El contrato no dice si un intento de canje mal formado cuenta para el límite del canal. | El portal filtra antes lo que no tiene forma de código, para no gastar el límite compartido. |
| Un código acredita autorización, no identidad. | Quien lo canjea con sesión añade el trámite a su registro, aunque otro paciente lo hubiera iniciado. |

**Preguntas para el equipo del orquestador.**

1. **Permiso.** Sigue abierta. Los códigos de continuidad cubren el paso a otro canal, pero el canal emisor no puede canjear los suyos y el contrato deja pendiente la renovación. ¿Cómo recupera el canal Web un trámite propio pasados los cinco minutos sin pasar por otro canal?
2. **Fecha.** Sigue abierta. ¿`JOURNEY_CONTEXT_UPDATED` aceptará `scheduledAt`? Sin fecha, la API general no puede crear la cita.
3. **Confirmación.** Sigue abierta. ¿Quién crea la cita oficial y cómo se informa `COMPLETED` y `appointmentId` al orquestador?
4. **Paciente.** Respondida en parte. `GET /journeys` lista los trámites de un paciente y los códigos de continuidad llevan un trámite de un canal a otro. Falta saber cómo obtiene el portal la afirmación de identidad de un paciente sin la CLI del operador.
5. **Acceso.** Respondida para la demo: el portal tiene URL y clave, y su canal figura como `demo-web`. Falta la lista de códigos de los demás canales.

**Puesta en marcha.** Define en `.env.local` `REQUESTS_BACKEND=orchestrator`, `ORCHESTRATOR_BASE_URL` y `ORCHESTRATOR_API_KEY`. La clave tiene la forma `<keyId>.<secret>`, sin el prefijo `Bearer`, y necesita los scopes `EVENTS_PUBLISH` y `JOURNEYS_READ`: emitir un código exige los dos. `PORTAL_DATA_DIR` es opcional. Con un valor ausente o inválido, el servidor registra el motivo al arrancar, sin el valor, y responde `500` a todas las peticiones.

### Continuidad identificada

**Fecha.** 2026-11-24.

**Contrato.** [Continuidad identificada](contratos/continuidad-identificada.md), entregado por el equipo del orquestador, y desde `17c9b27` el contrato publicado en `main`: [el emisor de la API central](../../../docs/api-patient-assertions.md) y la «Recuperación automática» de [identidad del paciente del orquestador](../../orchestrator/docs/patient-identity.md). Cómo quedó cada diferencia está más abajo, en «Contrato frente al código».

**Decisión.** El paciente cambia de canal sin código. Cada canal acredita al paciente ante el orquestador, y el orquestador le devuelve sus trámites, vengan del canal que vengan. El código de continuidad se conserva como alternativa discreta.

**Modo de identidad.** `PATIENT_IDENTITY_MODE` lo elige y solo lo lee el servidor.

- `none`, por defecto, conserva el comportamiento anterior sin cambios: registro del canal Web, permiso de cinco minutos y «Necesita un permiso nuevo».
- `assertion` exige `REQUESTS_BACKEND=orchestrator`. Cada trámite nuevo y cada listado llevan la acreditación del paciente en `X-Patient-Assertion`.
- En modo `assertion`, si no hay acreditación no se crea ni se lee nada y el paciente ve «No pudimos verificar tu identidad». Nunca se recurre a la creación anónima, que el orquestador todavía acepta sin la cabecera.
- Un valor inválido detiene el arranque. Al arrancar, el servidor registra los modos activos y el identificador público de la clave del canal, nunca su secreto.

**Emisor de acreditaciones.** Es la interfaz `AssertionIssuer` de `lib/identity/ports.ts`. Obtiene la acreditación del paciente de la sesión que ya validó el servidor y no recibe ningún dato del navegador. La implementación es la de la API central, en `lib/adapters/general-api/assertions.ts`.

- `POST /api/v1/auth/patient-assertions` con la sesión del paciente, la credencial del canal Web en `X-Patient-Assertion-Channel-Key` y el cuerpo `{}`. La credencial está en `PATIENT_ASSERTION_CHANNEL_KEY`, 32 bytes en base64url, distinta de la clave del orquestador. Sin ella, el modo `assertion` no arranca.
- El servidor construye la petición y no reenvía nada del navegador, tampoco `Origin`.
- Cualquier fallo del emisor es `identity-unavailable`: su `401` no distingue entre la sesión y la credencial del canal, y la sesión ya se validó antes. El código queda en el registro.
- La respuesta es `{assertion}`, un JWS legible. El portal no verifica la firma, que es tarea del orquestador. Solo lee su `exp` para no guardarlo más de lo que vale.
- El 2026-11-24 se retiró el emisor de simulación (`PATIENT_ASSERTION_PROVIDER` y `PATIENT_ASSERTION_SIMULATOR_KEY`). Las pruebas usan el emisor real contra la API general simulada, que implementa el mismo contrato.
- La caché, en `lib/identity/cache.ts`, guarda en memoria una acreditación por sesión, con el SHA-256 del token como clave. Nunca la guarda más de cinco minutos ni más allá de su `exp`, y la renueva 30 segundos antes de vencer. Al cerrar sesión se olvida.
- La acreditación nunca llega al navegador, al registro de archivo ni a los logs.

**Adaptador del orquestador en modo `assertion`.**

- **Creación.** `POST /journeys` con `X-Patient-Assertion` e `Idempotency-Key`. Si el orquestador responde `404` a una acreditación guardada, se pide otra y se reenvía una sola vez con la misma clave de idempotencia.
- **Listado.** `GET /journeys?active=true`. `/continuar`, `/mi-espacio` y `/tramite/nuevo` muestran folio, estado y fecha. El detalle se lee al abrir el trámite.
  - El orquestador responde `404` a una identidad central que aún no tiene ningún trámite: su primera creación identificada establece el vínculo. Por eso el `404` del listado se muestra como lista vacía, para que un paciente nuevo pueda empezar.
  - Ese `404` no se reintenta con otra acreditación, para no pedir una nueva en cada visita de un paciente sin trámites. Si la acreditación fuera inválida, la creación lo diría y no crearía nada.
- **Permiso.** Al abrir un trámite sin permiso vigente en memoria, el portal lo pide con `POST /journeys/:id/access-grants` y la acreditación de la sesión. La respuesta, `201` con `journeyId`, `grant` y `grantExpiresAt`, solo se acepta si es del trámite pedido. El permiso vence, a más tardar, con la acreditación que lo autorizó.
  - La pertenencia la decide el orquestador, así que el portal nunca usa un identificador de trámite del navegador sin ese paso.
  - Si el orquestador rechaza un permiso guardado, se pide otro y se reintenta una sola vez.
  - Un `404` de `access-grants` significa «no encontrado», igual para un trámite ajeno que para uno inexistente, y no se reintenta: repetir doblaría las llamadas de quien pruebe identificadores.
- **Registro del canal Web.** No se usa ni se prepara al arrancar. Se mantienen `expectedVersion`, `externalEventId` e `Idempotency-Key`.

**Pantallas.**

- En modo `assertion`, «Necesita un permiso nuevo» desaparece porque el permiso se renueva solo.
- «Continuar en otro canal» explica que basta identificarse en la app móvil o en Call Center. El código de continuidad queda plegado bajo «Otra forma de continuar», en `/continuar` y en el trámite.

**WhatsApp fuera del MVP.** Desde el 2026-11-24, los canales del MVP son el portal web, la app móvil nativa, Call Center y Administración. La interfaz del portal ya no ofrece WhatsApp como canal: los textos dicen «app móvil» o «Call Center». El nombre «WhatsApp» solo aparece en el historial, cuando un evento viene de ese canal. «Vinculación de WhatsApp», más abajo, describe una operación de la API general que el MVP no usa.

**Registro mínimo de errores.**

- Toda respuesta no 2xx del orquestador y de la API general deja método, ruta del contrato y código.
- La excepción son los `404` de un estudio o una clínica por identificador, que son enlaces a registros inactivos.
- Cada error mostrado al paciente deja `[portal] error mostrado en <lugar>: <tipo>`.
- Nada de esto incluye identificadores, cuerpos ni credenciales.

**Selección sin cambios.** Elegir el estudio o la clínica que ya tiene el contexto vigente no publica nada: la acción lee el trámite y, si la selección coincide, vuelve a la pantalla sin escribir, aunque la versión del formulario sea antigua. Así el historial que ve Administración no se llena de eventos vacíos. La pantalla ya ocultaba el botón de la opción elegida: la comprobación cubre otra pestaña o un formulario manipulado. Cuesta una lectura antes de cada selección, en los dos modos de trámites.

#### Contrato frente al código

Revisado el 2026-11-24 en el código de `apps/orchestrator` que hay en `main`, en `ff989cc`. Las rutas son relativas a `apps/orchestrator/`. La tabla describe aquella revisión. El commit `17c9b27` de `main`, integrado en esta rama, resolvió las diferencias: ver «Emisor conectado», a continuación.

| Punto | Contrato | Código del repositorio | Cómo quedó el portal |
| --- | --- | --- | --- |
| `POST /journeys` con acreditación | Crea el trámite asociado al paciente. | Existe: `src/journeys/journey-writes.controller.ts:21-24`. Misma respuesta que sin acreditación, con `id`, `status`, `grant` y `grantExpiresAt` (`src/journeys/journey-writes.service.ts:63` y `:103`). Una acreditación inválida, ajena o sin correspondencia responde `404` y nunca crea un provisional (`docs/patient-identity.md:64`). | Coinciden. El `404` se traduce a `identity-unavailable`. |
| `POST /journeys` sin acreditación | No lo dice. | Sigue aceptado como creación provisional, sin paciente (`journey-writes.controller.ts:25`, `docs/patient-identity.md:59`). | En modo `assertion` el portal nunca lo envía sin la cabecera. |
| Reintento de creación | Mantener `Idempotency-Key`. | Los reintentos con la misma clave deben acreditar al mismo sujeto y actor, aunque se renueve la acreditación (`docs/patient-identity.md:66-67`). | El reenvío conserva la clave y pide la acreditación de la misma sesión. |
| `GET /journeys?active=true` | Solo `DRAFT`, `IN_PROGRESS` y `PENDING_CONFIRMATION`. | Existe sin el filtro: ignora `active` y devuelve todos los estados, hasta 100, ordenados por actualización (`src/journeys/journey-queries.controller.ts:19-26`, `src/journeys/journey-queries.service.ts:39-43`). Exige `JOURNEYS_READ`. | Envía `active=true` y además filtra: solo cita, solo esos tres estados. Funciona con las dos versiones. |
| `POST /journeys/:id/access-grants` | Devuelve `grant` y su vencimiento, sin nombrar el campo. | **No existe.** Ningún archivo de `src/` ni de `docs/` lo menciona. La documentación vigente dice que la acreditación no sustituye al permiso, y que para continuar hace falta un código o un permiso de la CLI del operador (`docs/patient-identity.md:70-77`). | Implementado según el contrato, única fuente. Lee `grantExpiresAt`, como en la creación y el canje, y si falta, `expiresAt`. Hay que confirmar el nombre, el código de éxito y los scopes. |
| Formato de la acreditación | JWS firmado con Ed25519 por la API central. | HMAC-SHA256 con una clave compartida (`ORCHESTRATOR_PATIENT_IDENTITY_KEY`), forma `<contenido>.<firma de 43 caracteres>` y contenido `{channelId, identifierId, actorRef, exp}`, emitido por una CLI del operador (`src/journeys/patient-identity.ts:7`, `:36`, `:40` y `:45-70`). Un JWS, con tres partes y firma de 86 caracteres, no pasaría esa validación. | Sin efecto en el portal: trata la acreditación como un secreto opaco y no la decodifica. El orquestador tendrá que aceptar el JWS cuando llegue el emisor. |
| Vigencia | Cinco minutos como máximo. | 300 segundos (`patient-identity.ts:40`). | La caché nunca pasa de cinco minutos y renueva antes. |
| Tamaño | No lo dice. | Máximo 768 caracteres y una sola cabecera (`patient-identity.ts:47`). | El portal envía una sola cabecera. El tamaño depende del emisor. |
| Emisor `POST /auth/patient-assertions` | Previsto en `apps/api`. | **No existe** en `apps/api/src` ni en `docs/openapi.json`. | Emisor `pending`: el modo `assertion` falla con un aviso claro hasta que llegue. |

#### Emisor conectado

**Fecha.** 2026-11-24. **Contrato.** `main` en `17c9b27`: [`docs/api-patient-assertions.md`](../../../docs/api-patient-assertions.md), `docs/openapi.json` y [`apps/orchestrator/docs/patient-identity.md`](../../orchestrator/docs/patient-identity.md), «Recuperación automática».

| Pregunta que quedó abierta | Respuesta del contrato | Portal |
| --- | --- | --- |
| Autenticación del emisor | El JWT de la cuenta y `X-Patient-Assertion-Channel-Key` con el secreto del backend del canal, distinto de la clave del orquestador. | `PATIENT_ASSERTION_CHANNEL_KEY`, solo en el servidor. |
| Canal | Se deriva de la credencial. | Nada que enviar. |
| Cuerpo y respuesta | `{}` para un paciente. `200` con `{"assertion":"<JWS>"}` y `Cache-Control: no-store`. | El vencimiento sale del `exp` del JWS. |
| Errores | `400` cuerpo inválido, `401` credenciales, `403` rol o canal, `503` sin configuración. | Todos son `identity-unavailable`, con el código en el registro. |
| Formato | JWS `EdDSA`, `typ: sd-patient+jwt`, con `channel`, `customerId`, `sub`, `jti`, `iat` y `exp`, cinco minutos como máximo. | Opaco salvo `exp`. |
| `GET /journeys?active=true` | Ya filtra a `DRAFT`, `IN_PROGRESS` y `PENDING_CONFIRMATION`. Una identidad sin vínculo recibe `404`. | Lista vacía ante ese `404`. Conserva su propio filtro. |
| `access-grants` | Existe: `JOURNEYS_READ`, sin cuerpo, `201` con `journeyId`, `grant` y `grantExpiresAt`. Añade `PUBLISH_EVENT` si la clave lo tiene. Vence con la acreditación. | Lee esos tres campos y comprueba `journeyId`. |
| Consentimiento para el asesor | `POST /api/v1/auth/patient-assertion-consents`, dirigido al UUID del asesor y al canal de Call Center. | **Pospuesto después del MVP:** ver «Autorización para Call Center», a continuación. |

**Prueba real.** El 2026-11-24, con `a8ddcc4` contra la API central y el orquestador publicados, se probó todo esto: creación identificada con estudio y clínica, listado por identidad, renovación del permiso tras el vencimiento de la acreditación, historial y cancelación. No apareció ninguna diferencia con el contrato.

#### Autorización para Call Center

**Fecha.** 2026-11-24, revisada el 2026-11-25. **Estado: pospuesta después del MVP.** No está implementada.

**En el MVP.** El Call Center recupera los trámites del paciente a través del orquestador, sin intervención del portal y sin código. El portal no emite ninguna autorización para el asesor.

Lo que sigue se conserva como referencia para una fase posterior.

**Lo que dice el contrato.** [`docs/api-patient-assertions.md`](../../../docs/api-patient-assertions.md) y `apps/api/src/auth/`:

- **Petición.** `POST /api/v1/auth/patient-assertion-consents` con la sesión `PATIENT`, la credencial del canal Web en `X-Patient-Assertion-Channel-Key`, sin `Origin`, y el cuerpo `{"advisorId":"<UUID de cuenta del asesor>","channel":"<código del canal de Call Center>"}`.
  - Fuentes: líneas 58 y 79-84 del contrato, `patient-assertions.controller.ts:26-36` y `:47-57`.
- **Qué autoriza.** A ese asesor concreto, y solo en ese canal con rol `ADVISOR`, a obtener acreditaciones del paciente para listar sus trámites activos y pedir permisos.
  - Fuentes: `patient-assertions.service.ts:120-133` y `:99-107`.
- **Vigencia.** Como mucho cinco minutos, acotada por la sesión del paciente. Es reutilizable mientras dura y no se puede revocar antes en el MVP, así que no cabe «Retirar autorización».
  - Fuentes: `patient-assertions.service.ts:15`, `:54-57` y `:130`, y líneas 91-94 del contrato.
- **Respuesta.** `200` con `{"consent":"<JWS>"}`. Es una credencial: el contrato pide guardarla en el servidor y no devolverla al navegador.
  - Fuentes: línea 58 y líneas 52-53 del contrato.
- **Cómo la usa el Call Center.** Presenta el consentimiento a `POST /api/v1/auth/patient-assertions` con su JWT de asesor y su credencial de canal. Recibe una acreditación con la que lista los trámites y pide permisos.
  - Fuentes: líneas 59 y 85-89 del contrato, `patient-assertions.service.ts:99-117`.
  - `apps/call-center/src` no tiene todavía ningún código que lo haga.

**Preguntas para una fase posterior.** No bloquean el MVP. El contrato lo deja abierto: «Los backends deben acordar cómo identificar al asesor y entregar el consentimiento de forma privada» y «La transferencia entre backends queda pendiente de implementación» (líneas 81-84 y 95-97).

1. **UUID de la cuenta del asesor.** ¿De dónde lo obtiene el servidor del portal? No hay ninguna operación que lo devuelva al canal del paciente, y el contrato no dice que el paciente lo escriba ni lo elija.
2. **Código del canal de Call Center.** ¿Cuál es en el despliegue? El contrato usa `demo-callcenter` como ejemplo de `PATIENT_ASSERTION_CHANNELS`.
3. **Entrega del consentimiento.** ¿Cómo llega el JWS de consentimiento al backend del Call Center: qué operación, qué servicio y qué autenticación? El portal no puede mostrarlo ni enviarlo por el navegador.
4. **Momento de la autorización.** ¿Durante una llamada en curso, con un asesor ya asignado, o antes de que exista? Con cinco minutos de vigencia, eso decide el diseño de la pantalla.
5. **Lo que ve el paciente.** ¿Puede saber qué asesor autorizó, su nombre por ejemplo, para cumplir con «un asesor identificado» (línea 80)?

### Publicación del portal

**Fecha.** 2026-11-24. Revisión y preparación hechas sobre la compilación de producción, sin publicar nada. Los pasos para arrancar y la lista de publicación están en el [README](../README.md).

**Lo que necesita el servidor.**

| Requisito | Detalle |
| --- | --- |
| Proceso | `next build` y después `next start`, escuchando solo en `127.0.0.1`, detrás de un proxy inverso que termine TLS. |
| Una sola instancia | Registro, permisos, claves de creación pendientes y límites viven en el proceso. Con dos instancias, cada una vería trámites, permisos y contadores distintos. «Rendimiento y caché» explica qué haría falta para varias. |
| Variables | `API_BASE_URL`, `REQUESTS_BACKEND`, `ORCHESTRATOR_BASE_URL`, `ORCHESTRATOR_API_KEY`, `PORTAL_DATA_DIR`, `REGISTRATION_ENABLED` y `FORWARD_CLIENT_IP`, inyectadas desde la configuración privada del servicio. Ninguna lleva el prefijo `NEXT_PUBLIC_`. |
| `PORTAL_DATA_DIR` | Fuera de la carpeta del código, para que un despliegue nuevo no la borre. Propiedad del usuario del servicio, con permisos `0700`. Contiene qué cuenta tiene qué trámites: hay que incluirla en los respaldos y excluirla de cualquier carpeta servida. |
| Proxy | Debe conservar el `Host` original o enviar `X-Forwarded-Host`, escribir `X-Real-IP` con la IP del cliente y sobrescribir las cabeceras de reenvío que mande el navegador. Sin el host correcto, el portal rechaza todos los formularios con `403`. |
| HTTPS | Obligatorio para el navegador: la cookie de sesión lleva `Secure` y el prefijo `__Host-`. |

**Registro controlado.** `REGISTRATION_ENABLED` admite `true` o `false`. Sin valor, el registro está apagado en producción y encendido en desarrollo. Apagado, `/registro` responde no encontrado, `/acceso` no enlaza a «Crear cuenta» y la acción de servidor responde `404` sin llamar a la API general. Lo lee `lib/settings.ts`.

**Límites propios.** Todas las peticiones a la API general y al orquestador salen del servidor del portal, así que esos servicios no distinguen a un paciente de otro por su IP. El portal pone los suyos, en memoria, con el almacén de intentos de `lib/state` y los valores de `lib/session/limits.ts`.

| Límite | Regla | Aviso al paciente |
| --- | --- | --- |
| Acceso, por correo | Tres fallos libres. Cada fallo siguiente impone una espera: 30 segundos, 1, 2, 5 y 15 minutos. La cuenta de fallos se olvida tras 30 minutos sin fallos. | «Demasiados intentos. Espera … antes de volver a intentarlo.» |
| Acceso, por IP del cliente | Cinco fallos libres y las mismas esperas. | El mismo. |
| Trámites empezados | 20 por paciente y hora. Cuenta cada intento que llega al servicio. | «Has empezado demasiados trámites en la última hora. Podrás empezar otro en … minutos.» |
| Códigos de continuidad generados | 30 por paciente y hora. | «Has generado demasiados códigos en la última hora. Podrás generar otro en … minutos.» |
| Canjes fallidos de un código | 5 por paciente cada 10 minutos. | «Demasiados intentos. Espera unos minutos antes de probar otro código.» |

- Con una espera pendiente no se llama a la API general, ni siquiera con la contraseña correcta.
- Cuenta como fallo cualquier rechazo de la API. Que la API no responda o aplique su propio límite no cuenta.
- Un acceso correcto borra los fallos de ese correo. Los de la IP se conservan: una cuenta válida no debe servir para seguir probando otras desde la misma IP.
- El límite por correo permite que un tercero retrase el acceso de una cuenta que conoce, hasta 15 minutos cada vez. Es el coste de limitar por cuenta.
- Los topes por paciente necesitan saber de quién es la sesión, así que empezar un trámite y generar un código piden antes el perfil a la API general.
- Los límites se vacían al reiniciar el servidor y sirven con un único proceso.

**IP del cliente.** `lib/session/client-ip.ts` la toma solo de la cabecera `X-Real-IP`. El supuesto es que esa cabecera la escribe el proxy inverso de confianza, que sobrescribe cualquier valor del navegador, y que el portal escucha solo en `127.0.0.1`, de modo que nadie más puede presentarse como el proxy. Nunca se usa `X-Forwarded-For` ni ninguna otra cabecera del navegador. Si el proxy no envía la cabecera, o su valor no es una IP, no hay límite por IP: el límite por correo y los topes por paciente siguen activos, y el servidor lo avisa una vez en su registro.

**IP del cliente hacia la API general.** Preparada y apagada. Con `FORWARD_CLIENT_IP=true`, `lib/adapters/general-api/client.ts` añade una única cabecera, `X-Portal-Client-IP`, con la IP obtenida del proxy. No viaja en las lecturas del catálogo, que se guardan en caché, y no se reenvía ninguna otra cabecera del navegador. No debe encenderse hasta que el equipo de la API confirme que confía en esa cabecera solo cuando la petición viene del servidor del portal. El nombre de la cabecera también está pendiente de acordar: es propio porque un proxy delante de la API sobrescribe las cabeceras de reenvío habituales.

**Cabeceras.**

| Cabecera | Valor | Dónde |
| --- | --- | --- |
| `Strict-Transport-Security` | `max-age=15552000`, seis meses, sin `includeSubDomains`. Solo en producción. | `next.config.ts` |
| `Content-Security-Policy` | Con un nonce por petición. | `proxy.ts` |
| `Permissions-Policy` | Todo apagado salvo `clipboard-write` para el propio portal, que usa el botón de copiar. | `next.config.ts` |
| `X-Robots-Tag` | `noindex, nofollow`. Además, `<meta name="robots">` en cada página y `robots.txt` con `Disallow: /`. | `next.config.ts`, `app/layout.tsx`, `app/robots.txt` |
| `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` | Sin cambios. | `next.config.ts` |

**Política de contenido.** Está activa, no en modo informe. Sigue la guía de la versión instalada de Next: `proxy.ts` genera un nonce en cada petición, lo pone en la cabecera de la petición y en la de la respuesta, y Next lo aplica a sus propios scripts. Solo se ejecutan los scripts con ese nonce y los que ellos cargan.

```
default-src 'self'; script-src 'self' 'nonce-…' 'strict-dynamic'; style-src 'self' 'nonce-…';
img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; object-src 'none';
base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

- Funciona porque esas páginas se generan en cada petición y el portal no usa estilos ni scripts en línea, ni recursos de otros orígenes.
- Las cuatro páginas de catálogo servidas desde caché no pueden llevar nonce y usan la variante sin nonce de la guía, descrita en «Rendimiento y caché».
- En desarrollo la política añade `'unsafe-eval'` y estilos en línea, que React necesita para depurar.
- No incluye `upgrade-insecure-requests`: rompería las pruebas locales por `http`, y en producción `Strict-Transport-Security` ya obliga a usar `https`.
- No tiene dirección de informes. Una infracción solo se ve en la consola del navegador.
- Quien añada un script o un estilo en línea, o un recurso de otro origen, debe actualizar la política en `proxy.ts`.

**Páginas de error.** `app/error.tsx` muestra «Algo salió mal» con «Reintentar» y «Volver al inicio», dentro del diseño del portal. `app/global-error.tsx` cubre un fallo del diseño raíz y trae su propio documento, sin estilos. Ninguna muestra ni registra detalles técnicos. La respuesta es `500` y no contiene el mensaje del error, trazas ni rutas de archivos. Como el `404` de una página dinámica, Next entrega un documento mínimo que se completa con JavaScript: sin JavaScript, la página de error queda en blanco.

**Sesión vencida.** `GET /api/session/expired` vuelve a pedir el perfil a la API general. Con la sesión vigente redirige al destino y no toca la cookie. Solo la borra si la API da la sesión por inválida. Un enlace o una petición desde otro sitio no puede cerrar una sesión vigente, y el destino se sanea igual que en el acceso. La revisión del 2026-11-24 lo anotó por error como hallazgo.

**Estado de los hallazgos de seguridad.**

| Hallazgo | Estado |
| --- | --- |
| El límite de acceso de la API general es por IP, diez intentos cada quince minutos, y todas las peticiones salen del servidor del portal. | Abierto, mitigado. El portal limita por correo y por IP del cliente, pero el cupo de la API sigue siendo uno solo para todos los pacientes: diez accesos legítimos en quince minutos lo agotan. Se resuelve cuando la API limite por la IP real del cliente; `FORWARD_CLIENT_IP` está preparada para eso. |
| Registro abierto y trámites sin tope. | Cerrado. Registro apagado por defecto en producción y topes por paciente y por hora. |
| Sin `Strict-Transport-Security`. | Cerrado. |
| Sin `Content-Security-Policy` ni `Permissions-Policy`. | Cerrado. |
| Sin `noindex` ni `robots.txt`. | Cerrado. |
| `GET /api/session/expired` cierra la sesión sin comprobar el origen. | Retirado: era incorrecto. Ver «Sesión vencida». |
| Sin tope de códigos de continuidad ni de trámites por paciente. | Cerrado. |
| Los diez canjes por minuto del orquestador son de todo el canal Web. | Abierto. Depende del orquestador. El límite por paciente del portal lo mitiga. |
| Cerrar sesión no revoca el token en la API general. | Abierto. La API no ofrece revocarlo. |
| Sin página de error propia. | Cerrado. Sin JavaScript queda en blanco. |
| El registro, cuando se enciende, no tiene límite propio por IP. | Abierto. Solo lo limita la API general. |
| Los límites viven en memoria. | Abierto por diseño: se vacían al reiniciar y exigen una sola instancia. |

Lo comprobado y correcto: cookie `__Host-` con `Secure`, `HttpOnly` y `SameSite=Lax`; `403` ante un origen ajeno o nulo; todas las rutas protegidas redirigen a `/acceso` sin sesión y una cookie inventada se borra; las acciones comprueban la sesión; el trámite ajeno responde igual que el inexistente; los mensajes de los servicios nunca llegan a la interfaz; las páginas no se almacenan en caché. `pnpm audit` no encontró avisos en las dependencias del portal.

### Rendimiento y caché

**Catálogo por petición, medido el 2026-11-24.** Contra los simuladores, con el proceso recién arrancado, cada petición pide el catálogo una vez como mucho:

| Petición | Lecturas del catálogo |
| --- | --- |
| `/tramite/nuevo?estudio` | 1, el índice de estudios |
| Paso de clínica | 1, la página de clínicas |
| Elegir clínica | 1, el índice de clínicas para validar |
| La segunda vuelta completa | Ninguna |

Las dos lecturas que se vieron en un paso de la prueba real eran revalidaciones en segundo plano de la caché de datos de Next, vencida desde la compilación: la de la página anterior terminó durante la siguiente. No hubo nada que cambiar.

**Fecha.** 2026-11-24. Objetivo de referencia: 5 millones de consultas diarias en el portal.

**Catálogo servido desde caché.** `/`, `/estudios`, `/clinicas` y `/estudios/[id]` no leen cookies ni la URL. Next las genera una vez y las regenera cada `CATALOG_CACHE_SECONDS` segundos. Nginx o una CDN pueden servirlas sin llegar a Next.

- `/estudios` y `/clinicas` son solo la primera página sin filtros. La búsqueda, el filtro por ciudad y las páginas siguientes están en `/estudios/buscar` y `/clinicas/buscar`, que leen la URL y se generan en cada petición.
- `proxy.ts` redirige con `308` los enlaces antiguos con filtros, como `/estudios?q=…`, a la ruta de búsqueda. Es una redirección y no una reescritura: la documentación de Next avisa que reescribir una página estática rompe la hidratación de `usePathname`.
- `/estudios/[id]` no se genera al compilar. Cada estudio se genera en su primera visita y se guarda, como indica la documentación de `generateStaticParams`.
- `CATALOG_CACHE_SECONDS` se lee al compilar: `next.config.ts` la valida y Next escribe el valor en el código. Fija la regeneración de esas páginas, la caché de datos del catálogo y su cabecera. Sin valor, 300.
- `proxy.ts` envía en esas páginas `Cache-Control: public, max-age=N, s-maxage=N`, con N = `CATALOG_CACHE_SECONDS`. Sustituye a la cabecera de Next, que no lleva `public` y permite servir una copia vieja durante un año: tras un despliegue, esa copia apuntaría a archivos de la compilación anterior.
- `next build` genera el listado de estudios y el de clínicas, así que llama a la API general. Si no la alcanza, `features/catalog/unavailable.tsx` hace que esas páginas pasen a generarse en cada petición, en lugar de guardarse con «Servicio no disponible». Si una regeneración falla, Next sigue sirviendo la copia anterior.

**Política de contenido en el catálogo.** La guía de Next exige generar en cada petición las páginas con nonce. Las cuatro páginas de catálogo usan la variante sin nonce de la misma guía, con `script-src 'self' 'unsafe-inline'` y `style-src 'self' 'unsafe-inline'`, y conservan el resto de directivas: solo recursos del propio origen, sin `object`, sin marcos y con `form-action 'self'`. Esas páginas no muestran datos del paciente ni texto que él escriba. El resto del portal, incluidas las búsquedas, conserva el nonce. Decisión del propietario del portal del 2026-11-24.

**Encabezado.** El diseño raíz ya no lee cookies. Cada grupo de rutas pone su marco, `components/page-frame.tsx`:

- En las páginas públicas el encabezado lo decide el navegador con la cookie indicadora, `lib/session/indicator.ts`. Su valor es `1`: no contiene el token ni ningún identificador. No es `HttpOnly`, porque la lee el navegador. Se escribe y se borra junto con la cookie de sesión, con el mismo vencimiento, al iniciar sesión, al cerrarla y cuando la sesión vence.
- La cookie indicadora no autoriza nada. Las rutas protegidas siguen validando la cookie de sesión en el servidor.
- En `(account)` y `(booking)` lo decide el servidor, como antes.
- Sin JavaScript, las páginas públicas muestran «Acceso» aunque haya sesión. Para no dejar al paciente atascado, `/acceso` con sesión abierta lleva al destino o a `/mi-espacio`.

**Sesión.** `lib/adapters/general-api/session.ts` guarda el perfil validado por `GET /auth/me` durante el mínimo entre 60 segundos y el vencimiento del token. La clave es el SHA-256 del token: el token nunca se guarda.

- Se invalida al cerrar sesión y ante cualquier `401` de la API general.
- El vencimiento se conoce al iniciar sesión en este proceso. El portal no decodifica el token, así que tras un reinicio las sesiones abiertas vuelven a validarse en cada página hasta que el paciente inicia sesión otra vez.
- **Contrapartida.** Durante esos 60 segundos, una sesión que la API invalide por su cuenta sigue abriendo las páginas del portal. Cualquier operación que llegue a la API con ese token recibe `401` y cierra la sesión. En modo orquestador, la única llamada a la API general con token es el perfil, así que el retraso puede llegar a los 60 segundos completos.

**Catálogo por identificador.** `lib/adapters/general-api/catalog.ts` mantiene un índice de estudios y clínicas, hasta 1000 estudios y 500 clínicas, que se carga entero en páginas de 100 y se renueva cada `CATALOG_CACHE_SECONDS`. Lo comparten el detalle de un estudio, el resumen del trámite, las listas de «Continuar», el historial y el filtro por ciudad sin nombre. Buscar un elemento no hace ninguna llamada. La API solo devuelve registros activos, también por identificador: un identificador que no está en el índice completo no existe, y solo si el índice llegó al tope se pide por separado.

**Trámite.** La sesión, el trámite, la lista de pendientes, el historial y la cita se leen en paralelo. El perfil se pide una sola vez por petición, compartido entre la sesión y el adaptador del trámite.

**Estado detrás de interfaces.** `lib/state/ports.ts` define los almacenes: registro del canal Web, permisos de trámite, claves de creación pendientes, contadores de intentos y caché de sesión. Todos son asíncronos. La única implementación vive en el proceso, en `lib/state/memory.ts` y `lib/state/file-registry.ts`, y `lib/composition.ts` la elige.

**Qué haría falta para varias instancias.**

| Pieza | Hoy | Con varias instancias |
| --- | --- | --- |
| Registro del canal Web | Archivo JSON en `PORTAL_DATA_DIR` | Almacén compartido con escrituras atómicas, como una base de datos o un servicio clave-valor. |
| Permisos de trámite | Memoria del proceso | Almacén compartido con vencimiento por entrada igual al del permiso. El permiso es un secreto: se guarda cifrado, por ejemplo con AES-GCM y una clave de `PORTAL_GRANT_KEY` fuera del almacén, y nunca en texto plano. |
| Claves de creación pendientes | Memoria del proceso | El mismo almacén compartido, con cinco minutos de vencimiento. |
| Límites de intentos | Memoria del proceso | Nginx con `limit_req` sobre `POST /acceso` por IP, y el contador por correo y por paciente en el almacén compartido con incremento atómico. |
| Caché de sesión | Memoria del proceso | Puede seguir en cada instancia: solo cuesta una validación más por instancia. |
| Páginas de catálogo | Caché de Next en el disco de la instancia | Nginx o una CDN delante, o un `cacheHandler` compartido de Next. |

Cada almacén se cambia en `lib/composition.ts` sin tocar a quien lo usa.

**Nginx o una CDN delante.** Pueden cachear las cuatro páginas de catálogo respetando su `Cache-Control`. Según la guía de Next sobre CDN:

- la clave de caché debe incluir la consulta, porque `_rsc` distingue el HTML de la navegación del cliente;
- la cabecera `rsc` debe llegar a Next;
- ninguna otra ruta debe cachearse, porque las demás responden `private, no-store`;
- tras cada despliegue hay que vaciar la caché de esas páginas, porque apuntan a los archivos de la compilación anterior.

**Medición.** Con servicios simulados de 100 ms de latencia y un único proceso del portal, en un equipo de desarrollo con 16 núcleos lógicos:

- **Catálogo:** de unas 440–480 a unas 1200–1700 peticiones por segundo, con p95 de unos 15–30 ms.
- **`/mi-espacio`:** de 176 a unas 540–570 peticiones por segundo, sin llamadas a la API mientras dura la caché de sesión.
- **Página del trámite:** de 83–90 a 153–172 peticiones por segundo, y de unos 220–240 ms a unos 115–130 ms de p50.

Son cifras de referencia, no de producción.

**Lo que no se pudo optimizar.**

- La página del trámite lee siempre el estado vigente: una llamada en modo heredado y dos en modo orquestador, estado y contexto.
- «Continuar» en modo orquestador cuesta dos llamadas por trámite abierto, porque el orquestador no ofrece leer varios trámites a la vez.
- Las búsquedas con texto se generan en cada petición; cada consulta distinta cuesta una llamada cada `CATALOG_CACHE_SECONDS`.
- El filtro por ciudad con nombre sigue recorriendo el listado filtrado por nombre, porque la API no filtra por ciudad.

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

El portal tiene una sola navegación, en el encabezado. Sin sesión ofrece Estudios, Clínicas y Acceso. Con sesión ofrece todas las secciones: Estudios, Clínicas, Mi espacio, Continuar, Citas, Ayuda y Perfil. Cerrar sesión está en `/perfil`.

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
2. Cada página protegida llama a `requireAccount()`, de `lib/session/session.ts`, que valida la sesión en el servidor pidiendo el perfil del paciente, hoy con `GET /api/v1/auth/me`. El perfil validado se reutiliza hasta 60 segundos, como explica «Rendimiento y caché». El portal nunca decodifica el token.

Cuando la API responde `401`, la página redirige a `/api/session/expired`. Ese manejador vuelve a preguntar a la API, borra la cookie solo si la sesión ya es inválida y lleva a `/acceso` con el destino original. Hace falta porque un Server Component no puede borrar cookies. Si la API no responde, la página muestra «Servicio no disponible» y conserva la cookie.

El destino solo puede ser una ruta interna. `safeDestination()` rechaza lo que no empiece por `/`, lo que empiece por `//`, las barras invertidas y las rutas de acceso, y usa `/mi-espacio` en su lugar.

Al añadir una ruta a `(account)` o `(booking)` hay que registrar su prefijo en `lib/session/routes.ts` y llamar a `requireAccount()` en la página. Los grupos de rutas no aparecen en la URL, así que el proxy no puede deducirlos.

**Mutaciones.** Registro, acceso y cierre de sesión son Server Actions. Next solo las acepta por `POST` y compara la cabecera `Origin` con `Host`: una petición de otro origen se rechaza antes de ejecutar la acción. Next responde `500` en ese caso. `proxy.ts` repite antes la misma comparación y responde `403`, sin sustituir la comprobación de Next, que sigue activa. Si algún día se configura `serverActions.allowedOrigins`, el proxy debe aceptar los mismos orígenes.

**Encabezado.** Los enlaces cambian de «Acceso» a las secciones del área personal sin llamar a la API. En las páginas protegidas lo decide el servidor con la cookie de sesión; en las públicas, el navegador con la cookie indicadora, para que el catálogo pueda servirse desde caché. Los enlaces a rutas protegidas no se precargan, para no validar la sesión en cada precarga. Las páginas que se generan en cada petición se sirven con `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`.

### Cliente de API y configuración

`API_BASE_URL` es obligatoria. `REQUESTS_BACKEND`, `ORCHESTRATOR_BASE_URL`, `ORCHESTRATOR_API_KEY` y `PORTAL_DATA_DIR` solo importan en modo orquestador y se describen en «Adaptador del orquestador». `REGISTRATION_ENABLED` y `FORWARD_CLIENT_IP` se describen en «Publicación del portal». Todas las lee solo el servidor, sin prefijo `NEXT_PUBLIC_`. `.env.example` documenta los nombres y los valores reales van en `.env.local`, que Git ignora. Sobre `API_BASE_URL`: `instrumentation.ts` la valida al arrancar con `checkConfiguration()`, de `lib/composition.ts`: debe usar `https`, salvo en `localhost` y `127.0.0.1`. Con un valor inválido, el servidor registra el error al arrancar y responde `500` a todas las peticiones. `next build` funciona sin la variable, porque ninguna página llama a la API durante la compilación.

`lib/adapters/general-api/client.ts` es el único punto de salida hacia la API y lleva `server-only`, así que un componente de cliente no puede importarlo. Cada llamada:

- construye sus propias cabeceras y envía solo `Accept`, `Content-Type` y `Authorization`, sin reenviar nada del navegador. Con `FORWARD_CLIENT_IP` encendida añade `X-Portal-Client-IP`, con la IP que escribió el proxy;
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

`/estudios` y `/clinicas` listan `GET /api/v1/studies` y `GET /api/v1/clinics`; su primera página sin filtros se sirve desde caché y la búsqueda está en `/estudios/buscar` y `/clinicas/buscar`. El portal envía solo los parámetros del contrato: `page`, `limit` y `q`. Muestra 12 tarjetas por página y pagina con `hasMore`. `/estudios/[id]` muestra `GET /api/v1/studies/{id}` y enlaza a `/tramite/nuevo?estudio=<id>` para agendar.

**Validación.** El servidor recorta `q` y `ciudad` a 100 caracteres, que es el máximo del contrato, y acepta `pagina` entre 1 y 10 000. Cualquier otro valor vuelve a la primera página. El identificador del detalle debe ser un UUID: si no lo es, el portal responde «no encontrado» sin llamar a la API. Un `400` o un `404` de la API también se muestran como «no encontrado».

**Textos y precio.** Los textos de la API se muestran siempre como texto, escapados por React. El precio llega como cadena decimal y solo se le da formato de pesos mexicanos al mostrarlo.

**Filtro por ciudad.** El contrato no filtra por ciudad. Sin nombre, el portal filtra el índice de clínicas, que ya está en caché, sin ninguna llamada nueva. Con nombre, recorre el listado de la API filtrado por nombre en páginas de 100, compara la ciudad sin distinguir mayúsculas ni acentos y pagina sobre las coincidencias. Se detiene en cuanto tiene las necesarias para la página pedida. El enfoque tiene límites:

- revisa como máximo 500 clínicas, y avisa en pantalla cuando llega a ese tope porque puede faltar alguna;
- una búsqueda puede costar hasta cinco llamadas a la API, y más cuanto más avanzada sea la página;
- compara el texto libre de `city`, así que «CDMX» no encuentra «Ciudad de México».

La solución de fondo es un parámetro de ciudad en la API.

**Caché.** Las respuestas públicas del catálogo se reutilizan durante `CATALOG_CACHE_SECONDS`, 300 segundos por defecto, con la opción `next.revalidate` de `fetch`. Next solo guarda respuestas `200`, así que un fallo de la API no queda en caché. Las peticiones con token usan siempre `cache: "no-store"`.

**Carga, vacío y error.** Los botones de búsqueda y los enlaces muestran «Buscando…» o «Cargando…» mientras dura la navegación, con `useFormStatus` y `useLinkStatus`. El portal prescinde de `loading.tsx` a propósito: con ese archivo la respuesta empieza con `200` antes de consultar la API, y el detalle de un estudio inexistente dejaría de responder `404`. Además, los listados seguirían cargando para siempre en un navegador sin JavaScript. Una lista vacía ofrece quitar los filtros. Si la API no responde, la página muestra «Servicio no disponible» con un enlace para reintentar la misma URL.

### Confirmación de la cita y ayuda del asesor

El paciente confirma su cita en el portal con `POST /api/v1/requests/{id}/confirm` y la versión vigente de la solicitud. Un reintento compatible recupera la misma cita. Consulta la guía pública, sección «Catálogos, solicitudes y citas».

Si el paciente necesita ayuda, genera un código de asistencia con `POST /api/v1/requests/{id}/assistance-code`, sin cuerpo, y lo entrega al asesor. El código tiene 22 caracteres, vence a los cinco minutos y se consume una vez. Con él, el asesor obtiene un permiso de 30 minutos para consultar la solicitud y confirmarla. Para editar las selecciones, el paciente usa su propia sesión. Consulta la [guía de Call Center](../../../docs/frontend-callcenter.md), sección «Recuperar una atención», y el [contrato de Call Center](../../../docs/api-call-center.md), sección «Emitir y canjear».

### Vinculación de WhatsApp

**Fuera del MVP desde el 2026-11-24.** El portal no ofrece esta vinculación. Ver «Continuidad identificada».

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
| Límite de registro e inicio de sesión por IP | Ambas operaciones comparten 10 intentos por IP cada 15 minutos, según el contrato de autenticación. Todas las llamadas llegan desde el servidor del portal, así que los pacientes comparten ese límite. El portal añade los suyos, descritos en «Publicación del portal», pero no puede ampliar ese cupo. |
| Confiar en `X-Portal-Client-IP` solo cuando la petición viene del servidor del portal | Permitiría a la API limitar por la IP real de cada paciente. Hasta acordarlo, `FORWARD_CLIENT_IP` sigue apagada. |
| Vencimiento de la sesión en `GET /auth/me`, por ejemplo `expiresAt` | El portal guarda el perfil hasta 60 segundos solo si conoce el vencimiento del token, que hoy llega al iniciar sesión. Con este dato, la caché seguiría funcionando tras un reinicio sin decodificar el token. |
| Cerrar sesión en la API, o revocar el token | Cerrar sesión en el portal borra la cookie, pero el token sigue siendo válido hasta que vence. |
| Capacidad de la API general | Con 5 millones de consultas al día, el portal estima del orden de 11 a 26 llamadas por segundo de media y de 110 a 260 en un pico de diez veces, según el modo. Es una estimación, en «Rendimiento y caché». |
| Orquestador: estado y contexto de un trámite en una sola llamada, o de varios a la vez | Hoy cada trámite cuesta dos lecturas, y «Continuar» dos por cada trámite abierto. |
| Orquestador: límite de canje por actor o por IP, no solo por canal | Los diez canjes por minuto se comparten entre todos los pacientes del canal Web. |
| Orquestador: capacidad | El portal estima unas 33 llamadas por segundo de media y unas 330 en un pico de diez veces. Es una estimación. |

Las preguntas para el equipo del orquestador están en «Adaptador del orquestador», y lo pendiente antes de publicar, en «Publicación del portal».

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
