# Orquestador de Salud Digna

Servicio NestJS independiente para identidad omnicanal, trámites, eventos,
contexto y trazabilidad. Usa Node.js 24, la versión de pnpm fijada en el
monorepo y Prisma 7.9.1 con el adaptador PostgreSQL. El
[modelo inicial](docs/data-model.md) define la persistencia de identidad,
trámites y auditoría.

Copia `.env.example` a `apps/orchestrator/.env` y completa `DATABASE_URL` con
la contraseña asignada al usuario local `salud_digna_orchestrator_app`.
Codifica los caracteres reservados de la contraseña como parte de la URL.
La URL requiere una contraseña, el usuario `salud_digna_orchestrator_app`, la base
`salud_digna_orchestrator` y un puerto explícito. Las opciones de conexión y los
fragmentos se rechazan. El archivo `.env` queda fuera de Git y las variables del
proceso tienen prioridad sobre sus valores.

El destino local autorizado es `127.0.0.1:5432`. Para un despliegue autorizado
con otro destino, configura por separado `ORCHESTRATOR_DB_HOST` y
`ORCHESTRATOR_DB_PORT` con los valores esperados y haz que `DATABASE_URL`
coincida con ambos. El usuario y la base requeridos son fijos.

Desde la raíz del monorepo:

```sh
pnpm install --frozen-lockfile
pnpm --filter @salud-digna/orchestrator dev
```

El servicio escucha en `127.0.0.1:3300`. Para cambiar el puerto, define
`ORCHESTRATOR_PORT` en el entorno o en `apps/orchestrator/.env`. El arranque
requiere una URL válida para la base del orquestador. Prisma abre la conexión
cuando se usa el cliente para una operación de base de datos.

```sh
curl --fail http://127.0.0.1:3300/api/v1/health
```

La respuesta esperada es HTTP 200 con `{"status":"ok"}`. La ruta comprueba
que el proceso HTTP responde.

## Credenciales de canal

Cada backend se identifica por HTTPS con `Authorization: Bearer <keyId>.<secret>`.
El secreto solo se distribuye a backends mediante un almacén seguro. Excluye
el encabezado de los logs del proxy y las aplicaciones, y mantén la clave
fuera del navegador, del binario móvil y de Git.

Un operador autorizado puede emitir una clave tras compilar el orquestador.
El código debe corresponder a un canal activo, registrado y aprobado
previamente. El ejemplo usa un código ficticio y concede un solo scope.

```sh
pnpm --filter @salud-digna/orchestrator auth:create-channel-credential --channel demo-web --scope EVENTS_PUBLISH
```

Repite `--scope` solo si el canal también necesita `JOURNEYS_READ`. La
utilidad persiste el secreto únicamente como digest y entrega por salida
estándar una sola vez el valor que se usa tras `Bearer`. Ejecútala en una
sesión privada sin captura de terminal y transfiere el valor al almacén seguro
del backend. La clave vence a los 30 días.

Para rotar una clave, emite otra para el mismo canal, cambia el secreto
en el backend y confirma el cambio antes de revocar la anterior. Para
revocar, el operador registra `revokedAt` en la fila `ChannelCredential`
correspondiente al `keyId` mediante su acceso administrativo autorizado a la
base del orquestador. El guard consulta la credencial y el canal en cada
petición, por lo que la revocación surte efecto en la siguiente consulta.

Los módulos de rutas protegidas importan `ChannelAuthModule` y declaran sus
scopes con `@RequireChannelScopes`.
El guard devuelve `401` cuando falla la autenticación y `403` cuando faltan
scopes. El productor se deriva de `request.authenticatedChannel.id`. La
autorización por trámite se comprueba por separado con
[`JourneyAccessGrant`](docs/data-model.md#integración-con-rutas-de-trámites).
Salud sigue siendo pública.

`GET /api/v1/channel-auth/verify` es una ruta de diagnóstico del MVP.
Requiere una credencial de canal con `JOURNEYS_READ`. Una respuesta exitosa
incluye solo `authenticated: true`, `channelCode` y `scopes`. La ruta no
concede acceso a trámites. Devuelve `401` sin una credencial válida y `403`
si la credencial carece de ese scope.

Tras compilar, ejecuta las pruebas unitarias desde la raíz con
`node --test --test-isolation=none apps/orchestrator/test/channel-auth.test.cjs`. Las pruebas
emplean datos sintéticos y un cliente Prisma simulado.

## Permisos de demostración para Hackatec

Un operador autorizado puede emitir un permiso temporal para un canal
activo, un trámite ficticio existente y un actor o sesión ficticios.
La utilidad es local y exige una conexión del orquestador en `127.0.0.1`.
El operador debe confirmar que el trámite pertenece al conjunto ficticio
de la demo. La utilidad comprueba su existencia y carece de un indicador
en el modelo para distinguir datos reales de ficticios. En producción, la
emisión requiere un flujo de verificación de identidad y autorización.

Después de compilar, desde la raíz, usa
`pnpm --filter @salud-digna/orchestrator auth:create-demo-journey-grant`
con `--channel`, `--journey`, `--actor` y uno o más `--operation` con
`READ_JOURNEY` o `PUBLISH_EVENT`. La duración predeterminada es 300 segundos,
o el máximo configurado si es inferior. `--duration-seconds` permite
especificarla. `ORCHESTRATOR_DEMO_GRANT_MAX_SECONDS` fija el máximo
administrativo, con 900 segundos por defecto y un límite de 3600.

Para guardar solo el permiso, invoca el ejecutable compilado directamente
y redirige su salida estándar a un archivo privado. Sustituye el UUID del
ejemplo por el del trámite ficticio existente.

```sh
grant_file="$(mktemp)" &&
node apps/orchestrator/dist/journey-access/create-demo-journey-grant.js \
  --channel demo-web --journey 00000000-0000-4000-8000-000000000001 \
  --actor demo-session --operation READ_JOURNEY --duration-seconds 300 > "$grant_file"
```

En caso de éxito, el archivo contiene una sola línea con el permiso para
`X-Journey-Grant`. Conserva esa línea en un almacén seguro del backend y
retira el archivo temporal cuando ya no se necesite. La herramienta guarda
solo el digest del permiso y envía los errores a stderr. El permiso conserva
su alcance por trámite; las rutas también requieren una API key con el scope
de canal correspondiente.

## Consultas de trámites

El [contrato de consultas](docs/journey-queries.md) describe las rutas de
estado y contexto y los encabezados requeridos por los backends de canal.
El [contrato de escritura](docs/journey-writes.md) describe la creación
de trámites, la publicación de avances y el traspaso de la demo.

`POST /api/v1/journeys` requiere `Idempotency-Key` de 32 bytes aleatorios en
base64url sin relleno. Conserva la clave para los reintentos de la misma
operación y genera otra para cada trámite nuevo. Un reintento recupera el
ID y estado inicial y puede recibir un permiso nuevo dentro de la vigencia
original. La misma clave con un cuerpo distinto devuelve `409` en ese canal.
Coordina el cambio con los backends de canal y aplica la
[migración incremental](prisma/migrations/20261124075314_add_journey_creation_idempotency/migration.sql)
antes de desplegar esta versión.

## Prisma

Puedes validar el esquema y generar el cliente sin `DATABASE_URL` ni conexión
a PostgreSQL. Los scripts `dev`, `build` y `check` generan el cliente antes
de compilar.

```sh
pnpm --filter @salud-digna/orchestrator prisma:validate
pnpm --filter @salud-digna/orchestrator prisma:generate
pnpm --filter @salud-digna/orchestrator check
pnpm --filter @salud-digna/orchestrator build
pnpm --filter @salud-digna/orchestrator start
```

El historial del orquestador está en [`prisma/migrations`](prisma/migrations/).
La migración inicial usa el esquema `public` existente dentro de
`salud_digna_orchestrator`. Antes de aplicarla, comprueba que el destino
corresponde al orquestador, que el esquema está vacío y que
`salud_digna_orchestrator_app` tiene permisos para crear los objetos en
`public`.

En un paso posterior autorizado, desde la raíz, ejecuta
`pnpm --filter @salud-digna/orchestrator prisma:migrate:deploy`.
El script selecciona la configuración y el historial del orquestador.
Prisma registra la aplicación en `_prisma_migrations`.
