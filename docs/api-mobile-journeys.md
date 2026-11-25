# Trámites omnicanal desde Flutter

Base pública de la API central: `https://api.salud-digna.app/api/v1`.
Flutter usa el JWT de paciente obtenido con `POST /auth/login` y envía
`Authorization: Bearer <accessToken>`. Las solicitudes POST con cuerpo
usan `Content-Type: application/json`. Las respuestas exitosas incluyen
`Cache-Control: no-store`.

La API central firma internamente la afirmación de la cuenta activa con
canal fijo `demo-mobile`, solicita un permiso por trámite al orquestador
y usa su API key privada. Flutter recibe proyecciones del estado, contexto
e historial. Las afirmaciones, permisos y credenciales de integración
permanecen en el servidor.

## Operaciones

| Método y ruta relativa a la base | Resultado |
| --- | --- |
| `GET /mobile/journeys` | `200` con `items` y hasta 100 trámites activos de la identidad institucional, ordenados por actualización, con los más recientes primero. |
| `POST /mobile/journeys` | `201` con `id` y `status`. Requiere `Idempotency-Key` y un cuerpo `{"type":"APPOINTMENT"}`. |
| `GET /mobile/journeys/:journeyId` | `200` con `id`, `type`, `status`, `createdAt` y `updatedAt`. |
| `GET /mobile/journeys/:journeyId/context` | `200` con `journeyId`, `currentStep`, `version`, `externalRefs` y `updatedAt`. |
| `GET /mobile/journeys/:journeyId/history?limit=20&cursor=…` | `200` con `items` y `nextCursor` cuando hay otra página. El límite es de 1 a 100, con 20 por defecto. |
| `POST /mobile/journeys/:journeyId/events` | `201` con `id` del evento y `journeyId`. |

## Crear y continuar una atención

Para crear, genera `Idempotency-Key` con 32 bytes de un generador
criptográfico y codifícalos en base64url sin relleno. Guarda esa clave
junto a la operación para reintentar con la misma clave y cuerpo, incluso
tras un timeout. Usa otra clave para crear un trámite distinto. La API
central aísla los espacios de claves entre cuentas.

Ejemplo de cuerpo y respuesta:

```json
{"type":"APPOINTMENT"}
```

```json
{"id":"00000000-0000-4000-8000-000000000001","status":"DRAFT"}
```

Para continuar desde Flutter un trámite iniciado en otro canal, ese
trámite debe haber sido vinculado al mismo `CUSTOMER_ID` mediante una
afirmación institucional. Consulta la lista, selecciona su UUID y lee el
contexto. La API central obtiene el permiso móvil correspondiente. No
se necesita código de continuidad para este flujo.

Ejemplo de contexto después de seleccionar el estudio:

```json
{
  "journeyId": "00000000-0000-4000-8000-000000000001",
  "currentStep": "SELECT_CLINIC",
  "version": 2,
  "externalRefs": {"studyId":"00000000-0000-4000-8000-000000000002"},
  "updatedAt": "2026-11-24T06:31:01.000Z"
}
```

El historial conserva los campos `id`, `type`, `producerCode`,
`occurredAt`, `receivedAt`, `schemaVersion` y `data`. El cursor es opaco
y se reenvía en el mismo trámite. Para ver eventos tardíos que quedaron
antes del cursor, solicita otra vez la primera página.

## Publicar un evento

Para `POST /mobile/journeys/00000000-0000-4000-8000-000000000001/events`:

```json
{
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

```json
{"id":"00000000-0000-4000-8000-000000000003","journeyId":"00000000-0000-4000-8000-000000000001"}
```

`JOURNEY_CONTEXT_UPDATED` recibe `expectedVersion` y al menos un UUID
`studyId` o `clinicId`. `JOURNEY_STATUS_CHANGED` recibe
`expectedVersion` y `to` igual a `PENDING_CONFIRMATION` o `CANCELLED`.
Cada reenvío debe conservar el mismo ID externo, fecha y payload. Usa
un ID opaco nuevo para otro evento. La API central deriva el ID de
deduplicación del UUID del trámite y del ID externo, y el orquestador
aplica las reglas de negocio y el control de versión.

## Errores y alcance

- `400` indica datos inválidos. `401` exige iniciar sesión de nuevo y
  `403` indica que la cuenta carece del acceso requerido.
- `404` cubre trámites inaccesibles y una identidad institucional todavía
  sin vínculo al listar. El orquestador usa el mismo código para rechazos
  de identidad. En el primer uso, la creación identificada establece el
  vínculo.
- `409` indica conflicto. Consulta el contexto vigente antes de publicar
  otro avance. Para recuperar una creación o publicación con resultado
  incierto, conserva su clave o ID original.
- `429` indica un límite temporal. `502`, `503` o `504` indican un
  problema de servicio, configuración o timeout respectivamente.

Los permisos institucionales nuevos son para trámites activos. Si un
evento de cancelación ya cerró el trámite, un reintento puede devolver
`404` porque no es posible obtener otro permiso. La deduplicación del
orquestador preserva el evento aplicado. Los trámites provisionales o
fixtures sin vínculo institucional quedan fuera de este flujo. La
integración no confirma citas centrales ni canjea códigos de continuidad.

## Configuración pendiente de operación

En el entorno privado de `apps/api` en `sistemas1`:

- `MOBILE_ORCHESTRATOR_ORIGIN` con `https://orchestrator.salud-digna.app`
  y sin el prefijo REST.
- `MOBILE_ORCHESTRATOR_API_KEY` con la credencial existente de
  `demo-mobile`, en formato `<keyId>.<secret>` y con
  `JOURNEYS_READ` y `EVENTS_PUBLISH`.
- `PATIENT_ASSERTION_PRIVATE_KEY` y
  `PATIENT_ASSERTION_CHANNELS` del
  [emisor institucional](api-patient-assertions.md). La llamada móvil
  invoca el emisor dentro de la API central, por lo que Flutter carece
  de una credencial técnica del emisor.

Confirma que el orquestador desplegado admite la recuperación institucional,
tiene el esquema vigente y cuenta con la clave pública Ed25519
correspondiente y la clave HMAC de identidad. Tras configurar y desplegar
la API central, comprueba con un paciente ficticio que un trámite creado
desde otro canal con afirmación institucional aparece en Flutter y admite
un avance móvil. Este incremento de la API central no añade migraciones.
