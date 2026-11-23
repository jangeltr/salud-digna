# app

Rutas del portal con el App Router de Next.js. Los grupos entre paréntesis organizan el código y quedan fuera de la URL. Los segmentos de URL van en español y sin acentos.

| Carpeta | Contenido |
| --- | --- |
| `(public)/` | Páginas que se ven sin sesión: `/`, `/estudios`, `/estudios/[id]`, `/clinicas`, `/acceso` y `/registro`. |
| `(booking)/` | Flujo de la solicitud de agendamiento: `/tramite/nuevo` y `/tramite/[id]`. |
| `(account)/` | Área personal del paciente: `/mi-espacio`, `/continuar`, `/citas`, `/citas/[id]`, `/ayuda` y `/perfil`. |
| `api/` | Manejadores de servidor del portal. Reciben las peticiones del navegador y llaman a la API de Salud Digna desde el servidor. Hoy contiene `session/expired`, que borra la cookie de una sesión vencida. |
| `icons/` | Iconos del manifiesto, generados en la compilación. |

`layout.tsx` monta la franja de prototipo y las dos navegaciones. `manifest.ts` genera `/manifest.webmanifest`. `icon.tsx` y `apple-icon.tsx` generan el icono de pestaña y el de iOS.

Las rutas de `api/` se publican en `/api/...` del origen del portal y son distintas de `/api/v1` del backend.
