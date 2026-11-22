# Modelo de datos del MVP omnicanal

PostgreSQL 17 conserva una identidad interna por paciente y un estado por solicitud. Los canales Web, WhatsApp, móvil y Call Center comparten ese estado y su contexto.

| Entidad | Relaciones y propósito |
| --- | --- |
| `Patient` | Identidad interna. El correo y el teléfono son datos de contacto opcionales. |
| `PatientIdentity` | Varios identificadores externos por paciente. El par `provider` y `externalId` es único. La verificación del canal se registra en `verifiedAt` cuando un adaptador confiable aporta la evidencia. |
| `IdentityLink` | Desafío asociado a un paciente y proveedor. Conserva el hash SHA-256, vencimiento, contador de intentos y momento de consumo. |
| `User` | Cuenta con correo único y rol. El vínculo con `Patient` es opcional y admite como máximo una cuenta vinculada por paciente. El hash de contraseña es opcional. |
| `Clinic` | Catálogo de sedes referenciadas por las citas. |
| `Study` | Catálogo de estudios referenciados por las citas. El precio usa `DECIMAL(12,2)`. |
| `ServiceRequest` | Pertenece a un paciente. Guarda el estado, el paso, el último canal y una versión inicial de 1. |
| `RequestContext` | Hasta un contexto por solicitud. Guarda selecciones parciales como estudio, clínica, fecha y horario en JSONB. |
| `Interaction` | Registro de una interacción en un canal, con actor y contenido opcionales. Se guarda el contenido necesario para dar continuidad al trámite. |
| `DomainEvent` | Hecho de negocio asociado a una solicitud, con canal, actor opcional y datos en JSONB. |
| `Appointment` | Hasta una fila por solicitud, vinculada a una clínica y un estudio. Cambios y cancelaciones actualizan esa fila. |
| `AssistanceAuthorization` | Referencia de atención y permiso temporal de un asesor sobre una solicitud. |
| `AuditLog` | Acción de seguridad con actor opcional y referencia genérica por tipo e ID de entidad. Sus metadatos son opcionales. |

## Integridad e historial

- PostgreSQL genera los UUID de las claves primarias. Las fechas se almacenan como `timestamptz` con precisión de milisegundos y Prisma mantiene `updatedAt`.
- Las claves foráneas compuestas de `Interaction`, `DomainEvent` y `Appointment` aseguran que `patientId` coincida con el titular de la solicitud. Prisma requiere también que el par de columnas sea único en `Appointment` para representar esa relación como uno a uno. `Appointment.requestId` sigue siendo único incluso para citas canceladas.
- Las claves foráneas restringen las eliminaciones. Los índices cubren identidades y solicitudes por paciente, cronologías por solicitud, agenda por clínica y auditoría por entidad. Para ordenar interacciones y eventos de forma estable, usa `createdAt` y después `id`.
- La solicitud y la cita conservan el estado actual en sus propias filas. Los eventos permiten reconstruir la cronología de negocio y las interacciones registran contactos por canal. La auditoría registra operaciones de seguridad y puede referenciar varias clases de entidad sin una clave foránea polimórfica.
- El contexto, los eventos y la auditoría solo deben conservar datos necesarios para su función. Excluye datos clínicos innecesarios, contraseñas, tokens, códigos OTP y otros secretos. Cuando se implemente autenticación, `User.passwordHash` contendrá exclusivamente hashes.

## Migración inicial

La [migración inicial](../apps/api/prisma/migrations/20261121191248_init_omnichannel/migration.sql) se generó desde el esquema con `prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`. La generación compara dos modelos y prescinde de una base auxiliar. [Referencia de Prisma Migrate](https://www.prisma.io/docs/cli/v7/migrate/diff)

Antes de aplicarla, confirma que `DATABASE_URL` apunta a la base local `salud_digna`, revisa el SQL y comprueba el esquema real. Desde la raíz del monorepo, este comando compara las estructuras soportadas por Prisma con un esquema vacío. Si detecta objetos previos, revisa el estado con el responsable de la base antes de continuar.

```sh
pnpm --filter @salud-digna/api exec prisma migrate diff --from-config-datasource --to-empty
```

Si la comparación confirma que el esquema está vacío y el SQL coincide con el cambio previsto, aplica la migración y comprueba el resultado.

```sh
pnpm --filter @salud-digna/api prisma:migrate:deploy
pnpm --filter @salud-digna/api exec prisma migrate status
pnpm --filter @salud-digna/api exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

`migrate deploy` aplica las migraciones versionadas con los permisos del usuario configurado. Si faltan permisos, detén la operación. Para futuras migraciones de desarrollo, consulta la [estrategia de base auxiliar](development.md#prisma-y-migraciones).


## Migración de identidad

La [migración de identidad](../apps/api/prisma/migrations/20261121201000_add_identity_link/migration.sql) agrega `IdentityLink`, un índice de paciente y la clave foránea que restringe la eliminación del paciente. El SQL se generó comparando el esquema anterior con el actual y se aplica con `pnpm --filter @salud-digna/api prisma:migrate:deploy`. Las bases que ya tienen la migración inicial conservan su historial.

El consumo del desafío, la vinculación y la auditoría ocurren en la misma transacción. La unicidad de `PatientIdentity(provider, externalId)` protege la titularidad incluso cuando dos desafíos apuntan al mismo identificador.


## Migración de atención asistida

La [migración de atención asistida](../apps/api/prisma/migrations/20261121203200_add_assistance_authorization/migration.sql) añade una tabla con la referencia y el permiso. El hash es único. El canje rellena en una sola escritura condicional el asesor, la fecha de consumo y el vencimiento del permiso. Las claves foráneas vinculan la solicitud y al asesor, y el índice facilita comprobar permisos vigentes por solicitud y asesor.

Aplica las migraciones versionadas a la base autorizada con `pnpm --filter @salud-digna/api prisma:migrate:deploy`.


## Migración de WhatsApp

La [migración de WhatsAppInbox](../apps/api/prisma/migrations/20261122180000_add_whatsapp_inbox/migration.sql) añade la bandeja de entrada local. El identificador de mensaje de Meta es la clave primaria de deduplicación. Consulta el [flujo y las reglas de retención](integrations/whatsapp.md).
