# Continuidad entre canales

Los códigos permiten delegar una atención concreta entre backends
autenticados. Son credenciales portadoras de un solo uso. Acreditan
autorización para continuar el trámite y carecen de valor como prueba de
identidad del paciente o acceso clínico.

## Emitir un código

`POST /api/v1/journeys/:journeyId/continuity-codes` requiere
`Authorization: Bearer <keyId>.<secret>` con `JOURNEYS_READ` y
`EVENTS_PUBLISH`, y `X-Journey-Grant: <permiso>` del mismo canal y trámite
con `READ_JOURNEY` y `PUBLISH_EVENT`. La petición se envía sin cuerpo.
Devuelve `201 Created` con `Cache-Control: no-store`:

```json
{
  "code": "7J4M-3RXP-9C2W",
  "expiresAt": "2026-11-24T08:29:00.000Z"
}
```

El valor de ejemplo es ficticio. El código real contiene 12 caracteres
Base32 generados criptográficamente y se entrega una vez. Vence a los cinco
minutos como máximo y nunca después del permiso de origen. Si la emisión
se pierde, solicita otro con el permiso vigente. Cada código válido queda
activo hasta su consumo o vencimiento.

## Canjear el código

`POST /api/v1/continuity-codes/redeem` requiere la API key del backend
receptor con `JOURNEYS_READ`. Envía `Content-Type: application/json`:

```json
{"code":"7J4M-3RXP-9C2W"}
```

Se acepta el formato agrupado o sin guiones, en mayúsculas o minúsculas.
Devuelve `201 Created` con `Cache-Control: no-store`:

```json
{
  "journeyId": "00000000-0000-4000-8000-000000000001",
  "grant": "<permiso-opaco>",
  "grantExpiresAt": "2026-11-24T08:30:00.000Z"
}
```

El permiso nuevo dura cinco minutos desde el canje y queda asociado al
canal autenticado, al trámite y a una referencia de continuidad propia.
Contiene `READ_JOURNEY` y `PUBLISH_EVENT`. Los endpoints de negocio siguen
comprobando los scopes de la API key. El canal emisor no puede canjear sus
propios códigos. Cualquier otro canal con la credencial y el scope exigidos
puede canjear un código que reciba, así que compártelo solo con el receptor.
Si se pierde la respuesta del canje, el código queda consumido y se necesita
otro código.

## Web → WhatsApp → Call Center

1. Web conserva temporalmente el UUID y el permiso de creación en la sesión
   autenticada. Emite un código y lo muestra al paciente.
2. WhatsApp canjea el código desde su backend. Guarda el UUID y el permiso
   en su propia sesión y usa `X-Journey-Grant` para contexto y eventos.
   Con sus dos scopes, puede emitir otro código para Call Center.
3. Call Center canjea el segundo código con su API key y su backend conserva
   el UUID y permiso durante la atención. Usa su propio permiso para leer
   contexto e historial.

Excluye códigos, permisos y credenciales de logs, métricas y trazas.
Elimina los valores temporales cuando caduquen. El orquestador guarda
solo el HMAC-SHA-256 del código y audita la emisión y el canje sin secretos.
Configura `ORCHESTRATOR_CONTINUITY_HMAC_KEY` en el entorno privado del
orquestador con 32 bytes aleatorios en base64url sin relleno. Una rotación
invalida los códigos pendientes. Los backends de canal conservan sus
propias API keys y carecen de acceso a esta clave.

## Errores

- `400` indica cuerpo o formato inválido.
- `401` indica una API key ausente o inválida y `403`, un scope insuficiente.
- `404` cubre autorización de origen insuficiente y códigos desconocidos,
  caducados, ya utilizados o emitidos por el propio canal. Si caducó el
  permiso de origen o fue revocado antes del canje, solicita una continuidad
  nueva desde un permiso vigente.
- `429` limita el canje a 10 intentos por minuto y canal autenticado. Espera
  un minuto antes de volver a intentar. El contador del MVP vive en memoria
  de cada instancia.
- `503` indica que la función no está disponible, por ejemplo si falta la
  clave HMAC.
