# lib

Código transversal sin interfaz.

| Carpeta | Contenido |
| --- | --- |
| `api/` | Cliente de la API. Se ejecuta solo en el servidor de Next y se rige por `docs/openapi.json`, que el portal lee en su ubicación sin copiarlo. |
| `channel/` | Detecta si el portal corre en el navegador o instalado. La API registra `WEB` en ambos casos. |
| `session/` | Sesión del paciente, con el JWT en una cookie `HttpOnly` del origen del portal. |

Los motivos de cada decisión están en [docs/decisions.md](../docs/decisions.md).
