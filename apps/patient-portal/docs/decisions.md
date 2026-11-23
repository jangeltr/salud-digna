# Decisiones del portal del paciente

`apps/patient-portal/` es la web pública del paciente y también su aplicación móvil. Usa Next.js, TypeScript y Tailwind CSS. Funcionará como sitio web y como PWA instalable.

Este documento registra las decisiones del portal y el estado de la API del que dependen. El estado corresponde al contrato y a las guías publicados en `main` el 2026-11-22. El documento vive junto a la aplicación porque cada equipo mantiene la documentación de la suya, según la [guía de revisión de pull requests](../../../docs/revision-pull-requests.md).

La base instalada contiene la configuración y una página inicial. La navegación, los componentes, las llamadas a la API y la PWA llegarán en cambios posteriores.

## Contrato

El contrato oficial es [`docs/openapi.json`](../../../docs/openapi.json). El portal lo lee en esa ubicación y evita copiarlo. `lib/api` y `mocks/` se rigen por ese archivo.

**Regla.** El portal usa únicamente operaciones y propiedades que figuran en `docs/openapi.json`. Lo que falte se reporta al equipo de API con método, ruta, rol y código HTTP, y queda pendiente en el portal hasta que exista un contrato acordado. Así lo piden [AGENTS.md](../../../AGENTS.md) y la [guía de integración](../../../docs/INTEGRACION-FRONTENDS.md), sección «Inconsistencias y trabajo con agentes».

La URL base de integración es `https://api.salud-digna.app/api/v1` y las rutas del contrato ya incluyen el prefijo `/api/v1`. El contrato documenta también operaciones de simulación y webhooks que dependen de la configuración de cada entorno. Su inclusión no implica que estén habilitadas en el despliegue, según la sección «Flujos y disponibilidad» de la misma guía.

## Estructura

| Ruta | Propósito |
| --- | --- |
| `app/` | Rutas del App Router. Los grupos `(public)`, `(booking)` y `(account)` separan las páginas sin sesión, el flujo de agendamiento y el área personal. `api/` contiene los manejadores de servidor del portal. |
| `features/` | Un módulo por dominio: `catalog`, `requests`, `appointments`, `auth`, `identity` y `help`. |
| `lib/` | Código transversal: `api` para el cliente de la API, `channel` para detectar el modo instalado y `session` para la sesión del paciente. |
| `components/` | Interfaz compartida y las dos navegaciones, la del sitio web y la de la app instalada. |
| `mocks/` | Respuestas simuladas de operaciones del contrato. |
| `public/` | Manifiesto de la PWA e iconos. |
| `docs/` | Este documento. |

Las carpetas y el código usan nombres en inglés alineados con los módulos de la API. La documentación y los textos para el paciente se escriben en español.

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

Los scripts siguen el patrón de las otras aplicaciones. Se ejecutan desde la raíz con `pnpm --filter @salud-digna/patient-portal <script>`.

| Script | Comando | Uso |
| --- | --- | --- |
| `dev` | `next dev --hostname 127.0.0.1 --port 5173` | Servidor de desarrollo. |
| `build` | `next build` | Compilación de producción. La ejecuta también la revisión de integración. |
| `start` | `next start --hostname 127.0.0.1 --port 5173` | Sirve la compilación. |
| `check` | `next typegen && tsc --noEmit` | Genera los tipos de rutas y comprueba TypeScript en modo estricto. |

Configuración de `next.config.ts`:

- `agentRules: false` evita que `next dev` escriba un bloque administrado en un `AGENTS.md` del portal.
- `poweredByHeader: false` retira la cabecera `X-Powered-By`.
- Todas las rutas responden con `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` y `X-Frame-Options: DENY`.

Tailwind CSS 4 se carga con `@tailwindcss/postcss` y `@import "tailwindcss"` en `app/globals.css`. El `.gitignore` local excluye `.next/` y `next-env.d.ts`.

## Decisiones

### La app móvil es la PWA del portal

El canal móvil se cubre instalando este mismo portal como PWA. El repositorio no tendrá un proyecto móvil aparte. Esto resuelve la ubicación de la aplicación móvil que el README dejaba por definir.

### Canal de origen

La API determina el canal en el servidor y registra como `WEB` toda petición autenticada con JWT, incluidas las de una app. El cliente carece de un campo o una cabecera para declararlo. Consulta el [contrato de solicitudes](../../../docs/api-requests.md), secciones «Actualización parcial» y «Canales, acceso y trazabilidad».

El portal detecta con `display-mode: standalone` si corre instalado y usa esa señal solo para su propia interfaz, en `lib/channel`. Sus acciones quedan registradas como `WEB` en ambos modos. Que la API distinga `MOBILE` queda como sugerencia pendiente del equipo de backend.

### Sesión

`POST /api/v1/auth/register` crea la cuenta y devuelve la cuenta y el perfil, sin token. Después del registro el portal llama a `POST /api/v1/auth/login` para obtener el JWT. Consulta la [guía pública](../../../docs/frontend-publico.md), sección «Cuenta e identidad».

El token dura `expiresIn` segundos. La API carece de renovación y de una operación de cierre de sesión. Al vencer, el paciente vuelve a iniciar sesión. Cerrar sesión en el portal elimina su cookie, y el token conserva su validez en la API hasta que vence. Consulta la misma sección de la guía pública y el [contrato de autenticación](../../../docs/api-auth.md), sección «Límites del MVP y comprobación local».

Las guías piden enviar `Authorization: Bearer <accessToken>` y omiten dónde guardar el token. El portal lo guarda en una cookie `HttpOnly` de su propio origen. El código del navegador no puede leer el token y nunca llama a la API. El navegador habla con el portal, y el servidor de Next llama a la API con el token de la cookie. Los manejadores de `app/api/` y el cliente de `lib/api` se ejecutan solo en el servidor.

### Confirmación de la cita y ayuda del asesor

El paciente confirma su cita en el portal con `POST /api/v1/requests/{id}/confirm` y la versión vigente de la solicitud. Un reintento compatible recupera la misma cita. Consulta la guía pública, sección «Catálogos, solicitudes y citas».

Si el paciente necesita ayuda, genera un código de asistencia con `POST /api/v1/requests/{id}/assistance-code`, sin cuerpo, y lo entrega al asesor. El código tiene 22 caracteres, vence a los cinco minutos y se consume una vez. Con él, el asesor obtiene un permiso de 30 minutos para consultar la solicitud y confirmarla. Para editar las selecciones, el paciente usa su propia sesión. Consulta la [guía de Call Center](../../../docs/frontend-callcenter.md), sección «Recuperar una atención», y el [contrato de Call Center](../../../docs/api-call-center.md), sección «Emitir y canjear».

### Vinculación de WhatsApp

El paciente inicia la vinculación en el portal. `features/identity` llama a `POST /api/v1/identity/links` con `{"provider":"WHATSAPP"}` y muestra el `linkId` y el `code` de la respuesta. El paciente envía `vincular <linkId> <code>` desde su teléfono al remitente configurado. El desafío vence a los cinco minutos. `GET /api/v1/identity` lista las identidades de la cuenta. El campo `phone` del registro carece de efecto sobre la vinculación.

El recorrido requiere un proveedor de WhatsApp configurado en el entorno y un número de prueba habilitado. Consulta la guía pública, secciones «Cuenta e identidad» y «Demostración Web → WhatsApp → Call Center», y el [contrato de identidad](../../../docs/api-identity.md).

### Historial de la solicitud

La línea de tiempo de `GET /api/v1/requests/{id}/journey` se muestra dentro de `features/requests`, junto a la solicitud a la que pertenece. Consulta el [contrato de Journey](../../../docs/api-journey.md).

### Actualización sin tiempo real

La API carece de tiempo real. El portal consulta el estado por REST a intervalos y compara `version` para detectar cambios hechos desde otro canal. La guía pública indica recargar `GET /api/v1/requests/{id}` al volver a la web, en su sección «Demostración Web → WhatsApp → Call Center».

### Dirección de desarrollo

El portal se sirve en `http://127.0.0.1:5173` durante el desarrollo. El puerto 3000, predeterminado de Next.js, es también el de la API local. El ejemplo de configuración de la API permite `http://localhost:5173`, que es un origen distinto, según [Desarrollo e integración](../../../docs/development.md). El portal prescinde de CORS porque sus llamadas a la API salen del servidor de Next.

## Lo que la API no ofrece

| Función | Estado en la API | Fuente |
| --- | --- | --- |
| Cancelar o reprogramar una cita | Sin operación. | Guía pública, «Catálogos, solicitudes y citas». |
| Cancelar un trámite | Sin operación. El contrato define el estado `CANCELLED` y carece de una operación para cancelar. | `docs/openapi.json`. |
| Disponibilidad de horarios | Los horarios son demostrativos y carecen de verificación de disponibilidad real. | Guía pública, «Catálogos, solicitudes y citas». |
| Edición de perfil | Sin operación. `GET /api/v1/auth/me` solo consulta. | `docs/openapi.json`. |
| Tiempo real | Sin operación ni eventos publicados. | [Arquitectura](../../../docs/architecture.md), «Integración pública». |
| Resultados | Sin operaciones ni estados. `COMPLETED` significa cita confirmada, con paso `CONFIRMED`. | Guía pública, tabla de estados. |

El portal deja estas funciones fuera hasta que exista un contrato acordado.

## Pendientes con el equipo de API

| Pendiente | Efecto en el portal |
| --- | --- |
| Sugerencia: distinguir `MOBILE` de `WEB` | Sin ella, el uso instalado queda registrado como `WEB` y el historial no muestra el cambio entre ambos. |
| Límite de registro e inicio de sesión por IP | Ambas operaciones comparten 10 intentos por IP cada 15 minutos, según el contrato de autenticación. Todas las llamadas llegan desde el servidor del portal, así que los pacientes compartirían ese límite. |
