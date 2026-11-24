# Creación de trámites y publicación de eventos

Usa estas rutas desde el backend del canal sobre HTTPS. Envía
`Content-Type: application/json` y `Authorization: Bearer <keyId>.<secret>`
con scope `EVENTS_PUBLISH`. Para publicar, envía además
`X-Journey-Grant: <permiso>` con operación `PUBLISH_EVENT` para el mismo
canal y el UUID en el cuerpo. Excluye ambos encabezados y el permiso
devuelto al crear del registro de solicitudes y respuestas.

## Crear un trámite

`POST /api/v1/journeys` acepta exclusivamente este cuerpo:

```json
{"type":"APPOINTMENT"}
```

Devuelve `201 Created` y `Cache-Control: no-store`:

```json
{
  "id": "00000000-0000-4000-8000-000000000001",
  "status": "DRAFT",
  "grant": "<permiso-opaco>",
  "grantExpiresAt": "2026-11-24T06:35:00.000Z"
}
```

Se crea un sujeto interno provisional, un contexto `SELECT_STUDY` en versión
1 y un evento `JOURNEY_CREATED`. La ruta rechaza referencias de pacientes,
identificadores externos, datos de contacto y actores aportados por el
cliente. El sujeto provisional carece de identidad verificada y no permite
leer datos de otros trámites o pacientes. No se consulta la API central.

El permiso dura cinco minutos y se entrega una vez. Está ligado al canal
creador, al UUID devuelto y a una referencia de sesión generada por el
orquestador. El backend lo conserva vinculado a la sesión que originó la
creación. Permite lectura y publicación sobre ese trámite, sujetas además
a los scopes de la API key. Crear un trámite carece de idempotencia en
este incremento. Un reintento tras una respuesta perdida puede crear otro
trámite provisional.

## Publicar un avance

`POST /api/v1/events` acepta la versión de esquema 1. El campo `occurredAt`
usa UTC con milisegundos. Para `externalEventId` usa un identificador opaco
sin datos personales, de 1 a 128 caracteres, comenzando con un alfanumérico
y usando después únicamente alfanuméricos, punto, guion, guion bajo o
dos puntos. El prefijo `system:` está reservado.

```json
{
  "journeyId": "00000000-0000-4000-8000-000000000001",
  "externalEventId": "demo-study-selected-01",
  "type": "JOURNEY_CONTEXT_UPDATED",
  "schemaVersion": 1,
  "occurredAt": "2026-11-24T06:31:00.000Z",
  "payload": {
    "expectedVersion": 1,
    "studyId": "00000000-0000-4000-8000-000000000002"
  }
}
```

| Tipo | Campos de `payload` y reglas |
| --- | --- |
| `JOURNEY_CONTEXT_UPDATED` | `expectedVersion` y al menos uno de `studyId` o `clinicId` como UUID. El trámite debe estar abierto; se requiere un estudio antes de guardar la clínica. Cambiar de estudio elimina la selección anterior de clínica. El trámite queda `IN_PROGRESS` en `SELECT_CLINIC` o `REVIEW`. |
| `JOURNEY_STATUS_CHANGED` | `expectedVersion` y `to`. `PENDING_CONFIRMATION` requiere `IN_PROGRESS` con estudio y clínica. `CANCELLED` se admite desde un estado abierto. Los estados terminales rechazan avances nuevos. |

El servicio deriva el productor de la API key y comprueba el permiso contra
el UUID del cuerpo. Las referencias son opacas y se validan por formato.
Los campos adicionales se rechazan. Cada avance aceptado incrementa la
versión y registra el evento y la auditoría en la misma transacción.
El evento devuelve `201` con `{"id":"<UUID del evento>","journeyId":"<UUID del trámite>"}`.
Un reenvío equivalente con el mismo ID externo y productor devuelve el
mismo resultado, incluso si avanzó la versión del contexto. Reutilizar
la clave con otro contenido devuelve `409`.

`400` indica un cuerpo inválido. `401` indica credencial de canal ausente
o inválida y `403` falta de scope. `404` cubre permisos de trámite inválidos
o recursos inaccesibles. `409` indica una versión obsoleta, una transición
inválida o un conflicto de deduplicación. Ante una versión obsoleta,
consulta el contexto antes de enviar un evento nuevo.

## Consultar contexto y cambiar de canal

El canal creador puede llamar a
`GET /api/v1/journeys/00000000-0000-4000-8000-000000000001/context`
con una API key que tenga `JOURNEYS_READ` y el permiso de creación en
`X-Journey-Grant`. Después del avance del ejemplo, una respuesta posible es:

```json
{
  "journeyId": "00000000-0000-4000-8000-000000000001",
  "currentStep": "SELECT_CLINIC",
  "version": 2,
  "externalRefs": {"studyId": "00000000-0000-4000-8000-000000000002"},
  "updatedAt": "2026-11-24T06:31:01.000Z"
}
```

Consulta el [contrato de lectura](journey-queries.md) para las demás
consultas autorizadas.

Un canal distinto utiliza su propia API key y un permiso emitido
específicamente para ese canal, trámite, actor y operaciones. Para trámites
ficticios del Hackatec, un operador local autorizado comprueba la atención
y emite ese permiso mediante la
[CLI de demostración](../README.md#permisos-de-demostración-para-hackatec).
Compartir el permiso del primer canal produce `404` en el segundo.

La creación y el registro de avances operativos están implementados. El
aprovisionamiento entre canales es manual para la demo. Quedan pendientes
la verificación y vinculación de identidad de pacientes existentes, la
renovación de permisos por un flujo autorizado y la confirmación de una
cita central mediante un comprobante verificable.
