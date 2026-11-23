# Integración de WhatsApp

Meta y Twilio funcionan independientemente del simulador de conversaciones. El webhook del proveedor activo verifica la entrega, normaliza el mensaje de texto y lo guarda antes de devolver HTTP 200. El procesador comparte la vinculación y ConversationModule, y envía por el proveedor que recibió el mensaje. La clasificación de OpenAI, cuando está activada, usa el mismo proveedor y filtrado ya configurados en conversaciones.

## Configuración

Configura `apps/api/.env` de forma privada y reinicia la API. Con `WHATSAPP_ENABLED=false` se omiten las rutas y el procesador. Al habilitarla se validan únicamente las variables del proveedor seleccionado. Un valor explícito de proveedor inválido o una configuración requerida incompleta impiden arrancar con un error de configuración. Cambia el proveedor y reinicia la API compilada para cambiar de integración.

| Variable | Uso |
| --- | --- |
| `WHATSAPP_ENABLED` | `false` por defecto. Usa `true` para activar el módulo. |
| `WHATSAPP_PROVIDER` | `meta` o `twilio`. Si falta, se usa `meta`. |
| `WHATSAPP_VERIFY_TOKEN` | Valor privado compartido con Meta para verificar el callback GET. |
| `WHATSAPP_APP_SECRET` | Secreto de la aplicación Meta para comprobar HMAC-SHA256. |
| `WHATSAPP_ACCESS_TOKEN` | Token Bearer autorizado para enviar mensajes desde el número. |
| `WHATSAPP_PHONE_NUMBER_ID` | Identificador numérico del número Business, distinto del teléfono visible. |
| `WHATSAPP_GRAPH_API_VERSION` | Versión soportada por Meta. El ejemplo usa `v25.0`. |

Consulta el calendario de soporte antes de elegir o actualizar la versión. [Versiones de Graph API](https://developers.facebook.com/docs/graph-api/changelog/versions/)

Las variables `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` y `WHATSAPP_GRAPH_API_VERSION` corresponden únicamente a Meta.

## Webhook de Meta

| Método y ruta | Comportamiento |
| --- | --- |
| `GET /api/v1/webhooks/whatsapp` | Verifica `hub.mode=subscribe`, `hub.verify_token` y un `hub.challenge` numérico. Devuelve `200` con el challenge original como texto plano o `403`. |
| `POST /api/v1/webhooks/whatsapp` | Comprueba `X-Hub-Signature-256` sobre los bytes originales antes de decodificar JSON. Devuelve `200` tras persistir los mensajes admitidos, `401` para firma inválida o ausente, `400` para JSON autenticado inválido y `413` cuando el cuerpo supera 256 KiB. |

Se aceptan mensajes de texto de hasta 500 caracteres dirigidos al `metadata.phone_number_id` configurado. Las notificaciones de estado, tipos desconocidos, remitentes no numéricos y entradas mal formadas se omiten. Un fallo de persistencia devuelve error para permitir la redelivery. Evita registrar la URL completa de verificación GET en proxies u observabilidad, porque su query contiene el token. [Verificación de webhooks de Meta](https://developers.facebook.com/docs/graph-api/webhooks/getting-started/)

## Identidad y conversación

El número firmado por Meta acredita de dónde proviene el mensaje. Para acceder a datos de un paciente se requiere además una identidad real vinculada y una cuenta activa. Si falta el vínculo, el adaptador envía instrucciones generales.

El paciente solicita un desafío para `WHATSAPP` desde la API de identidad con su JWT y envía `vincular <linkId> <code>` en el chat. La bandeja guarda el hash del código. IdentityModule aplica el vencimiento y límite de intentos, consume el desafío en una transacción y vincula el remitente con el paciente existente. Las identidades simuladas quedan fuera de este flujo. [Contrato de identidad](../api-identity.md)

Una vez vinculado, el paciente puede escribir «Continuar mi solicitud». Si hay varias, elige con `solicitud <requestId>`. Las sugerencias pueden incluir `seleccionar estudio|clinica|fecha <requestId> <version> <valor>`. El valor es un UUID de catálogo o una fecha ISO 8601 explícita con zona. Las selecciones usan RequestsService con sus controles de propiedad y versión. Ante un conflicto, consulta el estado actual antes de reenviar una selección. El texto conversacional por sí solo orienta al usuario.

## Persistencia y recuperación

Aplica la migración versionada de `WhatsAppInbox` con `pnpm --filter @salud-digna/api prisma:migrate:deploy` en el entorno autorizado. La clave primaria combina proveedor e ID del mensaje (`wamid` en Meta y `MessageSid` en Twilio). La migración asigna `META` a las filas anteriores y conserva sus datos. Cada trabajador toma solo mensajes del proveedor y número configurados. Si cambias de proveedor con mensajes pendientes, puedes volver a la configuración anterior para drenarlos. Las redeliveries del mismo proveedor e ID se omiten aunque el mensaje haya fallado, para evitar repetir acciones, eventos y consumo de OpenAI.

El procesador local persiste la respuesta preparada antes de enviarla. Reanuda entradas `PENDING` y respuestas `READY` tras un reinicio. Una preparación interrumpida pasa a `FAILED` al vencer su reserva de dos minutos porque podría haber aplicado una acción sin haber guardado la respuesta. El usuario puede consultar el estado y continuar con un nuevo mensaje. El envío con Meta admite hasta tres intentos con espera incremental ante errores transitorios. Un envío de Meta interrumpido se vuelve a intentar con la respuesta preparada. Si Meta aceptó el envío y el proceso falló antes de guardar su resultado, podría entregarse una respuesta repetida. Con Twilio se reintenta únicamente un rechazo HTTP 429, respetando `Retry-After` cuando indica segundos. Un timeout, una respuesta ambigua o un envío interrumpido quedan en `FAILED` para revisión sin repetir el POST.

La bandeja conserva el texto entrante mientras se prepara la respuesta y el remitente mientras está pendiente el envío. Borra esos datos al terminar sus respectivas etapas o al fallar. Los estados terminales conservan IDs de proveedor y una categoría de error para diagnóstico. Para recuperar un fallo terminal, corrige la causa y solicita un nuevo mensaje; el mismo ID conserva su deduplicación. Los logs de la integración omiten texto, teléfono y credenciales.

## Conexión futura en Meta Developers

Cuando se autorice la configuración externa, prepara una aplicación Meta con WhatsApp, una cuenta Business y un número registrado. Asigna a la credencial solo permisos necesarios para enviar desde ese número, configura un callback HTTPS accesible con la ruta anterior y suscríbelo al campo `messages`. Usa el mismo token de verificación en la aplicación y el backend, y valida el flujo con el número de prueba antes de habilitarlo para pacientes. [Guía de WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/overview)

El cliente hace POST a `/{version}/{phoneNumberId}/messages` en Graph API. Envía únicamente respuestas de texto a mensajes entrantes dentro de una ventana conservadora de 24 horas contada a partir del mensaje. Meta puede restringir el envío según el estado de su ventana de atención. Las plantillas, campañas, varios números por instancia, métricas de entrega final y el reproceso de fallos terminales quedan fuera del MVP.


## Twilio Programmable Messaging

| Variable | Uso |
| --- | --- |
| `TWILIO_ACCOUNT_SID` | SID de la cuenta que recibe y envía los mensajes. |
| `TWILIO_AUTH_TOKEN` | Auth Token privado de esa cuenta para la firma entrante y la autenticación del cliente HTTP. |
| `TWILIO_WHATSAPP_FROM` | Remitente habilitado de Twilio en formato `whatsapp:+<número E.164>`. |
| `TWILIO_WEBHOOK_URL` | URL HTTPS pública exacta del callback, por ejemplo `https://api.example.test/api/v1/webhooks/twilio/whatsapp`. |

- `POST /api/v1/webhooks/twilio/whatsapp` acepta `application/x-www-form-urlencoded` hasta 256 KiB y devuelve TwiML vacío con HTTP 200 tras guardar el mensaje. Responde `401` si falla la firma y `415` si el formato no es el esperado. Se validan el SID de cuenta, destino y remitente. Se omiten notificaciones de entrega, medios y mensajes fuera del límite de texto. Twilio no incluye un timestamp en el callback entrante habitual, por lo que se registra la hora de recepción local. [Parámetros entrantes](https://www.twilio.com/docs/messaging/guides/webhook-request) · [Marca temporal](https://help.twilio.com/articles/46569585455003)
- La firma `X-Twilio-Signature` usa el Auth Token y HMAC-SHA1 sobre la URL pública exacta y todos los campos del formulario ordenados. La comparación se hace en tiempo constante. Detrás de Nginx la URL configurada identifica el HTTPS público. Conserva la ruta y la query tal como las envía Twilio, sin reescrituras ni redirecciones. La API prescinde de `Host` y `X-Forwarded-*` para reconstruir la URL firmada. [Validación oficial de Twilio](https://www.twilio.com/docs/usage/security)
- La respuesta sale por el recurso `Messages.json` de Programmable Messaging con `From`, `To` y `Body`. Un SID aceptado confirma la recepción por Twilio, y la entrega final sigue fuera de este alcance. [Messages API](https://www.twilio.com/docs/messaging/api/message-resource)

### Activar WhatsApp Sandbox cuando la cuenta esté disponible

1. En la consola clásica de Twilio, abre **Try WhatsApp**, acepta las condiciones del Sandbox y registra el número Sandbox como `TWILIO_WHATSAPP_FROM`.
2. Configura `WHATSAPP_ENABLED=true`, `WHATSAPP_PROVIDER=twilio` y las cuatro variables de Twilio en la configuración privada. Aplica antes la migración en el entorno autorizado y reinicia el backend.
3. En **Sandbox settings → When a message comes in**, configura el método POST con exactamente el valor de `TWILIO_WEBHOOK_URL`. Mantén las notificaciones de estado fuera de esta ruta.
4. Inscribe cada teléfono de prueba con el mensaje `join <código de tu Sandbox>`. Desde el portal solicita el vínculo WhatsApp, canjéalo en el chat y continúa la solicitud con los comandos de arriba. Completa el flujo con la referencia de atención de Call Center.

El Sandbox solo responde a participantes inscritos y se aplican las ventanas de atención de WhatsApp. Las plantillas y el inicio de conversaciones quedan fuera de este incremento. [Guía oficial del Sandbox](https://www.twilio.com/docs/whatsapp/sandbox)

Ejecuta las comprobaciones focalizadas desde la raíz con `pnpm --filter @salud-digna/api test:whatsapp`. Usan datos sintéticos y no requieren una cuenta activa.
