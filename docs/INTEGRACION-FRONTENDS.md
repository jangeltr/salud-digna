# Integración de frontends

Salud Digna ofrece una API REST para el flujo omnicanal de solicitudes, citas y atención asistida. La URL base facilitada para integración es **`https://api.salud-digna.app/api/v1`**. El repositorio privado publica el contrato y las guías para ambos equipos.

| Equipo | Punto de partida |
| --- | --- |
| Público y móvil | [Guía de frontend público](frontend-publico.md) y [contrato de trámites omnicanal para Flutter](api-mobile-journeys.md). |
| Call Center y administración | [Guía de Call Center](frontend-callcenter.md). Canje, recuperación de contexto, confirmación asistida, Journey y monitoreo para `ADMIN`. |
| Ambos | [OpenAPI generado](openapi.json) y [contrato de autenticación](api-auth.md). |

## Contrato y autenticación

El OpenAPI usa `https://api.salud-digna.app` en `servers` y rutas completas con `/api/v1`. Si el cliente configura la base con el prefijo, usa rutas relativas a esa base y añade el prefijo una sola vez. Envía JSON en los cuerpos de frontend y `Authorization: Bearer <accessToken>` en las operaciones con seguridad `bearer`. Consulta la guía del equipo para condiciones adicionales de rol, titularidad o permiso de asistencia. El JWT vencido exige iniciar sesión nuevamente. Si el navegador bloquea la petición por CORS, reporta el origen de la aplicación al equipo de API para revisar la lista del entorno.

## Flujos y disponibilidad

- **Público y móvil.** Registro e inicio de sesión, catálogos activos, solicitud versionada, confirmación propia y consulta de citas y de Journey.
- **Call Center.** Referencia emitida por el paciente, autorización temporal para el asesor, recuperación del contexto y confirmación asistida. La administración dispone de vistas operativas y gestión de catálogos. La búsqueda general de pacientes, la edición asistida de contexto y la consulta global de citas carecen de endpoints.
- **WhatsApp.** La integración está implementada para Meta y Twilio. El entorno activa un solo proveedor y requiere sus credenciales y callback externos. Los webhooks son para proveedores autenticados. El cliente web usa la API de identidad y el paciente continúa en el chat del número activo. [Activación y Sandbox](integrations/whatsapp.md)
- **Desarrollo.** Los endpoints de simulación de identidad y conversación requieren su configuración local. El diagnóstico `/health/db` queda fuera de producción. El contrato combina los perfiles para documentar todas las operaciones posibles. Su inclusión no implica que estén habilitadas en el despliegue.

## Regenerar OpenAPI

Desde la raíz, con las dependencias del workspace instaladas, ejecuta:

```sh
pnpm --filter @salud-digna/api openapi:generate
```

El comando genera Prisma Client sin cargar `apps/api/.env`, compila y extrae los metadatos de Swagger de las aplicaciones NestJS con perfiles sintéticos Meta y Twilio. No inicia los hooks ni la escucha HTTP. Los perfiles no usan PostgreSQL ni servicios externos. El archivo resultante es `docs/openapi.json`. Usa ese archivo desde el repositorio privado en las herramientas de integración. Swagger UI se reserva para uso local o interno. Regenera el contrato al cambiar controladores, DTO o decoradores y revisa el diff antes de integrar.

## Inconsistencias y trabajo con agentes

Reporta al equipo de API la revisión del repositorio, entorno, método, ruta, rol, cuerpo sintético, código observado y comportamiento esperado según OpenAPI. Omite tokens, referencias activas y datos personales. Cuando una ruta o campo falte, conserva el caso como pendiente en el frontend y coordina el contrato antes de implementarlo.

Ejemplo de tarea para Codex o Claude:

> Lee AGENTS.md, docs/openapi.json y docs/frontend-callcenter.md. Implementa el formulario de canje para ADVISOR usando la operación documentada. Maneja 400, 401, 403 y 429. Verifica que el cuerpo y las propiedades de la respuesta coincidan con el contrato. Si falta una operación, repórtala con el método y la ruta que se necesitan.
