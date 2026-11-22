# WhatsApp Cloud API

El adaptador de Meta funciona independientemente del simulador de conversaciones. El webhook verifica la entrega, normaliza mensajes de texto, guarda una entrada durable y responde HTTP 200. Un procesador local realiza la vinculación o delega en ConversationModule y envía la respuesta por Graph API. La clasificación de OpenAI, cuando está activada, usa el mismo proveedor y filtrado ya configurados en conversaciones.

## Configuración

Configura `apps/api/.env` de forma privada y reinicia la API. Con `WHATSAPP_ENABLED=false` se omiten las rutas y el procesador. Al activar la integración, una variable requerida ausente o inválida impide arrancar con un error que indica el nombre de la variable.

| Variable | Uso |
| --- | --- |
| `WHATSAPP_ENABLED` | `false` por defecto. Usa `true` para activar el módulo. |
| `WHATSAPP_VERIFY_TOKEN` | Valor privado compartido con Meta para verificar el callback GET. |
| `WHATSAPP_APP_SECRET` | Secreto de la aplicación Meta para comprobar HMAC-SHA256. |
| `WHATSAPP_ACCESS_TOKEN` | Token Bearer autorizado para enviar mensajes desde el número. |
| `WHATSAPP_PHONE_NUMBER_ID` | Identificador numérico del número Business, distinto del teléfono visible. |
| `WHATSAPP_GRAPH_API_VERSION` | Versión soportada por Meta. El ejemplo usa `v25.0`. |

Consulta el calendario de soporte antes de elegir o actualizar la versión. [Versiones de Graph API](https://developers.facebook.com/docs/graph-api/changelog/versions/)

## Webhook

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

Aplica la migración versionada de `WhatsAppInbox` con `pnpm --filter @salud-digna/api prisma:migrate:deploy` en el entorno autorizado. La clave primaria es el ID del mensaje de Meta. Las redeliveries del mismo ID se omiten aunque el mensaje haya fallado, para evitar repetir acciones, eventos y consumo de OpenAI.

El procesador local persiste la respuesta preparada antes de enviarla. Reanuda entradas `PENDING` y respuestas `READY` tras un reinicio. Una preparación interrumpida pasa a `FAILED` al vencer su reserva de dos minutos porque podría haber aplicado una acción sin haber guardado la respuesta. El usuario puede consultar el estado y continuar con un nuevo mensaje. Para envío se permiten hasta tres intentos con espera incremental ante errores transitorios. Un envío interrumpido se vuelve a intentar con la respuesta preparada. Si Meta aceptó el envío y el proceso falló antes de guardar su resultado, podría entregarse una respuesta repetida.

La bandeja conserva el texto entrante mientras se prepara la respuesta y el remitente mientras está pendiente el envío. Borra esos datos al terminar sus respectivas etapas o al fallar. Los estados terminales conservan IDs de proveedor y una categoría de error para diagnóstico. Para recuperar un fallo terminal, corrige la causa y solicita un nuevo mensaje; el mismo ID conserva su deduplicación. Los logs de la integración omiten texto, teléfono y credenciales.

## Conexión futura en Meta Developers

Cuando se autorice la configuración externa, prepara una aplicación Meta con WhatsApp, una cuenta Business y un número registrado. Asigna a la credencial solo permisos necesarios para enviar desde ese número, configura un callback HTTPS accesible con la ruta anterior y suscríbelo al campo `messages`. Usa el mismo token de verificación en la aplicación y el backend, y valida el flujo con el número de prueba antes de habilitarlo para pacientes. [Guía de WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/overview)

El cliente hace POST a `/{version}/{phoneNumberId}/messages` en Graph API. Envía únicamente respuestas de texto a mensajes entrantes dentro de una ventana conservadora de 24 horas contada a partir del mensaje. Meta puede restringir el envío según el estado de su ventana de atención. Las plantillas, campañas, varios números por instancia, métricas de entrega final y el reproceso de fallos terminales quedan fuera del MVP.
