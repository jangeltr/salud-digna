# Identidad ficticia y recuperación entre canales

La API central es la autoridad de datos maestros. Los backends de canal son
responsables de obtener y comprobar la identidad del paciente ante esa
autoridad y de vincularla a su propia sesión autenticada. En la revisión
actual, la API central carece de un contrato de `CUSTOMER_ID` y de una prueba
firmada que el orquestador pueda verificar. Para Hackatec se usa un fixture
institucional aprobado y una afirmación firmada por un operador local. Esa
afirmación acredita el aprovisionamiento de demo y no es una firma de la API
central. El orquestador carece de conexión a ella.

## Aprovisionamiento local

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
Para continuar un trámite en otro canal, un operador confirma esa atención
y aprovisiona un permiso independiente con la
[CLI de permisos](../README.md#permisos-de-demostración-para-hackatec),
usando el UUID de la lista, el canal receptor, su actor y las operaciones
necesarias. Contexto, historial y publicación mantienen los scopes y
`X-Journey-Grant` existentes. La afirmación no sustituye ese permiso.
La emisión automática y la prueba firmada por la autoridad central quedan
pendientes del contrato entre sistemas.
