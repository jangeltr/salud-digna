# API de Patient Journey

`GET /api/v1/requests/:id/journey` devuelve la línea de tiempo de una solicitud identificada por UUID. Requiere JWT Bearer de una cuenta activa con rol `PATIENT` titular o `ADVISOR` con [permiso temporal vigente](api-call-center.md). El personal administrador usa la [ruta de auditoría](api-admin.md).

El resultado `200` es un arreglo ordenado de la fecha más antigua a la más reciente, con desempate por ID.

```json
[
  {
    "id": "00000000-0000-4000-8000-000000000009",
    "type": "APPOINTMENT_CONFIRMED",
    "createdAt": "2026-11-21T19:10:00.000Z",
    "channel": "CALL_CENTER",
    "actorRole": "ADVISOR",
    "payload": { "appointmentId": "00000000-0000-4000-8000-000000000004", "version": 4 }
  }
]
```

Incluye `REQUEST_CREATED`, `REQUEST_CONTEXT_UPDATED`, `REQUEST_PAUSED`, `REQUEST_RESUMED`, `CHANNEL_SWITCHED`, `REQUEST_STATUS_CHANGED` y `APPOINTMENT_CONFIRMED` cuando existen. Las interacciones operativas de pausa y reanudación complementan el historial si falta su evento equivalente. Cuando ambos existen para la misma acción, se muestra el evento estructurado. Para registros anteriores con marcas de tiempo separadas, se emparejan por tipo, canal y actor dentro de un segundo. El payload admite exclusivamente valores operativos como versión, paso, origen, destino e ID de cita.

`actorRole` indica el rol de la cuenta registrada como actor, si está disponible. La vista omite contenido de conversaciones, notas del contexto, referencias de atención e identificadores de cuenta. El estado operativo vigente se consulta en Requests y Appointments.

`400` indica UUID inválido, `401` sesión ausente o inválida, `403` rol insuficiente o paciente sin perfil y `404` solicitud inexistente o inaccesible. Un asesor sin permiso vigente recibe el mismo `404` que para un ID inexistente.
