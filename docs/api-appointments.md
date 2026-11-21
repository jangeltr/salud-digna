# API de citas

Las rutas requieren JWT Bearer de una cuenta activa con rol `PATIENT` y un perfil de paciente. La API obtiene el titular de la sesión y acota las consultas a sus propias citas y solicitudes. El contrato OpenAPI está disponible en Swagger UI (`/api/docs`).

| Método y ruta | Entrada | Resultado |
| --- | --- | --- |
| `POST /api/v1/requests/:id/confirm` | UUID de solicitud y cuerpo con `version`. | `200` con la cita confirmada o recuperada. |
| `GET /api/v1/appointments` | `page` y `limit` opcionales. | `200` con una página de citas propias de cualquier estado. |
| `GET /api/v1/appointments/upcoming` | `page` y `limit` opcionales. | `200` con una página de citas propias confirmadas y futuras. |
| `GET /api/v1/appointments/:id` | UUID de cita. | `200` con el detalle de una cita propia. |

## Confirmación

Envía la versión obtenida de `GET /api/v1/requests/:id`. La entrada de confirmación contiene un solo campo.

```json
{ "version": 2 }
```

La solicitud debe estar en `PENDING_CONFIRMATION`, paso `REVIEW`, y conservar un estudio activo, una clínica activa y una fecha futura. La propuesta se captura en el [contexto de la solicitud](api-requests.md) mediante ISO 8601 con zona horaria explícita. PostgreSQL almacena el instante y la API lo devuelve en UTC.

La transacción crea una cita `CONFIRMED`, cambia la solicitud a `COMPLETED` con paso `CONFIRMED`, marca `completedAt` e incrementa la versión. Conserva el contexto y la trazabilidad anterior. Registra `APPOINTMENT_CONFIRMED` y `REQUEST_STATUS_CHANGED` con solicitud, paciente, actor, canal y fecha. Si la sesión confirma desde un canal distinto al anterior, también registra `CHANNEL_SWITCHED`. Las confirmaciones públicas por JWT se atribuyen a `WEB`.

La escritura condicional valida la versión de la solicitud abierta. Ante un `409` por versión, recupera la solicitud y revisa el contexto antes de enviar otra confirmación. Si la solicitud ya fue completada y su cita confirmada coincide con las selecciones persistidas, la API devuelve esa cita con `200`, incluso con la versión usada en el primer intento. Esta recuperación conserva el historial aunque la fecha haya pasado o el catálogo se haya desactivado. La restricción única por solicitud y la transacción impiden duplicar la cita. El reintento exitoso conserva la versión y los eventos.

## Respuestas y consultas

```json
{
  "id": "00000000-0000-4000-8000-000000000004",
  "requestId": "00000000-0000-4000-8000-000000000001",
  "study": {
    "id": "00000000-0000-4000-8000-000000000201",
    "name": "Demo Glucosa"
  },
  "clinic": {
    "id": "00000000-0000-4000-8000-000000000101",
    "name": "Demo Clínica Alameda"
  },
  "scheduledAt": "2027-01-05T16:30:00.000Z",
  "status": "CONFIRMED",
  "createdAt": "2026-11-21T19:10:00.000Z"
}
```

Los listados devuelven `{ items, page, limit, hasMore }`. Los valores predeterminados son `page=1` y `limit=20`, con un máximo de 100 por página. El listado general ordena por fecha agendada descendente. El de próximas citas devuelve primero la fecha futura más cercana. Ambos usan el ID como desempate. El modelo admite `PENDING`, `CONFIRMED` y `CANCELLED`. Esta operación crea citas en `CONFIRMED`.

| HTTP | Motivo |
| --- | --- |
| `400` | UUID, paginación o cuerpo inválidos. En confirmación también indica que la solicitud aún carece del estado o contexto requerido, la selección está inactiva o la fecha ya pasó. |
| `401` | JWT ausente o inválido. |
| `403` | Rol insuficiente o cuenta sin perfil de paciente. |
| `404` | Solicitud o cita inexistente o perteneciente a otro paciente. |
| `409` | Versión desactualizada de una solicitud abierta, solicitud cancelada o datos contradictorios en una confirmación previa. |

## Límites del MVP

Los horarios son demostrativos y carecen de validez como disponibilidad real de Salud Digna. La confirmación registra la cita del MVP. La comprobación de horarios laborales, cupos, disponibilidad real y calendarios externos queda pendiente. La [confirmación asistida de Call Center](api-call-center.md) exige un permiso vigente para el asesor. Reutiliza la transacción de citas y registra el canal `CALL_CENTER` y al asesor como actor.
