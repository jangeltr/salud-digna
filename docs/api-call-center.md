# API de Call Center

El flujo del MVP permite que un paciente con una solicitud abierta autorice a un asesor a recuperar el avance y confirmar la cita. La referencia acredita el permiso operativo para esa solicitud durante un tiempo limitado. La verificación clínica de identidad queda fuera de este flujo.

| Método y ruta | Rol | Resultado |
| --- | --- | --- |
| `POST /api/v1/requests/:id/assistance-code` | `PATIENT` titular | `201` con la referencia y su vencimiento. La solicitud debe estar abierta. |
| `POST /api/v1/call-center/claim` | `ADVISOR` | `200` con el ID de solicitud y el vencimiento del permiso. |
| `GET /api/v1/call-center/requests/:id` | `ADVISOR` con permiso vigente | `200` con el contexto de la solicitud y hasta diez eventos recientes. |
| `POST /api/v1/call-center/requests/:id/confirm` | `ADVISOR` con permiso vigente | `200` con la cita confirmada o recuperada. |

Todas las rutas requieren un JWT Bearer válido de una cuenta activa. Los identificadores de ruta son UUID. El servidor obtiene los IDs de paciente y asesor desde la sesión y la autorización persistida.

## Emitir y canjear

La emisión se hace sin cuerpo. Devuelve un código aleatorio de 22 caracteres con `Cache-Control: no-store`. El paciente lo comunica al asesor por el canal de atención.

```json
{ "code": "EjemploSintetico_00001", "expiresAt": "2026-11-21T19:05:00.000Z" }
```

El asesor envía `{"code":"EjemploSintetico_00001"}` a `/api/v1/call-center/claim`. En una prueba usa el código emitido por la API. Si el canje es correcto, recibe una respuesta como esta.

```json
{ "requestId": "00000000-0000-4000-8000-000000000001", "expiresAt": "2026-11-21T19:31:00.000Z" }
```

El código caduca a los cinco minutos y se almacena solo como hash SHA-256. Una escritura condicional lo consume y fija el asesor de la sesión por 30 minutos. El canje no devuelve el código. El límite es de diez intentos por IP por cada ventana de quince minutos y se mantiene en memoria por instancia. Un reinicio restablece el contador, mientras la vigencia y el uso único se mantienen en PostgreSQL.

## Recuperar y confirmar

El detalle devuelve los campos del [contrato de Requests](api-requests.md), `patient` con `firstName` y `lastName`, `study` y `clinic` con `id` y `name` cuando están disponibles, y `recentEvents` en orden cronológico. La fecha propuesta está en `context.scheduledAt` cuando se ha capturado. Los datos acumulados quedan limitados a los campos de contexto de esa solicitud.

Para confirmar, envía la versión vigente en el cuerpo, por ejemplo `{"version":3}`. Se aplican los [requisitos e idempotencia de citas](api-appointments.md). La confirmación registra el canal `CALL_CENTER` y la cuenta del asesor como actor. Un reintento requiere que el mismo asesor conserve un permiso vigente. La cita y el historial siguen disponibles para el paciente desde su propia cuenta.

| HTTP | Motivo |
| --- | --- |
| `400` | UUID o cuerpo inválido, referencia inválida, vencida, consumida o correspondiente a una solicitud cerrada. En confirmación también incluye contexto o selección inválidos. |
| `401` | JWT ausente o inválido. |
| `403` | Rol insuficiente o cuenta de paciente sin perfil. |
| `404` | Solicitud inexistente o sin acceso vigente para esa cuenta. |
| `409` | Solicitud cerrada, conflicto de versión o confirmación previa contradictoria. |
| `429` | Límite de canje alcanzado. `Retry-After` indica los segundos para reintentar. |

Para una demostración, crea una solicitud como paciente, completa sus selecciones, emite la referencia, cambia a la sesión del asesor, canjea el código, recupera el contexto y confirma con su versión actual. Consulta el [Patient Journey](api-journey.md) al finalizar. El contrato Swagger se publica en `/api/docs`.
