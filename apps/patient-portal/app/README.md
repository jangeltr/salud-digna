# app

Rutas del portal con el App Router de Next.js. Los grupos entre paréntesis organizan el código y quedan fuera de la URL. Los segmentos de URL van en español y sin acentos.

| Carpeta | Contenido |
| --- | --- |
| `(public)/` | Páginas sin sesión: `/`, `/estudios`, `/estudios/[id]` y `/clinicas`, servidas desde caché; la búsqueda, en `/estudios/buscar` y `/clinicas/buscar`; `/acceso`, y `/registro`, que solo existe con `REGISTRATION_ENABLED` encendida. Su `layout.tsx` usa `PageFrame`, con el encabezado decidido en el navegador. |
| `(booking)/` | Trámite de agendamiento: `/tramite/nuevo`, `/tramite/[id]` y `/tramite/[id]/historial`, que solo existe cuando el servicio activo ofrece historial. Su `layout.tsx` usa `AccountFrame`. |
| `(account)/` | Área del paciente: `/mi-espacio`, `/continuar` y `/perfil`. `/citas`, `/citas/[id]` y `/ayuda` existen, pero muestran un aviso de pantalla sin contenido. Su `layout.tsx` usa `AccountFrame`. |
| `api/` | Manejadores de servidor del portal. Hoy solo `session/expired`, que borra la cookie de una sesión vencida. |
| `icons/` | `mark.tsx`, la figura que comparten el icono de pestaña y el de iOS. No publica rutas. |

`layout.tsx` monta la franja de prototipo y marca todas las páginas como no indexables. El encabezado lo pone el `layout.tsx` de cada grupo. `icon.tsx` y `apple-icon.tsx` generan los iconos, y `robots.txt` excluye todo el sitio. `error.tsx`, `global-error.tsx` y `not-found.tsx` son las páginas de error, sin detalles técnicos. `globals.css` define la paleta.

Las rutas de `api/` se publican en `/api/...` del origen del portal y son distintas de `/api/v1` de los servicios.
