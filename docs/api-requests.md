# API de solicitudes de agendamiento

Todas las rutas públicas requieren `Authorization: Bearer <jwt>` de un usuario activo con rol `PATIENT` y perfil de paciente. Los datos del titular y el canal se determinan en el servidor. Swagger UI publica el contrato en `/api/docs`.

## Rutas

| Método y ruta | Entrada | Respuesta |
| --- | --- | --- |
| `POST /api/v1/requests` | `{}` o `{"type":"APPOINTMENT"}`. | `201` con la solicitud en `DRAFT`, paso `SELECT_STUDY`, versión 1 y contexto vacío. |
| `GET /api/v1/requests` | `page`, `limit` y `status` opcionales. | `200` con una página de solicitudes propias. |
| `GET /api/v1/requests/pending` | `page` y `limit` opcionales. | `200` con una página de solicitudes abiertas. |
| `GET /api/v1/requests/:id` | UUID de la solicitud. | `200` con el estado y el contexto persistidos. |
| `PATCH /api/v1/requests/:id/context` | `version` y selecciones o notas a actualizar. | `200` con el contexto y la versión nuevos. |
| `POST /api/v1/requests/:id/pause` | `{"version":2}`, con la versión vigente. | `200` con el paso y el contexto conservados. Registra la interrupción e incrementa la versión. |
| `POST /api/v1/requests/:id/resume` | `{"version":3}`, con la versión vigente. | `200` con el avance actual. Si cambia de canal, actualiza `lastChannel` e incrementa la versión. |

Los listados devuelven `{ items, page, limit, hasMore }` y ordenan por `updatedAt` descendente, con desempate por ID. La primera página es 1 y el tamaño predeterminado es 20, con un máximo de 100. `/pending` incluye `DRAFT`, `IN_PROGRESS` y `PENDING_CONFIRMATION`, también tras una pausa.

## Actualización parcial

```json
{
  "version": 1,
  "studyId": "00000000-0000-4000-8000-000000000002",
  "clinicId": "00000000-0000-4000-8000-000000000003",
  "scheduledAt": "2027-01-05T10:30:00-06:00",
  "notes": "Prefiero el turno de la mañana."
}
```

- `studyId` y `clinicId` deben ser UUID de registros activos. La clínica exige un estudio y la fecha exige una clínica. Las selecciones pueden enviarse en una sola operación o de manera progresiva.
- `scheduledAt` debe indicar una fecha futura en ISO 8601 con segundos y zona horaria explícita. Se guarda en UTC. `notes` admite hasta 500 caracteres. Usa notas operativas y evita incluir datos clínicos. Envía `null` para quitar una fecha o una nota.
- Los campos omitidos conservan sus valores. Al cambiar el estudio se invalidan la clínica y la fecha anteriores. Al cambiar la clínica se invalida la fecha anterior. Puedes proporcionar reemplazos válidos en esa misma petición.
- El contrato acepta exclusivamente `version` y los cuatro campos de contexto. Los valores de estado, paso, titular y canal se calculan en el servidor.

Ejemplo sintético de la respuesta a la actualización.

```json
{
  "id": "00000000-0000-4000-8000-000000000001",
  "type": "APPOINTMENT",
  "status": "PENDING_CONFIRMATION",
  "currentStep": "REVIEW",
  "lastChannel": "WEB",
  "version": 2,
  "context": {
    "studyId": "00000000-0000-4000-8000-000000000002",
    "clinicId": "00000000-0000-4000-8000-000000000003",
    "scheduledAt": "2027-01-05T16:30:00.000Z",
    "notes": "Prefiero el turno de la mañana."
  },
  "createdAt": "2026-11-21T19:00:00.000Z",
  "updatedAt": "2026-11-21T19:01:00.000Z",
  "completedAt": null
}
```

## Estados y concurrencia

| Contexto persistido | Paso | Estado |
| --- | --- | --- |
| Sin estudio | `SELECT_STUDY` | `DRAFT` |
| Con estudio, falta clínica | `SELECT_CLINIC` | `IN_PROGRESS` |
| Con clínica, falta fecha | `SELECT_DATETIME` | `IN_PROGRESS` |
| Con estudio, clínica y fecha | `REVIEW` | `PENDING_CONFIRMATION` |

Las correcciones pueden hacer retroceder el paso. `COMPLETED` y `CANCELLED` son estados cerrados y rechazan escrituras ordinarias. `CONFIRMED` se reserva para la confirmación definitiva. La fecha propuesta queda guardada para revisión y aún carece de una reserva o validación de disponibilidad.

La versión se comprueba con una escritura condicional. Con `409`, vuelve a consultar `GET /api/v1/requests/:id` y aplica la intención del usuario sobre la versión nueva si la solicitud sigue abierta. Una pausa registra la interrupción sin cerrar el trámite. Una reanudación en el mismo canal registra actividad con la misma versión y el mismo contexto.

## Canales, acceso y trazabilidad

Las peticiones públicas con JWT se registran como `WEB`, incluidas las que una app haga al mismo contrato. La interfaz interna de `RequestsService` admite un adaptador de WhatsApp que compruebe la procedencia de la acción antes de invocar el servicio. `IdentityService` debe resolver el identificador real como verificado y la cuenta de paciente debe estar activa. Los identificadores del simulador quedan fuera de ese flujo. El acceso de `ADVISOR` y `ADMIN` queda pendiente del flujo autorizado y auditado de Call Center.

Se registran `REQUEST_CREATED`, `REQUEST_CONTEXT_UPDATED`, `REQUEST_PAUSED`, `REQUEST_RESUMED`, `CHANNEL_SWITCHED` y `REQUEST_STATUS_CHANGED` según corresponda. Los eventos incluyen solicitud, paciente, actor, canal y fecha. Su carga conserva la versión y el paso, estado o canal relevantes. Las notas y selecciones quedan en el contexto. Pausa y reanudación generan además una `Interaction` sin contenido. Cada escritura y su trazabilidad se guardan en una sola transacción.

| HTTP | Motivo |
| --- | --- |
| `400` | Parámetros, versión, formato, dependencias del contexto o selecciones inválidos. |
| `401` | JWT ausente o inválido. |
| `403` | Rol insuficiente o falta de perfil de paciente. |
| `404` | Solicitud inexistente o perteneciente a otro paciente. |
| `409` | Versión desactualizada o solicitud cerrada. |
