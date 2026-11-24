# lib

Código transversal sin interfaz.

| Ruta | Contenido |
| --- | --- |
| `domain/` | Modelo propio del portal, sus errores y las tres interfaces internas. No depende de ningún servicio. |
| `adapters/` | Implementaciones de las interfaces. Es el único lugar con tipos generados del contrato y códigos HTTP. |
| `composition.ts` | Decide qué adaptador atiende cada interfaz. El resto del portal importa los servicios de aquí. |
| `brand.ts` | Nombre, textos de identidad y colores de tema del portal. |
| `session/` | Sesión del paciente, con el JWT en una cookie `HttpOnly` del origen del portal. |

Páginas, acciones y componentes importan solo `domain/` y `composition.ts`. Nada fuera de `adapters/` importa de `adapters/`, salvo `composition.ts`.

## domain

| Archivo | Contenido |
| --- | --- |
| `model.ts` | Paciente, estudio, clínica, trámite, entrada de historial y cita, con el vocabulario del portal. |
| `errors.ts` | Errores propios y el tipo `Result` que devuelven las interfaces. |
| `ports.ts` | Las tres interfaces: `GeneralData`, `RequestNotifier` y `RequestQuery`, con los eventos de negocio del trámite. |

## adapters/general-api

Adaptador de la API general, que es la API actual. Se ejecuta solo en el servidor de Next y se rige por `docs/openapi.json`, que el portal lee en su ubicación sin copiarlo.

| Archivo | Contenido |
| --- | --- |
| `schema.d.ts` | Tipos generados desde `docs/openapi.json` con el script `api:types`. No se edita a mano. |
| `config.ts` | Lee y valida `API_BASE_URL`. |
| `client.ts` | Única salida hacia la API: cabeceras propias, tiempo de espera y registro sin datos sensibles. |
| `authorized.ts` | Llamada con la sesión del paciente. Toma el token del módulo de sesión. |
| `failures.ts` | Única traducción de códigos HTTP a errores del portal. |
| `general-data.ts` | Implementa `GeneralData`: catálogo con caché de 30 segundos, perfil, acceso y registro. |

## adapters/legacy-requests

Adaptador heredado. Implementa la notificación y la consulta del trámite sobre las operaciones `/requests` y `/appointments` de la API actual, hasta que exista el orquestador. Sus llamadas llevan token y nunca se guardan en caché.

| Archivo | Contenido |
| --- | --- |
| `mapping.ts` | Traduce el trámite y la cita de la API al modelo del portal. |
| `notifier.ts` | Implementa `RequestNotifier`: convierte cada evento de negocio en la operación que hoy lo registra. |
| `query.ts` | Implementa `RequestQuery`: trámites pendientes, un trámite y su cita. |

## session

| Archivo | Contenido |
| --- | --- |
| `cookie.ts` | Nombre y atributos de la cookie de sesión, y su lectura, escritura y borrado. |
| `routes.ts` | Prefijos de las rutas protegidas y validación del destino tras el acceso. |
| `session.ts` | Comprueba la sesión pidiendo el perfil del paciente y exige cuenta en las páginas protegidas. |

El portal es solo un sitio web desde el 2026-11-24, cuando el proyecto cambió de arquitectura y dejó de cubrir el canal móvil. Hasta esa fecha existía también `channel/`, una carpeta reservada para detectar el modo instalado.

Los motivos de cada decisión están en [docs/decisions.md](../docs/decisions.md).
