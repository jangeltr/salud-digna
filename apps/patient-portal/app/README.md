# app

Rutas del portal con el App Router de Next.js. Los grupos entre paréntesis organizan el código y quedan fuera de la URL.

| Carpeta | Contenido |
| --- | --- |
| `(public)/` | Páginas que se ven sin sesión. |
| `(booking)/` | Flujo de la solicitud de agendamiento. |
| `(account)/` | Área personal del paciente. |
| `api/` | Manejadores de servidor del portal. Reciben las peticiones del navegador y llaman a la API de Salud Digna desde el servidor. |

Las rutas de `api/` se publican en `/api/...` del origen del portal y son distintas de `/api/v1` del backend.
