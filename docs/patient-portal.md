# Portal del paciente

`apps/patient-portal/` es la web pública del paciente y también su aplicación móvil. Se construirá con Next.js, TypeScript y Tailwind como sitio web y como PWA instalable. Consume los contratos documentados de la API y usa respuestas simuladas mientras un flujo no esté disponible.

Este incremento reserva la estructura de carpetas. El código de aplicación y las dependencias llegarán en cambios posteriores.

## Estructura

| Ruta | Propósito |
| --- | --- |
| `app/` | Rutas del App Router. Los grupos `(public)`, `(booking)` y `(account)` separan las páginas sin sesión, el flujo de agendamiento y el área personal. `api/` contiene los manejadores de servidor del portal. |
| `features/` | Un módulo por dominio: `catalog`, `requests`, `appointments`, `auth`, `identity` y `help`. |
| `lib/` | Código transversal: `api` para el cliente tipado, `channel` para el canal de origen y `session` para la sesión del paciente. |
| `components/` | Interfaz compartida y las dos navegaciones, la del sitio web y la de la app instalada. |
| `mocks/` | Respuestas simuladas que cumplen el contrato. |
| `public/` | Manifiesto de la PWA e iconos. |

Las carpetas y el código usan nombres en inglés alineados con los módulos de la API. La documentación y los textos para el paciente se escriben en español.

## Decisiones

### La app móvil es la PWA del portal

El canal móvil se cubre instalando este mismo portal como PWA. El repositorio no tendrá un proyecto móvil aparte. Esto resuelve la ubicación de la aplicación móvil que el README dejaba por definir.

### Canal de origen

El portal distingue dos valores del enum `Channel` de la API. Reporta `WEB` cuando se usa en el navegador y `MOBILE` cuando corre instalado, lo que se detecta con `display-mode: standalone`. `lib/channel` concentra esa detección.

Hoy la API registra como `WEB` toda petición autenticada con JWT, incluidas las de una app, según el [contrato de solicitudes](api-requests.md). Reportar `MOBILE` depende de un cambio pendiente en la API, que debe definir cómo recibe el canal. Hasta entonces el portal omite el canal y sus acciones quedan registradas como `WEB`.

### Sesión

El JWT que devuelve `POST /api/v1/auth/login` se guarda en una cookie `HttpOnly` del origen del portal. El código del navegador no puede leer el token y nunca llama a la API. El navegador habla con el portal, y el servidor de Next llama a la API con el token de la cookie. Los manejadores de `app/api/` y el cliente de `lib/api` se ejecutan solo en el servidor.

El token dura `expiresIn` segundos, 1800 por defecto, y la API no ofrece renovación. Al vencer, el paciente vuelve a iniciar sesión. Consulta el [contrato de autenticación](api-auth.md).

### Confirmación de la cita

El paciente confirma su cita en el portal con `POST /api/v1/requests/:id/confirm` y la versión vigente de la solicitud. Un asesor interviene solo si el paciente genera un código de asistencia con `POST /api/v1/requests/:id/assistance-code` y se lo comunica. Consulta los contratos de [citas](api-appointments.md) y [Call Center](api-call-center.md).

### Historial de la solicitud

La línea de tiempo de `GET /api/v1/requests/:id/journey` se muestra dentro de `features/requests`, junto a la solicitud a la que pertenece. Consulta el [contrato de Journey](api-journey.md).

### Actualización sin tiempo real

El portal consulta el estado por REST a intervalos y compara `version` para detectar cambios hechos desde otro canal. La estructura omite un módulo de tiempo real mientras la API no publique eventos Socket.IO.

### Puerto de desarrollo

El portal se sirve en `http://localhost:5173` durante el desarrollo. El puerto 3000, predeterminado de Next.js, es también el de la API. Ese origen ya figura entre los que permite el ejemplo de configuración de la API, según [Desarrollo e integración](development.md). Las llamadas que salen del servidor de Next funcionan con independencia de CORS.

### Tipos del cliente de API

`lib/api` contiene tipos temporales transcritos a mano de `docs/api-*.md`. Se sustituirán por tipos generados cuando exista `packages/contracts/openapi.json`. El portal evita importar código de `apps/api`. Mientras tanto, cada cambio de contrato en esos documentos debe reflejarse en `lib/api` y en `mocks/`.

## Pendientes que dependen de la API

| Pendiente | Efecto en el portal |
| --- | --- |
| Recibir el canal que declara el portal | Sin él, el uso instalado queda registrado como `WEB` y el cambio entre `WEB` y `MOBILE` no aparece en el historial. |
| Publicar `openapi.json` en `packages/contracts/` | Permite generar los tipos y retirar la transcripción manual. |
| Límite de registro e inicio de sesión por IP | Todas las llamadas llegan desde el servidor del portal. Los pacientes comparten los 10 intentos cada 15 minutos mientras la API no reciba la IP del paciente. |
