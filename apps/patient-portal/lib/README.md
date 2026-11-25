# lib

Código transversal sin interfaz.

| Ruta | Contenido |
| --- | --- |
| `domain/` | Modelo propio del portal, sus errores y las tres interfaces internas. No depende de ningún servicio. |
| `adapters/` | Implementaciones de las interfaces. Es el único lugar con tipos generados del contrato, códigos HTTP y credenciales de los servicios. |
| `composition.ts` | Decide qué adaptador atiende cada interfaz, según `REQUESTS_BACKEND` y `PATIENT_IDENTITY_MODE`, y comprueba la configuración al arrancar. El resto del portal importa de aquí los servicios y las capacidades del trámite. |
| `identity/` | Modo de identidad del paciente y acreditación institucional: configuración, interfaces y caché por sesión. |
| `report.ts` | Registro mínimo de los errores mostrados al paciente, sin identificadores ni datos. |
| `brand.ts` | Nombre, textos de identidad y colores de tema del portal. |
| `settings.ts` | Ajustes del portal que no son de ningún servicio. Hoy, `REGISTRATION_ENABLED`. |
| `flags.ts` | Lectura de variables de tipo sí o no: solo admite `true` o `false`. |
| `cache-settings.ts` | `CATALOG_CACHE_SECONDS`, fijada al compilar. |
| `secret.ts` | Envoltorio de claves, credenciales, permisos y acreditaciones, que impide que acaben en un log o en una respuesta. |
| `state/` | Interfaces del estado entre peticiones y su implementación en memoria y archivo. |
| `session/` | Sesión del paciente, con el JWT en una cookie `HttpOnly` del origen del portal. |

Páginas, acciones y componentes importan solo `domain/` y `composition.ts`. Nada fuera de `adapters/` importa de `adapters/`, salvo `composition.ts`.

## domain

| Archivo | Contenido |
| --- | --- |
| `model.ts` | Paciente, estudio, clínica, trámite, entrada de historial y cita, con el vocabulario del portal. |
| `errors.ts` | Errores propios y el tipo `Result` que devuelven las interfaces. |
| `ports.ts` | Las tres interfaces: `GeneralData`, `RequestNotifier` y `RequestQuery`, con los eventos de negocio del trámite y las capacidades que declara cada adaptador. |

## adapters

`service-url.ts` valida la URL base de cada servicio: exige `https`, salvo en `localhost` y `127.0.0.1`. Lo usan los dos adaptadores con cliente HTTP.

## adapters/general-api

Adaptador de la API general, que es la API actual. Se ejecuta solo en el servidor de Next y se rige por `docs/openapi.json`, que el portal lee en su ubicación sin copiarlo.

| Archivo | Contenido |
| --- | --- |
| `schema.d.ts` | Tipos generados desde `docs/openapi.json` con el script `api:types`. No se edita a mano. |
| `config.ts` | Lee y valida `API_BASE_URL` y `FORWARD_CLIENT_IP`. |
| `client.ts` | Única salida hacia la API: cabeceras propias, tiempo de espera y registro sin datos sensibles. Con `FORWARD_CLIENT_IP` encendida añade la IP del paciente. |
| `authorized.ts` | Llamada con la sesión del paciente. Toma el token del módulo de sesión. |
| `failures.ts` | Única traducción de códigos HTTP a errores del portal. |
| `general-data.ts` | Implementa `GeneralData`: catálogo, perfil, acceso, registro y cierre de sesión. |
| `catalog.ts` | Índice de estudios y clínicas por identificador, en un solo caché. |
| `session.ts` | Caché del perfil de sesión, por hash del token, hasta 60 segundos. |
| `assertions.ts` | Emisor de acreditaciones de la API central, con `PATIENT_ASSERTION_CHANNEL_KEY`. Lee el vencimiento de cada acreditación. |

## adapters/legacy-requests

Adaptador heredado y modo por defecto. Implementa la notificación y la consulta del trámite sobre las operaciones `/requests` y `/appointments` de la API actual. Sus llamadas llevan token y nunca se guardan en caché.

| Archivo | Contenido |
| --- | --- |
| `mapping.ts` | Traduce el trámite y la cita de la API al modelo del portal. |
| `notifier.ts` | Implementa `RequestNotifier`: convierte cada evento de negocio en la operación que hoy lo registra. |
| `query.ts` | Implementa `RequestQuery`: trámites pendientes, un trámite y su cita. |
| `capabilities.ts` | Lo que soporta: todo menos cancelación, historial y códigos de continuidad. |

## adapters/orchestrator

Adaptador del orquestador, activo con `REQUESTS_BACKEND=orchestrator`. Se rige por `apps/orchestrator/docs/journey-writes.md`, `journey-queries.md` y `continuity-codes.md`. El orquestador no publica un OpenAPI, así que aquí no hay tipos generados.

| Archivo | Contenido |
| --- | --- |
| `config.ts` | Lee y valida `ORCHESTRATOR_BASE_URL`, `ORCHESTRATOR_API_KEY` y `PORTAL_DATA_DIR`. |
| `client.ts` | Única salida hacia el orquestador. Escribe `Authorization`, `X-Journey-Grant`, `Idempotency-Key` y `X-Patient-Assertion`, que no salen de ahí. |
| `failures.ts` | Única traducción de los códigos HTTP del orquestador a errores del portal. |
| `mapping.ts` | Comprueba la forma de cada respuesta y la traduce al modelo del portal. |
| `access.ts` | Comprobación previa a toda lectura o escritura: sesión, pertenencia y permiso vigente. Con `none`, la pertenencia sale del registro; con `assertion`, el permiso se pide con la acreditación. |
| `notifier.ts` | Implementa `RequestNotifier`: crear el trámite con reenvío idempotente, estudio, clínica, envío a confirmación, cancelación, y emitir y canjear códigos de continuidad. |
| `query.ts` | Implementa `RequestQuery`: la lista, del registro con `none` o de `GET /journeys?active=true` con `assertion`, un trámite y su historial. |
| `capabilities.ts` | Lo que soporta: cancelación, historial y códigos de continuidad, sin horario, nota, pausa, ayuda de asesor ni confirmación directa. |

## state

| Archivo | Contenido |
| --- | --- |
| `ports.ts` | Interfaces asíncronas: registro del canal Web, permisos, claves de creación pendientes, intentos, acreditaciones y caché de sesión. |
| `memory.ts` | Implementación en la memoria del proceso. |
| `file-registry.ts` | Registro del canal Web en un archivo JSON, con escritura atómica. |

## identity

| Archivo | Contenido |
| --- | --- |
| `config.ts` | Lee y valida `PATIENT_IDENTITY_MODE` y `PATIENT_ASSERTION_CHANNEL_KEY`. |
| `ports.ts` | Interfaces del emisor y de la fuente de acreditaciones. |
| `cache.ts` | Acreditación por sesión, renovada antes de vencer y nunca más de cinco minutos. |

## session

| Archivo | Contenido |
| --- | --- |
| `cookie.ts` | Nombre y atributos de la cookie de sesión y de la indicadora, y su lectura, escritura y borrado. |
| `indicator.ts` | Cookie indicadora de sesión, sin datos, que lee el encabezado en el navegador. |
| `routes.ts` | Prefijos de las rutas protegidas y validación del destino tras el acceso. |
| `session.ts` | Comprueba la sesión pidiendo el perfil del paciente y exige cuenta en las páginas protegidas. |
| `limits.ts` | Valores de los límites propios del portal: acceso, trámites, códigos y canjes. |
| `client-ip.ts` | IP del cliente, tomada solo de la cabecera `X-Real-IP` que escribe el proxy. |

Los motivos de cada decisión están en [docs/decisions.md](../docs/decisions.md).
