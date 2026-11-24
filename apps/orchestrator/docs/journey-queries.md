# Consultas de trámites

Invoca estas operaciones desde el backend del canal. Todas requieren
`Authorization: Bearer <keyId>.<secret>` con scope `JOURNEYS_READ` y
`X-Journey-Grant: <permiso>` con operación `READ_JOURNEY`. El permiso debe
corresponder al mismo canal y al UUID del trámite en la ruta.

| Operación | Respuesta HTTP 200 |
| --- | --- |
| `GET /api/v1/journeys/:journeyId` | `id`, `type`, `status`, `createdAt`, `updatedAt` |
| `GET /api/v1/journeys/:journeyId/context` | `journeyId`, `currentStep`, `version`, `externalRefs`, `updatedAt` |
| `GET /api/v1/journeys/:journeyId/history` | `items` y, cuando hay otra página, `nextCursor` |

Los IDs son UUID y las fechas se serializan en ISO 8601 en UTC.
`externalRefs` es un objeto que puede estar vacío. Para el tipo
`APPOINTMENT`, admite `appointmentId`, `clinicId` y `studyId` como UUID
opacos. Se omiten claves desconocidas y valores inválidos. Los tipos sin
lista de referencias definida devuelven `{}`. El orquestador no resuelve
estas referencias en la API central.

Las respuestas exitosas usan `Cache-Control: no-store`. Un error `401`
indica una credencial de canal inválida o ausente. Un `403` indica que la
credencial carece de scope. Con un canal autenticado y el scope requerido,
el mismo `404` cubre trámite o contexto inexistente y permiso ausente,
inválido, vencido, revocado o ajeno al trámite o canal.

Las consultas de estado y contexto registran `READ_CONTEXT` con motivo
`JOURNEY_SUMMARY` o `JOURNEY_CONTEXT`. El historial registra `READ_TIMELINE`
con motivo `JOURNEY_HISTORY` por cada página exitosa, incluso si está vacía.
El canal y el actor se obtienen de los guards. Cada lectura y su auditoría
ocurren en una misma transacción.

## Historial

Envía `limit` como entero de 1 a 100. El valor predeterminado es 20. Para la
siguiente página, envía `cursor` con el valor exacto de `nextCursor`. El
cursor está ligado al trámite y admite hasta 200 caracteres. Un cursor
inválido o de otro trámite, o un límite inválido, devuelve `400` tras las
comprobaciones de acceso. La última página omite `nextCursor`. Un historial
vacío devuelve `{"items":[]}`.

Cada elemento incluye `id`, `type`, `producerCode`, `occurredAt`,
`receivedAt`, `schemaVersion` y `data`. `producerCode` identifica al canal
registrado como emisor. Los eventos se ordenan de forma ascendente por
`occurredAt` y, en caso de empate, por `id`. `receivedAt` indica cuándo el
orquestador recibió el evento. Si un evento tardío queda antes de un cursor
ya recorrido, vuelve a consultar desde la primera página para verlo.

`data` proyecta únicamente estos campos para `schemaVersion: 1`:

| Tipo | Campos permitidos |
| --- | --- |
| `JOURNEY_CREATED`, `APPOINTMENT_CONFIRMED` | `version` entera positiva |
| `JOURNEY_CONTEXT_UPDATED` | `version` y `currentStep` si es `SELECT_STUDY`, `SELECT_CLINIC`, `SELECT_DATETIME`, `REVIEW` o `CONFIRMED` |
| `JOURNEY_STATUS_CHANGED` | `version`, `from` y `to`, con estados del enum `JourneyStatus` |

Los campos inválidos se omiten. Los tipos o versiones sin una proyección
definida mantienen sus metadatos y devuelven `data: {}`.
