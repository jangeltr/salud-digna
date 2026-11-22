# lib

Código transversal sin interfaz.

| Carpeta | Contenido |
| --- | --- |
| `api/` | Cliente tipado de la API. Se ejecuta solo en el servidor de Next. Sus tipos son temporales, transcritos de `docs/api-*.md`, hasta que exista `packages/contracts/openapi.json`. |
| `channel/` | Canal de origen: `WEB` en el navegador y `MOBILE` cuando el portal corre instalado. |
| `session/` | Sesión del paciente, con el JWT en una cookie `HttpOnly` del origen del portal. |

Los motivos de cada decisión están en [docs/patient-portal.md](../../../docs/patient-portal.md).
