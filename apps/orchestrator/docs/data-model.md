# Modelo de datos del orquestador

El esquema cubre identidad, continuidad de trámites y auditoría para la demo.
Todas las claves foráneas pertenecen a PostgreSQL del orquestador. Las referencias
a pacientes, citas o catálogos externos son opacas. Los canales consumen APIs
y el orquestador trabaja con datos verificados que recibe de ellos. Los flujos
descritos aquí son reglas para la implementación posterior.

## Entidades e índices

| Entidad | Persistencia y relaciones |
| --- | --- |
| `PatientSubject` | UUID interno y fecha de alta. Puede existir antes de verificar un identificador y tener varios trámites abiertos a la vez. |
| `PatientIdentifier` | Tipo, espacio de nombres, huella, canal de origen y datos mínimos de verificación, vigencia y revocación. La clave por sujeto, tipo, espacio y huella hace repetible el alta de la asociación. El índice único por tipo, espacio y huella verificada reserva una sola asociación efectiva. PostgreSQL permite varias huellas verificadas nulas bajo esa restricción. |
| `Channel` | Código único e identificador interno estable para cada integración o productor autenticado. Dos sistemas que comparten medio de comunicación pueden tener códigos propios. `isActive` controla la aceptación de nuevas operaciones en la aplicación. |
| `Journey` | Sujeto, tipo de trámite, estado y fechas operativas. El índice por sujeto, actualización e ID soporta listados por sujeto, sin restringir el número de trámites simultáneos. |
| `JourneyContext` | Una fila por trámite mediante clave primaria y foránea compartida. Contiene el paso, una versión desde 1 y referencias externas JSONB. Cada tipo de trámite define las claves y formatos permitidos. |
| `JourneyEvent` | Evento de un trámite, con productor, identificador externo, tipo, versión de esquema, fecha de ocurrencia, fecha de recepción y payload JSONB. La clave única `(producerId, externalEventId)` deduplica en todos los trámites. El índice `(journeyId, occurredAt, id)` permite paginar el historial. |
| `AccessAudit` | Acción, resultado, fecha, código de motivo y, cuando se conocen, canal, actor opaco, sujeto y trámite. Los índices por trámite, sujeto y canal permiten ordenar por fecha e ID. Las referencias opcionales permiten registrar rechazos aun cuando el actor o recurso no se haya resuelto. |
| `ChannelCredential` | UUID público `keyId`, digest del secreto, scopes y ciclo de vida. La FK y el índice por canal permiten administrar varias credenciales por integración. |
| `JourneyAccessGrant` | UUID interno, digest único, referencia opaca del actor o sesión, operaciones y vigencia obligatoria. Tiene FK a canal y trámite. Los índices por canal, trámite y vencimiento y por trámite permiten ubicar permisos para revisión o revocación. |

Las relaciones usan borrado restrictivo. Desactivar un canal o revocar una
asociación preserva las referencias históricas. Si una auditoría identifica tanto
trámite como sujeto, la aplicación deriva el sujeto del trámite. La auditoría
registra códigos controlados y referencias opacas. El contexto, los eventos y
la auditoría excluyen contraseñas, credenciales, valores y huellas de CURP,
RFC y NSS, historiales clínicos y datos maestros completos. Los campos libres
de productores quedan excluidos de la auditoría.

## Autenticación de canal y autorización por trámite

`ChannelCredential` guarda en `secretDigest` solo el SHA-256 de los 32 bytes
aleatorios del secreto. El identificador público permite localizar la fila
para comparar el digest en tiempo constante. Un canal activo puede tener
varias credenciales. La rotación emite una nueva, permite un solapamiento
controlado y revoca la anterior. El secreto original se entrega al backend
del canal y se conserva en su almacén de secretos.

`JourneyAccessGrant` guarda en `digest` solo el SHA-256 de un permiso opaco
de 32 bytes aleatorios. El índice único permite buscar por digest. Cada fila
requiere un trámite concreto, un canal concreto y un `actorRef` opaco derivado
de una verificación autorizada. La referencia identifica al actor o su sesión
en el ámbito del canal. El backend debe vincular el permiso a esa atención;
la referencia no se obtiene de un campo libre de la petición. Un canal
distinto necesita una verificación y un permiso propios. Para sustituir un
permiso se emite otro y se revoca el anterior. Rotar la clave de un canal
conserva los permisos del canal. Si también se exponen permisos, se revocan
por separado.

| Scope de canal | Operación requerida en el permiso |
| --- | --- |
| `events:publish` (`EVENTS_PUBLISH`) | `PUBLISH_EVENT` |
| `journeys:read` (`JOURNEYS_READ`) | `READ_JOURNEY` para estado, contexto e historial |

Ambas listas quedan vacías por defecto. El guard de acceso exige el scope
del canal y la operación del permiso. Una expiración se considera vencida
cuando es igual o anterior a la hora actual. Los secretos y digests de
credenciales y permisos quedan excluidos de los logs, las respuestas y la
auditoría. El proxy y los canales deben redactar ambos encabezados.

### Integración con rutas de trámites

Los módulos de consulta y publicación importan `JourneyAccessModule`. En cada
ruta que recibe `:journeyId`, aplicar `@RequireJourneyAccess(READ_JOURNEY)`
para leer, o `@RequireJourneyAccess(PUBLISH_EVENT)` para publicar. El
decorador ejecuta primero la autenticación de canal y después la comprobación
de recurso. El backend envía `Authorization` y `X-Journey-Grant` por HTTPS.
El segundo encabezado contiene el permiso de 32 bytes codificado en
base64url sin relleno. Los errores de autenticación y scope de canal son
`401` y `403`. Un trámite inexistente o cualquier rechazo del permiso de
recurso devuelve el mismo `404`.

Las operaciones usan `request.journeyAccess.journeyId` y el `actorRef`
obtenido del permiso persistido, y el productor se deriva del canal
autenticado. El permiso es portador y el backend del canal debe entregarlo
solo a la atención o sesión que obtuvo la autorización. La
[CLI local de demostración](../README.md#permisos-de-demostración-para-hackatec)
permite aprovisionar permisos para trámites ficticios. La emisión tras
verificar identidad y autorización de pacientes reales queda pendiente.

La existencia del trámite y un permiso vigente habilitan el acceso según
la operación requerida. Las consultas autorizadas pueden incluir trámites
terminales. Las reglas de negocio del futuro publicador controlarán qué
eventos y transiciones se admiten en cada estado. Los servicios que lean o
escriban datos sensibles deberán poder volver a comprobar vigencia y
alcance dentro de la transacción que realiza la operación cuando sea
necesario cubrir una revocación concurrente.

### Migración de credenciales y permisos

Prisma expresa las claves primarias, las FK restrictivas, los índices, la
unicidad del digest del permiso, los enums, las listas vacías por defecto y
la obligatoriedad de `actorRef` y `expiresAt` en el permiso. La migración
[`20261124061840_add_channel_access`](../prisma/migrations/20261124061840_add_channel_access/migration.sql)
agrega las dos tablas de seguridad y sus enums en una transacción.
Las listas aceptan el valor vacío predeterminado y se declaran `NOT NULL`
en el DDL para preservar la denegación por defecto con una forma consistente.
Los `CHECK` de PostgreSQL exigen 32 bytes con
`octet_length` en ambos digests, una referencia de actor con al menos un
carácter no blanco, una expiración posterior a la creación cuando se
especifique y una revocación igual o posterior a la creación cuando exista.
La autenticidad de la prueba, el cálculo SHA-256, la comprobación de vigencia
en cada operación y la autorización combinada corresponden a la aplicación.
El historial inicial queda intacto. El SQL base se obtuvo comparando dos
esquemas Prisma en archivos. El esquema anterior se reconstruyó retirando
los dos modelos nuevos, sus enums y relaciones inversas. Se comprobó que su
DDL desde vacío coincide con el bloque generado por Prisma en la primera
migración. Esta comparación estática no reproduce el historial en PostgreSQL
ni verifica la ejecución de los `CHECK`.

## Identificadores y evidencia

El servicio asigna el espacio de nombres según una política fija por tipo y
emisor. Por ejemplo, `PATIENT_ID` y `CUSTOMER_ID` pueden pertenecer a catálogos
distintos. La normalización depende del tipo. Para búsquedas exactas, almacenar
en `lookupDigest` un HMAC-SHA-256 de la tupla normalizada y delimitada de
tipo, espacio de nombres y valor. Custodiar la clave fuera de la base y de Git.
Este MVP puede operar sin conservar valores en claro ni cifrados. El acceso al
cálculo y búsqueda de huellas debe estar autorizado y limitado para evitar
enumeración. La rotación de la clave requiere un procedimiento con
reverificación o una fuente autorizada de los valores, ya que las huellas
existentes no permiten recalcularlas.

- **`PENDING`.** Solo conserva la huella de búsqueda. La reserva, los campos
  de evidencia y las fechas de verificación, vigencia y revocación son nulos. Dos
  sujetos pueden tener una propuesta pendiente para el mismo valor. Una
  coincidencia solo sirve para detectar duplicados o conflictos. La propuesta
  pendiente carece de permisos para consultar contexto o historial sensible.
- **`VERIFIED`.** Requiere autorización sobre el sujeto, prueba válida para el
  tipo y emisor, método, referencia opaca de evidencia y fecha de verificación.
  La prueba debe quedar ligada al sujeto, tipo, espacio y valor. La aplicación
  copia `lookupDigest` a `verifiedLookupDigest` al verificar. Una colisión
  detiene la operación sin transferir el identificador ni fusionar sujetos. La
  resolución solo es válida con estado verificado, sin revocación y con
  `validUntil` ausente o posterior a la hora actual. Esa resolución acredita
  el vínculo y la consulta además requiere autorización del actor.
- **`REVOKED`.** Solo procede de `VERIFIED`. Conserva la evidencia y la
  vigencia previas, registra `revokedAt` y libera la reserva mediante
  `verifiedLookupDigest = null`. Una asociación vencida deja de habilitar
  consultas de inmediato, pero su reserva se libera mediante revocación
  explícita y auditada. Una nueva vinculación requiere una nueva prueba.
  Si el mismo sujeto vuelve a solicitar el vínculo, se reutiliza su fila en
  estado `PENDING`, se limpian la evidencia y las fechas de verificación,
  vigencia y revocación, y se registra la reapertura en auditoría.

La referencia de evidencia identifica una comprobación de un emisor
autorizado. El esquema no define un emisor de desafíos ni almacena códigos,
tokens o documentos. La restricción única arbitra verificaciones concurrentes.
La vigencia frente a la hora actual y la autenticidad de la prueba se comprueban
en la aplicación. Las invariantes de fila se aplicarán con el SQL de abajo.

## Estados y reglas de transición

| Estado | Significado y salida permitida |
| --- | --- |
| `DRAFT` | Trámite creado con contexto inicial. Puede pasar a `IN_PROGRESS` o `CANCELLED`. |
| `IN_PROGRESS` | Se recopilan las selecciones requeridas. Puede pasar a `PENDING_CONFIRMATION` cuando los requisitos del tipo se cumplen, o a `CANCELLED`. |
| `PENDING_CONFIRMATION` | Listo para confirmar. Puede volver a `IN_PROGRESS` si cambian datos necesarios, o pasar a `COMPLETED` o `CANCELLED`. |
| `COMPLETED`, `CANCELLED` | Estados terminales con `closedAt`. Se conservan contexto e historial. |

El tipo de trámite y los pasos se controlan con una lista de valores de la
aplicación. Para la demo basta un flujo de cita. Si la confirmación depende de
un resultado externo, el canal debe aportar una prueba verificable de ese
resultado antes de completar el trámite. El orquestador no hace la consulta
externa. `Journey.status` es el estado del trámite y
`JourneyContext.currentStep` representa su paso operativo.

Al recibir eventos, resolver `producerId` desde la credencial autenticada y
comprobar que ese productor tiene acceso al trámite y permiso para publicar
el tipo de evento. Validar esquema, versión, campos y tamaños. Un evento
informativo puede incorporarse al historial. Solo los tipos autorizados,
validados y permitidos desde el estado vigente pueden disparar una
transición. El payload carece de autoridad para fijar el estado o el emisor.

### Eventos repetidos

La clave única `(producerId, externalEventId)` evita duplicados, pero por sí
sola no acredita idempotencia. Tras verificar permisos, comparar el trámite,
el tipo, la versión de esquema, la fecha de ocurrencia normalizada a la
precisión de almacenamiento y todo el payload validado con el evento
persistido. Comparar el JSON por contenido, ignorando el orden de las claves
de objetos y conservando el orden de los arreglos. Excluir el ID interno y la
fecha de recepción, que asigna el servidor. Si el contenido coincide, devolver
el resultado existente sin volver a aplicar efectos. Si difiere, rechazar por
conflicto, sin reemplazar el evento ni revelar el contenido previo. Ante una
carrera, resolver contra la fila ganadora después de revertir el intento que
violó la unicidad.

## Línea de tiempo

Tras comprobar acceso al trámite, consultar por `journeyId` y ordenar por
`occurredAt ASC, id ASC`. El cursor opaco lleva la fecha y el UUID de la última
fila y queda ligado al trámite. Para continuar, aplicar
`occurredAt > cursor.occurredAt` o igualdad de fecha con `id > cursor.id`.
Leer una fila adicional al límite determina si hay otra página. `receivedAt`
se fija al ingresar el evento y permite distinguir retrasos de recepción.
Un evento recibido tarde puede quedar antes de un cursor ya recorrido. El
cliente vuelve a consultar desde el inicio para refrescar ese historial.
El orden de presentación carece de efecto sobre las transiciones del trámite.

## Transacciones locales requeridas

1. **Crear trámite.** Insertar trámite, contexto inicial y los registros de
   evento o auditoría que documentan el alta como una unidad.
2. **Vincular, verificar o revocar.** Registrar el cambio de asociación y su
   auditoría juntos. En la verificación, comprobar evidencia y vigencia, tomar
   la reserva única y consumir la prueba en la misma transacción si su consumo
   se administra localmente. Una prueba externa requerirá validación y un
   mecanismo de un solo uso antes de habilitar ese flujo.
3. **Aceptar un evento con efecto o editar contexto.** Registrar el evento
   deduplicado, actualizar el contexto mediante comparación de versión e
   incremento atómico, aplicar la transición correspondiente y auditar la
   escritura en la misma transacción. Las transiciones incrementan la versión
   aunque no cambien las referencias. Ante una clave de evento repetida,
   recuperar el resultado existente para el mismo contenido y rechazar una
   reutilización incompatible. Un conflicto de versión revierte la operación
   completa. Un evento informativo que solo inserta una fila puede usar una
   escritura atómica.
4. **Consultar contexto o historial sensible.** Verificar el permiso vigente,
   leer y registrar la auditoría de éxito en una transacción local con una
   vista coherente. Los rechazos que deben quedar registrados se escriben tras
   la reversión de cualquier intento fallido para conservar la evidencia.

## Restricciones de la primera migración

**Representado en Prisma 7.9.1.** Se conservan tipos, nulabilidad, enums, claves
primarias y foráneas, borrado restrictivo, unicidad e índices. Los dos índices
únicos de identificadores cubren la asociación por sujeto y la reserva
verificada por tipo y espacio de nombres. El código de canal y
`(producerId, externalEventId)` mantienen su unicidad. Los índices existentes
soportan el listado por sujeto, la cronología por trámite y las consultas de
auditoría. El contexto conserva su relación uno a uno y versión inicial 1.

**SQL adicional en PostgreSQL 17.** Prisma no expresa estos `CHECK` en el
esquema. La [migración inicial](../prisma/migrations/20261124061014_init_orchestrator/migration.sql)
incluye este SQL después de crear las tablas. Debe aplicarse exclusivamente
a la base del orquestador. Las comprobaciones
de nulabilidad en cada rama son explícitas porque PostgreSQL admite
expresiones `CHECK` cuyo resultado es desconocido. Los plazos se comparan con
las fechas persistidas, de modo que el vencimiento por el paso del tiempo no
requiere modificar filas. Los `CHECK` verifican el estado de una fila. La
autorización y las transiciones entre estados siguen siendo responsabilidad
de las transacciones de la aplicación.

```sql
ALTER TABLE "PatientIdentifier"
  ADD CONSTRAINT "patient_identifier_digest_length_check"
  CHECK (
    octet_length("lookupDigest") = 32
    AND ("verifiedLookupDigest" IS NULL OR octet_length("verifiedLookupDigest") = 32)
  ),
  ADD CONSTRAINT "patient_identifier_status_check"
  CHECK (
    (
      "status" = 'PENDING'
      AND "verifiedLookupDigest" IS NULL
      AND "verificationMethod" IS NULL
      AND "verificationRef" IS NULL
      AND "verifiedAt" IS NULL
      AND "validUntil" IS NULL
      AND "revokedAt" IS NULL
    )
    OR (
      "status" IN ('VERIFIED', 'REVOKED')
      AND "verificationMethod" IS NOT NULL
      AND "verificationMethod" ~ '[^[:space:]]'
      AND "verificationRef" IS NOT NULL
      AND "verificationRef" ~ '[^[:space:]]'
      AND "verifiedAt" IS NOT NULL
      AND "verifiedAt" >= "createdAt"
      AND ("validUntil" IS NULL OR "validUntil" > "verifiedAt")
      AND (
        (
          "status" = 'VERIFIED'
          AND "verifiedLookupDigest" IS NOT NULL
          AND "verifiedLookupDigest" = "lookupDigest"
          AND "revokedAt" IS NULL
        )
        OR (
          "status" = 'REVOKED'
          AND "verifiedLookupDigest" IS NULL
          AND "revokedAt" IS NOT NULL
          AND "revokedAt" >= "verifiedAt"
        )
      )
    )
  );

ALTER TABLE "Journey"
  ADD CONSTRAINT "journey_status_closed_at_check"
  CHECK (
    ("status" IN ('DRAFT', 'IN_PROGRESS', 'PENDING_CONFIRMATION') AND "closedAt" IS NULL)
    OR (
      "status" IN ('COMPLETED', 'CANCELLED')
      AND "closedAt" IS NOT NULL
      AND "closedAt" >= "createdAt"
    )
  );

ALTER TABLE "JourneyContext"
  ADD CONSTRAINT "journey_context_positive_version_check" CHECK ("version" > 0);

ALTER TABLE "JourneyEvent"
  ADD CONSTRAINT "journey_event_positive_schema_version_check" CHECK ("schemaVersion" > 0);
```

## Conservación provisional para la demo

Usar exclusivamente pacientes ficticios. Eventos y auditoría son anexables
durante la demo, con lectura restringida y sin borrado individual. Conservarlos
juntos hasta 30 días naturales después del cierre de la demo y después eliminar
el conjunto de datos de la demo en una operación autorizada, incluidas sus
copias y exportaciones. Detener el ingreso antes de ese retiro para evitar que
un reintento antiguo se acepte tras perder la clave de deduplicación. La
operación corresponde al responsable del entorno de demostración. Este
incremento define la política y carece de tareas de purga o cambios en bases.
