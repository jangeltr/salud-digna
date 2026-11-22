# API de monitoreo administrativo

Las rutas requieren JWT Bearer de una cuenta activa con rol `ADMIN`. Están limitadas a personal autorizado. En producción, la asignación de permisos y el acceso a los registros de auditoría deben ajustarse a las políticas institucionales.

| Método y ruta | Respuesta |
| --- | --- |
| `GET /api/v1/admin/overview` | `200` con indicadores agregados. |
| `GET /api/v1/admin/requests` | `200` con el listado operativo paginado. |
| `GET /api/v1/admin/requests/:id/journey` | `200` con la [línea de tiempo](api-journey.md) de la solicitud, con registro de auditoría. |

Ejemplo de indicadores.

```json
{
  "totalPatients": 3,
  "requestsCreated": 5,
  "openRequests": 3,
  "completedRequests": 2,
  "confirmedAppointments": 2,
  "requestsByStatus": {
    "DRAFT": 2,
    "IN_PROGRESS": 1,
    "PENDING_CONFIRMATION": 0,
    "COMPLETED": 2,
    "CANCELLED": 0
  }
}
```

Las solicitudes abiertas son `DRAFT`, `IN_PROGRESS` y `PENDING_CONFIRMATION`. Los indicadores cuentan todos los registros vigentes en la base al consultar. El listado admite `page`, `limit` y `status` opcionales. Devuelve `{ items, page, limit, hasMore }` y ordena por última actualización descendente con desempate por ID.

Ejemplo de elemento del listado.

```json
{
  "id": "00000000-0000-4000-8000-000000000001",
  "status": "COMPLETED",
  "currentStep": "CONFIRMED",
  "lastChannel": "CALL_CENTER",
  "createdAt": "2026-11-21T19:00:00.000Z",
  "updatedAt": "2026-11-21T19:10:00.000Z"
}
```

La consulta individual recibe un UUID de solicitud. Registra `ADMIN_JOURNEY_VIEWED` en `AuditLog` con actor, ID de solicitud y fecha. Las vistas omiten identidad del paciente, contexto y texto de conversaciones. La respuesta es `400` para parámetros inválidos, `401` para sesión ausente o inválida, `403` para rol insuficiente y `404` en la consulta individual de una solicitud inexistente. Swagger UI publica los contratos en `/api/docs`.
