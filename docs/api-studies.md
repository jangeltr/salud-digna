# API de estudios

| Método y ruta | Acceso | Respuesta |
| --- | --- | --- |
| `GET /api/v1/studies` | Público | `200` con una página de estudios activos. |
| `GET /api/v1/studies/:id` | Público | `200` con un estudio activo. |
| `POST /api/v1/studies` | JWT Bearer con rol `ADMIN` | `201` con el estudio creado. |
| `PATCH /api/v1/studies/:id` | JWT Bearer con rol `ADMIN` | `200` con el estudio actualizado. Admite registros inactivos. |

## Consultas

El parámetro `:id` es un UUID. El listado acepta `page` entre 1 y 10 000, `limit` entre 1 y 100 y `q` opcional de 1 a 100 caracteres para buscar un fragmento del nombre sin distinguir mayúsculas. Los valores predeterminados son `page=1` y `limit=20`. Ordena por nombre, con desempate por ID.

Ejemplo de consulta `GET /api/v1/studies?q=glucosa&limit=10`.

```json
{
  "page": 1,
  "limit": 10,
  "hasMore": false,
  "items": [
    {
      "id": "00000000-0000-4000-8000-000000000201",
      "name": "Demo Glucosa",
      "description": "Estudio sintético. Precio de demostración, sin validez como tarifa oficial.",
      "price": "120.00",
      "isActive": true
    }
  ]
}
```

El detalle y las escrituras devuelven un objeto con los mismos campos que cada elemento del listado. El precio se guarda como `Decimal(12,2)` y se devuelve siempre como cadena con dos decimales.

## Escrituras

`POST` requiere `name` de 1 a 120 caracteres y `price` como cadena decimal no negativa con hasta 10 dígitos enteros y hasta dos decimales. Usa un punto decimal y omite separadores de miles. `description` es opcional y admite hasta 1000 caracteres o `null`. La API recorta espacios exteriores del nombre y la descripción. `isActive` es un booleano opcional y su valor predeterminado es `true`.

```json
{
  "name": "Demo Glucosa",
  "description": "Estudio sintético de demostración.",
  "price": "120.00"
}
```

En `PATCH`, omite los campos que quieras conservar y envía `{"description":null}` para borrar una descripción. Usa `{"isActive":false}` para desactivar el estudio y `{"isActive":true}` para reactivarlo con el mismo UUID.

| HTTP | Motivo |
| --- | --- |
| `400` | UUID, parámetros o cuerpo inválidos. También se rechazan campos adicionales. |
| `401` | Escritura con JWT ausente o inválido. |
| `403` | Escritura con rol distinto de `ADMIN`. |
| `404` | Registro inexistente o consulta pública de un registro inactivo. |

Requests acepta solo estudios activos como selecciones de contexto. Los trámites históricos conservan el identificador persistido y se consultan mediante su propia API. Consulta los DTO en Swagger UI (`/api/docs`) y la [carga de datos sintéticos](../README.md#catálogos-de-demostración).
