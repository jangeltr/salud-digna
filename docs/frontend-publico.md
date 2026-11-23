# Frontend público y móvil

Usa `https://api.salud-digna.app/api/v1` como URL base. Las rutas abreviadas de esta guía son relativas a esa base. El [contrato OpenAPI](openapi.json) conserva el prefijo `/api/v1` en cada ruta y define el origen sin ese prefijo. Todos los ejemplos usan datos sintéticos.

## Cuenta e identidad

- `POST /auth/register` crea la cuenta y el perfil `PATIENT` y devuelve `201`. Los campos requeridos son `firstName`, `lastName`, `email` y `password` de 12 a 128 caracteres. `phone` es opcional. El registro devuelve la cuenta y el perfil. Luego usa `POST /auth/login` para obtener el JWT.
- `POST /auth/login` recibe `email` y `password`. Envía `Authorization: Bearer <accessToken>` en las rutas protegidas. `GET /auth/me` devuelve el rol, el estado y el perfil asociado. Ante vencimiento, vuelve a iniciar sesión. El flujo actual carece de refresh token y verificación por correo.
- `GET /identity` lista las identidades de la cuenta. `POST /identity/links` emite un desafío con vencimiento de cinco minutos. El perfil del paciente y el identificador de la cuenta son distintos. El campo `phone` del registro por sí solo carece de efecto sobre la vinculación de WhatsApp. [Autenticación](api-auth.md) · [Identidad](api-identity.md)

Solicitud sintética para `POST /auth/register`. Sustituye el marcador de contraseña por un valor elegido para la prueba.

```json
{"firstName":"Alex","lastName":"Ejemplo","email":"paciente@example.test","password":"<contraseña sintética elegida>"}
```

Respuesta sintética de `POST /auth/login`.

```json
{
  "accessToken": "<JWT devuelto por la API>",
  "tokenType": "Bearer",
  "expiresIn": 1800,
  "user": {
    "id": "00000000-0000-4000-8000-000000000010",
    "email": "paciente@example.test",
    "role": "PATIENT"
  }
}
```

## Catálogos, solicitudes y citas

| Operación | Uso |
| --- | --- |
| `GET /clinics`, `GET /studies` y sus detalles `/:id` | Catálogos públicos de registros activos. El listado admite `page`, `limit` y `q`. El precio es una cadena decimal como `"120.00"`. |
| `POST /requests` | Crea la solicitud con `{}` o `{"type":"APPOINTMENT"}`. Devuelve `201`. |
| `GET /requests`, `GET /requests/pending`, `GET /requests/:id` | Consulta solicitudes propias. El listado general admite filtro `status`. Los listados devuelven `items`, `page`, `limit` y `hasMore`. |
| `PATCH /requests/:id/context` | Guarda selecciones parciales. Envía la `version` de la última respuesta. |
| `POST /requests/:id/pause` y `POST /requests/:id/resume` | Registran actividad y preservan el contexto. Ambos reciben `version`. |
| `POST /requests/:id/confirm` | Confirma una solicitud lista con `{"version":n}`. Devuelve `200` con la cita. Un reintento compatible recupera la misma cita. |
| `GET /appointments`, `GET /appointments/upcoming`, `GET /appointments/:id` | Consulta citas propias. Las próximas incluyen únicamente citas confirmadas y futuras. |
| `GET /requests/:id/journey` | Consulta la línea de tiempo de una solicitud propia. |

Petición de ejemplo para `PATCH /requests/:id/context`. Obtén los UUID de los catálogos y usa una fecha futura al probar.

```json
{
  "version": 1,
  "studyId": "00000000-0000-4000-8000-000000000201",
  "clinicId": "00000000-0000-4000-8000-000000000101",
  "scheduledAt": "2099-01-05T10:30:00-06:00"
}
```

Respuesta `200` de ejemplo.

```json
{
  "id": "00000000-0000-4000-8000-000000000001",
  "type": "APPOINTMENT",
  "status": "PENDING_CONFIRMATION",
  "currentStep": "REVIEW",
  "lastChannel": "WEB",
  "version": 2,
  "context": {
    "studyId": "00000000-0000-4000-8000-000000000201",
    "clinicId": "00000000-0000-4000-8000-000000000101",
    "scheduledAt": "2099-01-05T16:30:00.000Z"
  },
  "createdAt": "2026-11-22T19:00:00.000Z",
  "updatedAt": "2026-11-22T19:01:00.000Z",
  "completedAt": null
}
```

El contexto persistido en la API permite retomar el trámite en otra sesión o aplicación. Los campos omitidos se conservan. Cambiar el estudio invalida la clínica y el horario anteriores. Cambiar la clínica invalida el horario. Envía `null` para quitar `scheduledAt` o `notes`. El servidor decide el paso y el estado.

| Estado | Cómo mostrarlo |
| --- | --- |
| `DRAFT` | Falta estudio. Paso `SELECT_STUDY`. |
| `IN_PROGRESS` | Falta clínica u horario. Paso `SELECT_CLINIC` o `SELECT_DATETIME`. |
| `PENDING_CONFIRMATION` | Selecciones listas para revisar y confirmar. Paso `REVIEW`. |
| `COMPLETED` | Cita confirmada. Paso `CONFIRMED`. |
| `CANCELLED` | Solicitud cerrada. |

Los horarios son demostrativos. Carecen de verificación de disponibilidad real. El frontend tampoco dispone de operaciones de cancelación o reprogramación de citas. [Solicitudes](api-requests.md) · [Citas](api-appointments.md) · [Clínicas](api-clinics.md) · [Estudios](api-studies.md)

## Demostración Web → WhatsApp → Call Center

1. Registra un paciente sintético, inicia sesión, crea la solicitud y guarda un estudio desde Web. Conserva su `id`.
2. Solicita `POST /identity/links` con `{"provider":"WHATSAPP"}`. Desde el número de prueba envía `vincular <linkId> <code>` al remitente configurado, usando los valores que devolvió la API.
3. Escribe «Continuar mi solicitud» en WhatsApp y elige la solicitud si tienes varias. Sigue las opciones de texto para completar clínica y fecha. Al volver a Web, recarga `GET /requests/:id` para ver el estado y versión persistidos.
4. Desde Web solicita `POST /requests/:id/assistance-code` sin cuerpo y entrega el código al asesor. Tras la confirmación asistida, revisa `GET /appointments/upcoming` y `GET /requests/:id/journey`.

El recorrido de WhatsApp requiere un proveedor Meta o Twilio configurado y un número de prueba habilitado. El asistente interpreta texto y devuelve sugerencias. Las escrituras pasan por una selección explícita validada por el backend. Para desarrollo existe `POST /conversations/dev/message`, con JWT de paciente, `NODE_ENV=development` y habilitación explícita. La ruta carece de uso en producción y la API carece de un chat público de IA para la web. OpenAI es opcional y el adaptador usa reglas locales como alternativa. [Conversaciones](api-conversations.md) · [Configuración de WhatsApp](integrations/whatsapp.md)

## Manejo de errores

Usa el código HTTP como criterio principal. Con `400`, presenta la validación y corrige el cuerpo o parámetro. Con `401`, vuelve a iniciar sesión. Con `403`, informa la falta de permiso. Con `404`, muestra un recurso no disponible sin inferir a quién pertenece. Con `409` por versión, vuelve a consultar la solicitud y pide validar la acción antes de reenviarla. Registro duplicado también devuelve `409`. Cuando recibas `429`, espera el intervalo indicado por `Retry-After`. El campo `message` de NestJS puede ser una cadena o una lista de mensajes de validación.
