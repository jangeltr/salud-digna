# Identidad institucional y recuperación entre canales

La API central es la autoridad de datos maestros. Los backends de canal son
responsables de obtener y comprobar la identidad del paciente ante esa
autoridad y de vincularla a su propia sesión autenticada. En la revisión
actual, la API central carece de un contrato de `CUSTOMER_ID` y de una prueba
firmada. El orquestador ya admite el contrato institucional descrito abajo.
El aprovisionamiento local de fixtures sigue disponible para las rutas
previas de demostración. La recuperación automática exige una afirmación
de la autoridad central. El orquestador valida la firma localmente.

## Contrato mínimo de la API central

La ruta emisora queda pendiente en la API central. Un contrato mínimo
propuesto es `POST /api/v1/auth/patient-assertions`. Debe autenticar al
backend solicitante, derivar su código de canal registrado y aceptar solo
una sesión o evidencia verificable de identidad y de autorización para la
atención. La autoridad determina el `CUSTOMER_ID` desde sus datos maestros.
Un identificador aportado por sí solo carece de valor probatorio. En Call
Center, la autorización debe cubrir tanto al asesor autenticado como al
paciente de la atención. Un rol de asesor por sí solo es insuficiente.

Ante éxito, la API devuelve `{"assertion":"<JWS>"}` al backend y usa
`Cache-Control: no-store`. Firma un JWS compacto con Ed25519 y cabecera
`{"alg":"EdDSA","typ":"sd-patient+jwt"}`. Ejemplo de claims:

```json
{
  "iss": "https://api.salud-digna.app",
  "aud": "https://orchestrator.salud-digna.app",
  "channel": "demo-web",
  "scope": "journeys:patient",
  "customerId": "CUSTOMER-DEMO-001",
  "sub": "sesion-verificada-001",
  "jti": "evidencia-opaca-001",
  "iat": 1795500000,
  "exp": 1795500300
}
```

`iat` y `exp` son segundos Unix. La afirmación dura como máximo cinco
minutos. `channel` coincide con `Channel.code` en la API key del canal.
`sub` identifica al actor o sesión autorizada y permanece estable al
renovar la acreditación de esa sesión. `jti` es una referencia opaca única
de evidencia. `customerId`, `sub` y `jti` admiten entre 1 y 128 caracteres
ASCII, empiezan con un alfanumérico y admiten punto, guion, guion bajo o
dos puntos en el resto. `customerId` distingue mayúsculas y minúsculas.

Configura la clave **pública** Ed25519 en PEM SPKI en
`ORCHESTRATOR_CENTRAL_ASSERTION_PUBLIC_KEY`. La clave privada solo existe
en la API central. El HMAC de búsqueda usa
`ORCHESTRATOR_PATIENT_IDENTITY_KEY` dentro del orquestador. Los canales
reciben el JWS y lo envían en `X-Patient-Assertion`; no reciben ninguna
clave de firma. El JWS está firmado y su contenido es legible. Conserva la
afirmación y los permisos solo en el backend y exclúyelos de los logs.

## Recuperación automática

| Operación | Autorización y resultado |
| --- | --- |
| `POST /api/v1/journeys` | Conserva `Idempotency-Key` y el cuerpo `{"type":"APPOINTMENT"}`. Con afirmación central, verifica el vínculo o da de alta el sujeto por HMAC y lo reutiliza para sus trámites. |
| `GET /api/v1/journeys?active=true` | API key con `JOURNEYS_READ` y afirmación central. Devuelve el mismo formato `{"items":[...]}`, filtrado a `DRAFT`, `IN_PROGRESS` y `PENDING_CONFIRMATION`. |
| `POST /api/v1/journeys/:journeyId/access-grants` | API key con `JOURNEYS_READ`, afirmación central y petición sin cuerpo. Devuelve `201` con `journeyId`, `grant` y `grantExpiresAt` si el trámite está activo y pertenece al sujeto acreditado. |

El permiso incluye `READ_JOURNEY` y, si la API key tiene
`EVENTS_PUBLISH`, también `PUBLISH_EVENT`. Vence a más tardar con la
afirmación que lo autorizó. Usa el permiso devuelto en `X-Journey-Grant`
para consultar contexto e historial o publicar. Los contratos de eventos,
incluidos `expectedVersion` y `externalEventId`, siguen vigentes.

Las afirmaciones inválidas, vencidas o ajenas y los trámites inaccesibles
devuelven `404`. Una identidad central aún sin vínculo también devuelve
`404` al listar o solicitar un permiso; su primera creación identificada
establece el vínculo. El espacio de nombres central
`salud-digna:central-customer:v1` está separado del de fixtures. Los
trámites provisionales y de fixtures anteriores quedan fuera de la
recuperación institucional. Para la demo Web → Call Center, crea primero
el trámite en Web con una afirmación central y solicita otra para la
sesión de Call Center. Los [códigos de continuidad](continuity-codes.md)
siguen disponibles.

## Aprovisionamiento local de fixtures

Configura `ORCHESTRATOR_PATIENT_IDENTITY_KEY` en el entorno privado del
orquestador y del operador local. Debe contener 32 bytes aleatorios
codificados en base64url sin relleno. Mantén la misma clave para las
referencias persistidas. Su rotación requiere un plan de reverificación y
reindexación. Los backends de canal reciben afirmaciones, sin acceso a la
clave de firma. La función de identidad rechaza su uso si la clave no está
configurada.

El operador comprueba el fixture ficticio, la correspondencia institucional
y el derecho de la sesión del canal a descubrir y crear trámites para ese
paciente. Después de compilar, puede ejecutar el script
`auth:provision-demo-patient` del paquete. Para recibir solo la afirmación en
un archivo privado, usa el ejecutable directamente. Este ejemplo usa datos
ficticios:

```sh
assertion_file="$(mktemp)" &&
printf '%s\n' CUSTOMER-DEMO-001 |
  node apps/orchestrator/dist/journeys/provision-demo-patient.js \
    --channel demo-web --actor demo-web-session --verification-ref fixture-001 > "$assertion_file"
```

La CLI usa exclusivamente la base local del orquestador. Recibe por stdin
el identificador ficticio de 1 a 128 caracteres alfanuméricos ASCII, con
posibilidad de punto, guion, guion bajo o dos puntos después del primer
carácter. Conserva mayúsculas y minúsculas. El espacio de nombres fijo es
`salud-digna:institutional-customer`. Solo se persiste su HMAC SHA-256
como referencia de búsqueda. La vinculación registra una referencia de
evidencia opaca, sin documentos, tokens o datos personales. La restricción
única de identificadores verificados resuelve el alta concurrente; la
transacción perdedora revierte su sujeto provisional.

Para autorizar a Call Center, repite la verificación del actor o sesión
receptora y usa el mismo fixture con el código del canal de Call Center y
su propia referencia de sesión. Se reutiliza la identidad verificada y se
emite una afirmación diferente, ligada a ese canal y sesión. La afirmación
vence en cinco minutos. El backend debe guardarla vinculada a la sesión y
excluirla de los registros. La CLI requiere intervención explícita para un
vínculo. Las asociaciones pendientes, revocadas o vencidas se rechazan.

## Contrato HTTP

| Operación | Autorización adicional de identidad | Resultado |
| --- | --- | --- |
| `GET /api/v1/journeys` | API key con `JOURNEYS_READ` y encabezado `X-Patient-Assertion` válido | `200` con `{"items":[...]}`. Cada elemento incluye `id`, `type`, `status`, `createdAt` y `updatedAt`. Devuelve hasta los 100 más recientes, ordenados por actualización e ID descendentes. |
| `POST /api/v1/journeys` | API key con `EVENTS_PUBLISH`, `Idempotency-Key` y, para una creación identificada, `X-Patient-Assertion` válido | El [contrato de creación](journey-writes.md) conserva su cuerpo `{"type":"APPOINTMENT"}` y su respuesta. Si se omite la afirmación, la creación sigue siendo provisional. |

El listado y la creación identificada validan la firma, el canal, la
caducidad y la asociación `CUSTOMER_ID` verificada y vigente. Una afirmación
inválida, ajena o sin correspondencia válida produce `404`. Una afirmación
inválida en la creación nunca se convierte en una creación provisional.
Un identificador enviado por JSON o query no autoriza ninguna operación.
En una creación identificada, los reintentos de la misma clave deben
acreditar al mismo sujeto y actor, aunque se renueve la afirmación. Los
trámites provisionales existentes carecen de vinculación retrospectiva.

El listado autoriza únicamente el descubrimiento de resúmenes del sujeto.
Para continuar un trámite en otro canal, el canal de origen puede emitir
un [código de continuidad](continuity-codes.md) sobre esa atención. En la
demo, un operador también puede aprovisionar un permiso independiente con la
[CLI de permisos](../README.md#permisos-de-demostración-para-hackatec),
usando el UUID de la lista, el canal receptor, su actor y las operaciones
necesarias. Contexto, historial y publicación mantienen los scopes y
`X-Journey-Grant` existentes. La afirmación no sustituye ese permiso.
Para operar sin códigos, usa el contrato institucional de recuperación.
