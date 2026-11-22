# API de conversaciones

`POST /api/v1/conversations/dev/message` simula el canal WhatsApp para un paciente autenticado. El controlador solo se registra si `NODE_ENV=development` y `CONVERSATION_SIMULATOR_ENABLED=true`. El valor del ejemplo de entorno es `false`. Después de realizar el cambio local, reinicia la API. Swagger UI incluye la ruta cuando está habilitada.

Envía `Authorization: Bearer <jwt>` de una cuenta activa con rol `PATIENT` y perfil asociado. El servidor obtiene el paciente de la sesión. El cuerpo admite `message` de 1 a 500 caracteres, `requestId` como UUID opcional, `version` como entero positivo y `action` como selección estructurada opcional. Campos como `patientId`, `externalId` o `channel` se rechazan.

## Mensajes e intenciones

| Intención | Ejemplo o acción | Resultado |
| --- | --- | --- |
| `GREETING` | «Hola» | Saluda y ofrece continuar si hay un trámite. |
| `RESUME_REQUEST` | «Quiero continuar mi solicitud» | Recupera el paso persistido. |
| `REQUEST_STATUS` | «¿Cuál es el estado de mi solicitud?» | Indica el estado y el siguiente paso. |
| `SELECT_STUDY` | «Quiero elegir un estudio» | Ofrece estudios activos. |
| `SELECT_CLINIC` | «Quiero elegir una clínica» | Ofrece clínicas activas cuando hay estudio seleccionado. |
| `SELECT_DATETIME` | «Quiero indicar un horario» | Solicita una fecha propuesta cuando hay clínica. |
| `APPOINTMENT_STATUS` | «¿Cuál es el estado de mi cita?» | Consulta la cita asociada. |
| `HELP` | «Ayuda» | Orienta sobre las opciones para continuar. |
| `TALK_TO_ADVISOR` | «Quiero hablar con un asesor» | Ofrece solicitar una referencia por la API de Call Center. |
| `UNKNOWN` | Mensaje sin coincidencia | Ofrece ayuda y recupera el paso si hay una solicitud seleccionada. |

Si se envía `requestId`, debe pertenecer al paciente. Sin ID, el orquestador continúa una única solicitud abierta. Si hay varias, devuelve opciones `SELECT_REQUEST` sin elegir por el paciente. Envía nuevamente el mensaje con el `requestId` elegido. Se muestran hasta cinco alternativas por mensaje. `LIST_REQUESTS` dirige al listado completo si hay más. Las consultas de citas con varias coincidencias también piden elegir la solicitud.

Ejemplo de recuperación.

```json
{ "message": "Quiero continuar mi solicitud" }
```

```json
{
  "reply": "Recuperé el avance de tu solicitud. El siguiente paso es elegir un estudio.",
  "intent": "RESUME_REQUEST",
  "requestId": "00000000-0000-4000-8000-000000000001",
  "currentStep": "SELECT_STUDY",
  "requestStatus": "DRAFT",
  "version": 1,
  "suggestedActions": [
    {
      "type": "SELECT_STUDY",
      "label": "Demo Glucosa",
      "value": "00000000-0000-4000-8000-000000000201",
      "requestId": "00000000-0000-4000-8000-000000000001"
    }
  ]
}
```

La respuesta HTTP `200` incluye `reply`, `intent`, `requestId`, `currentStep`, `requestStatus` y `version`. Los cuatro campos de la solicitud son `null` cuando aún debe seleccionarse una. `suggestedActions` se omite cuando no se requieren acciones.

## Guardar una selección

El texto se clasifica para orientar. Para escribir el contexto se requiere una selección explícita, un ID de solicitud y su versión vigente. La acción admite `SELECT_STUDY` o `SELECT_CLINIC` con un UUID de catálogo, o `SELECT_DATETIME` con una fecha ISO 8601 con zona horaria. La fecha es una preferencia de demostración. La disponibilidad real se comprobará en un flujo posterior.

```json
{
  "message": "Elijo este estudio",
  "requestId": "00000000-0000-4000-8000-000000000001",
  "version": 1,
  "action": {
    "type": "SELECT_STUDY",
    "value": "00000000-0000-4000-8000-000000000201"
  }
}
```

Se reutilizan el DTO, el control de versión y la transacción de Requests. Para leer el estado después de guardar, consulta con `{"message":"¿Cuál es el estado de mi solicitud?","requestId":"00000000-0000-4000-8000-000000000001"}`. Para solicitar asistencia, usa «Quiero hablar con un asesor» con el ID elegido y sigue el [flujo de referencia](api-call-center.md).

| Código | Motivo |
| --- | --- |
| `400` | DTO inválido, acción sin ID o versión, selección inválida o campos adicionales. |
| `401` | Falta un JWT válido de una cuenta activa. |
| `403` | Falta el rol `PATIENT` o un perfil de paciente asociado. |
| `404` | Ruta deshabilitada o solicitud inexistente o ajena. |
| `409` | Solicitud cerrada o versión desactualizada de una selección. Recupera el estado y envía una nueva acción explícita si corresponde. |

## Persistencia e integraciones

Las solicitudes, el contexto y las citas se leen desde los servicios que ya los gestionan. Las interacciones registran el canal lógico `WHATSAPP`, el actor, la intención y un resultado como `CONVERSATION_SIMULATED_SELECT_STUDY_UPDATED`. Los mensajes y las respuestas completas se omiten. Para las escrituras, Requests registra la interacción y sus eventos en la misma transacción. `payload.simulated: true` distingue estos eventos en Journey. El simulador conserva `lastChannel` como último canal real, y deja intacta la verificación de identidades.

La interfaz interna `WhatsAppAdapter` define recepción verificada y entrega de respuestas. Un adaptador real deberá autenticar el webhook, deduplicar por ID del proveedor, normalizar el remitente y acreditar su identidad vinculada antes de operar. La ruta de desarrollo funciona exclusivamente con la sesión del paciente y puede probarse sin vincular un teléfono.

La [integración opcional con OpenAI](integrations/openai.md) usa el mismo contrato REST. Puede proponer una intención o dar prioridad a una opción real del catálogo. Ante una fecha ambigua solicita aclaración, y una fecha explícita puede aparecer como sugerencia para que el paciente la envíe en una acción estructurada. Las escrituras siguen sujetas a identidad, autorización, selección explícita y versión.
