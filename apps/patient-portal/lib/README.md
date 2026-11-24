# lib

Código transversal sin interfaz.

| Carpeta | Contenido |
| --- | --- |
| `api/` | Cliente de la API. Se ejecuta solo en el servidor de Next y se rige por `docs/openapi.json`, que el portal lee en su ubicación sin copiarlo. |
| `brand.ts` | Nombre, textos de identidad y colores de tema del portal. |
| `session/` | Sesión del paciente, con el JWT en una cookie `HttpOnly` del origen del portal. |

El portal es solo un sitio web desde el 2026-11-24, cuando el proyecto cambió de arquitectura y dejó de cubrir el canal móvil. Hasta esa fecha existía también `channel/`, una carpeta reservada para detectar el modo instalado. El motivo y el detalle están en [docs/decisions.md](../docs/decisions.md).

## api

| Archivo | Contenido |
| --- | --- |
| `schema.d.ts` | Tipos generados desde `docs/openapi.json` con el script `api:types`. No se edita a mano. |
| `config.ts` | Lee y valida `API_BASE_URL`. |
| `client.ts` | Única salida hacia la API: cabeceras propias, tiempo de espera y registro sin datos sensibles. |
| `auth.ts` | Operaciones de registro, acceso y consulta de la cuenta. |
| `catalog.ts` | Lectura pública de estudios y clínicas, con caché de 30 segundos. |
| `requests.ts` | Trámites y citas del paciente. Todas las llamadas llevan token y nunca se guardan en caché. |

## session

| Archivo | Contenido |
| --- | --- |
| `cookie.ts` | Nombre y atributos de la cookie de sesión, y su lectura, escritura y borrado. |
| `routes.ts` | Prefijos de las rutas protegidas y validación del destino tras el acceso. |
| `session.ts` | Comprueba la sesión con `GET /auth/me` y exige cuenta en las páginas protegidas. |

Los motivos de cada decisión están en [docs/decisions.md](../docs/decisions.md).
