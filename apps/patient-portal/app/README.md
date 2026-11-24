# app

Rutas del portal con el App Router de Next.js. Los grupos entre paréntesis organizan el código y quedan fuera de la URL. Los segmentos de URL van en español y sin acentos.

| Carpeta | Contenido |
| --- | --- |
| `(public)/` | Páginas que se ven sin sesión: `/`, `/estudios`, `/estudios/[id]`, `/clinicas`, `/acceso` y `/registro`. La última solo existe con `REGISTRATION_ENABLED` encendida. |
| `(booking)/` | Flujo de la solicitud de agendamiento: `/tramite/nuevo`, `/tramite/[id]` y `/tramite/[id]/historial`, que solo existe cuando el servicio activo ofrece historial. |
| `(account)/` | Área personal del paciente: `/mi-espacio`, `/continuar`, `/citas`, `/citas/[id]`, `/ayuda` y `/perfil`. |
| `api/` | Manejadores de servidor del portal. Reciben las peticiones del navegador y llaman a la API de Salud Digna desde el servidor. Hoy contiene `session/expired`, que borra la cookie de una sesión vencida. |
| `icons/` | Figura de la marca que comparten el icono de pestaña y el de iOS. No publica rutas. |

`layout.tsx` monta la franja de prototipo y el encabezado con la navegación, y marca todas las páginas como no indexables. `icon.tsx` y `apple-icon.tsx` generan el icono de pestaña y el de iOS. `robots.txt` excluye todo el sitio. `error.tsx` y `global-error.tsx` son las páginas de error, sin detalles técnicos.

El portal es solo un sitio web desde el 2026-11-24, cuando el proyecto cambió de arquitectura y dejó de cubrir el canal móvil. Hasta esa fecha, esta carpeta tenía también `manifest.ts` y la ruta `icons/[file]`, con el manifiesto y los iconos de instalación de la PWA. El motivo y el detalle están en [docs/decisions.md](../docs/decisions.md).

Las rutas de `api/` se publican en `/api/...` del origen del portal y son distintas de `/api/v1` del backend.
