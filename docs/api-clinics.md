# API de clínicas

| Método y ruta | Acceso | Respuesta |
| --- | --- | --- |
| `GET /api/v1/clinics` | Público | `200` con una página de clínicas activas. |
| `GET /api/v1/clinics/:id` | Público | `200` con una clínica activa. |
| `POST /api/v1/clinics` | JWT Bearer con rol `ADMIN` | `201` con la clínica creada. |
| `PATCH /api/v1/clinics/:id` | JWT Bearer con rol `ADMIN` | `200` con la clínica actualizada. Admite registros inactivos. |

## Consultas

El parámetro `:id` es un UUID. El listado acepta `page` entre 1 y 10 000, `limit` entre 1 y 100 y `q` opcional de 1 a 100 caracteres para buscar un fragmento del nombre sin distinguir mayúsculas. Los valores predeterminados son `page=1` y `limit=20`. Ordena por nombre, con desempate por ID.

Ejemplo de consulta `GET /api/v1/clinics?q=alameda&limit=10`.

```json
{
  "page": 1,
  "limit": 10,
  "hasMore": false,
  "items": [
    {
      "id": "00000000-0000-4000-8000-000000000101",
      "name": "Demo Clínica Alameda",
      "address": "Avenida Ejemplo 101",
      "city": "Ciudad Ejemplo",
      "state": "Estado Ejemplo",
      "isActive": true
    }
  ]
}
```

El detalle y las escrituras devuelven un objeto con los mismos campos que cada elemento del listado.

## Escrituras

`POST` requiere `name` (1–120 caracteres), `address` (1–250), `city` y `state` (1–100 cada uno). La API recorta espacios exteriores. `isActive` es un booleano opcional y su valor predeterminado es `true`. En `PATCH`, los campos omitidos conservan sus valores.

```json
{
  "name": "Demo Clínica Alameda",
  "address": "Avenida Ejemplo 101",
  "city": "Ciudad Ejemplo",
  "state": "Estado Ejemplo"
}
```

Para desactivar una clínica envía `{"isActive":false}`. Envía `{"isActive":true}` al mismo UUID para reactivarla. Conserva ese identificador para operaciones administrativas futuras.

| HTTP | Motivo |
| --- | --- |
| `400` | UUID, parámetros o cuerpo inválidos. También se rechazan campos adicionales. |
| `401` | Escritura con JWT ausente o inválido. |
| `403` | Escritura con rol distinto de `ADMIN`. |
| `404` | Registro inexistente o consulta pública de un registro inactivo. |

Requests acepta solo sedes activas como selecciones de contexto. Las solicitudes previas conservan el identificador persistido y siguen disponibles mediante su propia API si una sede se desactiva. La oferta de estudios por sede y la disponibilidad de citas quedan pendientes. Consulta los DTO en Swagger UI (`/api/docs`) y la [carga de datos sintéticos](../README.md#catálogos-de-demostración).
