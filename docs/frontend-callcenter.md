# Frontend de Call Center y administración

Usa `https://api.salud-digna.app/api/v1` como URL base. Las rutas abreviadas son relativas a esa base. Usa el [contrato OpenAPI](openapi.json) para los cuerpos, parámetros y respuestas. Los ejemplos son sintéticos.

## Sesión y permisos

Inicia sesión con `POST /auth/login` y envía `Authorization: Bearer <accessToken>` en cada operación protegida. Usa `GET /auth/me` para obtener el rol de la cuenta. Las vistas del cliente pueden ajustarse por rol. El backend decide el permiso efectivo y verifica que la cuenta siga activa. El registro público crea cuentas `PATIENT`. Los equipos necesitan cuentas de prueba provisionadas por el backend para operar como `ADVISOR` o `ADMIN`. [Autenticación](api-auth.md)

| Rol | Alcance de esta aplicación |
| --- | --- |
| `ADVISOR` | Canjea una referencia y consulta o confirma esa solicitud durante la autorización. También puede ver su Patient Journey. |
| `ADMIN` | Consulta monitoreo e historial administrativo y gestiona catálogos. Las rutas de asistencia exigen `ADVISOR`. |

**Búsqueda de pacientes.** La API actual carece de búsqueda por nombre, correo, teléfono o ID de paciente, y de un listado de expedientes. La consulta del asesor comienza por una referencia de atención. Buscar a un paciente o ampliar el acceso a sus otras solicitudes requiere un contrato futuro.

## Recuperar una atención

1. El paciente retoma una solicitud abierta iniciada en Web o WhatsApp y genera la referencia desde Web con `POST /requests/:id/assistance-code` sin cuerpo. El código vence a los cinco minutos y se consume una vez.
2. El asesor envía el código a `POST /call-center/claim`. Usa el `requestId` de la respuesta. El permiso dura 30 minutos y se vincula al asesor autenticado.
3. Consulta `GET /call-center/requests/:id`. El detalle incluye el nombre del paciente, el contexto acumulado, el estado, el paso, la versión, el estudio y la clínica si existen, y hasta diez eventos recientes. `GET /requests/:id/journey` muestra el historial completo de eventos disponibles de esa solicitud.
4. Cuando el estado sea `PENDING_CONFIRMATION`, confirma con `POST /call-center/requests/:id/confirm` y la versión vigente. La cita queda `CONFIRMED` y la solicitud `COMPLETED`, con paso `CONFIRMED`. Un reintento compatible con permiso vigente devuelve la cita existente. El paciente puede consultarla desde su propia cuenta.

Petición a `POST /call-center/claim`. En una prueba usa el valor real emitido para la solicitud sintética.

```json
{"code":"EjemploSintetico_00001"}
```

Respuesta `200` del canje.

```json
{
  "requestId": "00000000-0000-4000-8000-000000000001",
  "expiresAt": "2099-01-05T17:00:00.000Z"
}
```

Respuesta de ejemplo de `GET /call-center/requests/:id`.

```json
{
  "id": "00000000-0000-4000-8000-000000000001",
  "type": "APPOINTMENT",
  "status": "PENDING_CONFIRMATION",
  "currentStep": "REVIEW",
  "lastChannel": "WHATSAPP",
  "version": 3,
  "context": {
    "studyId": "00000000-0000-4000-8000-000000000201",
    "clinicId": "00000000-0000-4000-8000-000000000101",
    "scheduledAt": "2099-01-05T16:30:00.000Z"
  },
  "createdAt": "2099-01-05T16:20:00.000Z",
  "updatedAt": "2099-01-05T16:25:00.000Z",
  "completedAt": null,
  "patient": {"firstName":"Alex","lastName":"Ejemplo"},
  "study": {"id":"00000000-0000-4000-8000-000000000201","name":"Demo Glucosa"},
  "clinic": {"id":"00000000-0000-4000-8000-000000000101","name":"Demo Clínica Alameda"},
  "recentEvents": [
    {
      "id": "00000000-0000-4000-8000-000000000009",
      "type": "REQUEST_CONTEXT_UPDATED",
      "createdAt": "2099-01-05T16:25:00.000Z",
      "channel": "WHATSAPP",
      "actorRole": "PATIENT",
      "payload": {"version":3,"currentStep":"REVIEW"}
    }
  ]
}
```

Cuerpo de ejemplo para `POST /call-center/requests/:id/confirm`.

```json
{"version":3}
```

El asesor puede consultar una solicitud abierta aunque esté incompleta. Para editar o completar selecciones, el paciente utiliza su propia sesión de Web o WhatsApp. La vista de asesor carece de una operación de edición de contexto. Tampoco existe una agenda global de citas para asesor ni una API de historiales de chat con texto íntegro. [Call Center](api-call-center.md) · [Estados y contexto](api-requests.md) · [Citas](api-appointments.md)

## Patient Journey y administración

El historial devuelve entradas cronológicas con `id`, `type`, `createdAt`, `channel`, `actorRole` y un `payload` operativo. Puede incluir cambios de estado y canal, pausas y confirmaciones. `actorRole` puede ser `null`. Esta vista omite conversaciones y notas del contexto. [Patient Journey](api-journey.md)

- `GET /admin/overview` devuelve conteos de pacientes, solicitudes y citas y la distribución de solicitudes por estado.
- `GET /admin/requests?page=1&limit=20&status=COMPLETED` devuelve un listado operativo con `items`, `page`, `limit` y `hasMore`. Los elementos incluyen ID de solicitud, estado, paso, último canal y fechas.
- `GET /admin/requests/:id/journey` consulta la trazabilidad individual y registra el acceso en auditoría.
- `POST /clinics`, `PATCH /clinics/:id`, `POST /studies` y `PATCH /studies/:id` permiten administrar catálogos y activar o desactivar registros. El listado público solo muestra activos. [Monitoreo](api-admin.md) · [Clínicas](api-clinics.md) · [Estudios](api-studies.md)

## Errores y restricciones

- `400` señala datos inválidos, un código inválido o vencido, o una solicitud que aún carece de datos para confirmar. Usa un código nuevo si el actual fue consumido o venció.
- `401` exige volver a autenticar. `403` señala rol insuficiente. `404` en una ruta de asesor puede significar falta de autorización, autorización expirada o un ID inaccesible. Pide una referencia nueva sin revelar ni inferir si el recurso existe.
- `409` en confirmación puede indicar versión desactualizada, cierre o datos contradictorios. Recarga el detalle antes de volver a confirmar. `429` en el canje exige respetar `Retry-After`.
- Usa datos sintéticos en demostraciones. El permiso de asistencia es operativo, no una verificación de identidad de nivel clínico.
