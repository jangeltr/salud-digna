# Arquitectura del backend

La API se ejecutará como un monolito modular en NestJS con TypeScript. Los adaptadores traducirán las entradas de cada canal a operaciones de los módulos de aplicación. Cada módulo será dueño de sus reglas y accederá a los demás mediante interfaces explícitas o eventos internos.

## Continuidad entre canales

El backend conservará un identificador interno estable para el paciente y otro para la solicitud. Una vez verificada la identidad en el canal entrante, el backend resolverá la relación con el paciente y verificará su autorización sobre la solicitud. A partir de esos identificadores podrá recuperar el estado, los datos parciales y el historial. La vinculación de una identidad externa requerirá verificación y quedará registrada para auditoría.

`IdentityModule` devuelve el mismo `patientId` a los adaptadores internos cuando la identidad de origen está verificada. La vinculación requiere un código emitido desde una sesión de paciente y una prueba del canal aportada por un adaptador confiable. Las identidades de demostración se aíslan con un prefijo reservado y quedan fuera de la resolución de canales reales. Los futuros servicios de Call Center deberán autenticar a sus operadores como `ADVISOR` o `ADMIN` y comprobar el acceso al paciente resuelto. Consulta el [contrato de identidad](api-identity.md).

## Persistencia y eventos

PostgreSQL 17 será la fuente de verdad. Prisma ORM 7 utiliza el adaptador `@prisma/adapter-pg` para el acceso a datos y Prisma Migrate para versionar los cambios de esquema. Las actualizaciones de estado e historial que formen parte de una misma operación se persistirán en una transacción. Los módulos podrán publicar eventos internos después de confirmar la transacción para coordinar efectos secundarios.

Para entradas reintentables, como webhooks, se prevé deduplicar con identificadores estables del proveedor. Si un flujo requiere entrega duradera de eventos, se evaluará una tabla de salida transaccional en PostgreSQL. Redis, BullMQ e IA podrán añadirse cuando exista una necesidad concreta.

Los módulos que necesiten consultar PostgreSQL importarán `PrismaModule` e inyectarán `PrismaService` en sus servicios o repositorios. El proveedor crea un único cliente al primer uso y cierra su pool durante el apagado ordenado de NestJS. El esquema inicial define el paciente y sus identidades, la solicitud y su contexto, los catálogos, la cita y las trazas operativas. Las interacciones y los eventos pertenecen a la solicitud y conservan su historial. La fila de la solicitud contiene el estado vigente. Consulta el [modelo de datos y sus restricciones](database.md).

`GET /api/v1/health` indica que la API está disponible. Fuera de producción, `GET /api/v1/health/db` ejecuta `SELECT 1` a través de `HealthService` para verificar el acceso a PostgreSQL.

## Autenticación y autorización

`AuthModule` registra la cuenta y el perfil de paciente en una sola transacción. La cuenta `User` identifica al actor autenticado y `Patient` identifica al titular de los trámites. Las rutas protegidas validan JWT Bearer y consultan el estado y rol actuales de la cuenta. Los módulos que usen roles también deberán comprobar la titularidad o asignación de cada recurso en sus consultas. Consulta los [contratos de autenticación](api-auth.md).

## Integración pública

REST con OpenAPI documentará operaciones, esquemas, autenticación y errores. Swagger UI permitirá consultar y probar el contrato en los entornos habilitados. Socket.IO podrá avisar de cambios a consumidores autorizados. Ante una reconexión, los consumidores podrán recuperar el estado vigente mediante REST.

Los contratos serán independientes de los frameworks de frontend y de los modelos internos de Prisma. Consulta los [módulos previstos](modules.md) para conocer sus límites.

### Base de la API

`AppModule` compone los módulos de NestJS y registra `HealthModule`. Los próximos módulos se crearán junto a `health/` dentro de `apps/api/src/` a medida que se implementen sus flujos. La API REST usa el prefijo `/api/v1`. Swagger UI y el JSON de OpenAPI se publican fuera del prefijo, en `/api/docs` y `/api/docs-json`.

La validación global transforma y valida entradas declaradas con DTO y rechaza propiedades ajenas al DTO. Se usa el manejo de excepciones de NestJS para responder con errores HTTP en JSON y devolver un mensaje genérico cuando se produce un error interno inesperado.
