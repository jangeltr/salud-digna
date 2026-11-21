# Desarrollo e integración

- Trabaja en una rama enfocada y presenta cambios en una solicitud de integración. Coordina con el responsable de cada aplicación afectada.
- Ejecuta pnpm desde la raíz. Cuando se creen los paquetes, declara dependencias locales con el protocolo `workspace:`. Incluye el lockfile generado por pnpm al incorporar dependencias.
- Mantén las utilidades de `packages/shared/` independientes de NestJS, Prisma y los frameworks de frontend. Evita que las aplicaciones importen código interno de otras aplicaciones.
- Actualiza OpenAPI en el mismo cambio que modifique la superficie pública. Documenta también el nombre, los datos y los permisos de los eventos Socket.IO que lleguen a consumidores.
- Revisa compatibilidad de rutas, esquemas, autenticación, errores y semántica. Trata la eliminación o renombrado de campos, los nuevos campos obligatorios y los cambios de permisos como posibles rupturas. Identifica consumidores afectados y acuerda la transición o el versionado antes de integrar.
- Haz verificaciones acotadas al cambio. Cuando exista una API, revisa la especificación generada y valida el flujo consumidor afectado si cambia el contrato.
- Usa datos sintéticos. Mantén secretos y archivos de entorno locales fuera de Git. Usa valores inocuos en cualquier ejemplo de configuración.

## API local

Ejecuta los comandos desde la raíz del repositorio.

```sh
pnpm install
cp -n apps/api/.env.example apps/api/.env
# Configura DATABASE_URL en apps/api/.env si vas a usar PostgreSQL.
pnpm --filter @salud-digna/api dev
```

El comando `dev` recompila y reinicia la API al cambiar el código. Para compilar y ejecutar el resultado, usa estos comandos en lugar de `dev`.

```sh
pnpm --filter @salud-digna/api build
pnpm --filter @salud-digna/api start
```

`pnpm --filter @salud-digna/api check` comprueba los tipos sin emitir archivos. Los comandos de ejecución y Prisma CLI cargan `apps/api/.env` si existe. Las variables exportadas en el entorno tienen prioridad.

| Variable | Valor predeterminado | Uso |
| --- | --- | --- |
| `NODE_ENV` | `development` | Acepta `development`, `test` o `production`. |
| `API_HOST` | `127.0.0.1` | Dirección de escucha. |
| `API_PORT` | `3000` | Puerto TCP entre 1 y 65535. |
| `CORS_ORIGINS` | Lista vacía | Orígenes HTTP(S) separados por comas, sin rutas ni comodines. Las credenciales de CORS están desactivadas. El archivo de ejemplo permite `http://localhost:5173` y `http://localhost:5174`. |
| `DATABASE_URL` | Vacía | URL de PostgreSQL para la API y Prisma CLI. |
| `SHADOW_DATABASE_URL` | Vacía | URL de la base auxiliar dedicada para `prisma:migrate:dev`. |

Usa PostgreSQL 17 accesible en `127.0.0.1:5432`, con la base `salud_digna` y el usuario `salud_digna_app` autenticado mediante SCRAM-SHA-256. Configura manualmente `DATABASE_URL` en `apps/api/.env` con el formato `postgresql://salud_digna_app:<PASSWORD>@127.0.0.1:5432/salud_digna?schema=public`. Sustituye el marcador por la contraseña codificada para URL y conserva el archivo local fuera de Git.

Con los valores de desarrollo, estas peticiones comprueban la API, PostgreSQL y OpenAPI.

```sh
curl --fail --show-error http://127.0.0.1:3000/api/v1/health
curl --fail --show-error http://127.0.0.1:3000/api/v1/health/db
curl --fail --show-error http://127.0.0.1:3000/api/docs-json
```

El endpoint de salud responde HTTP 200 con `{"status":"ok"}`. El diagnóstico de PostgreSQL devuelve HTTP 200 con el mismo cuerpo si la consulta funciona, HTTP 503 con un mensaje genérico si la conexión falla o falta configurar y HTTP 404 en producción. Swagger UI está en `http://127.0.0.1:3000/api/docs`.

El workspace deshabilita el script de telemetría de instalación de `@scarf/scarf`, una dependencia transitiva de Swagger UI.


## Prisma y migraciones

| Comando desde la raíz | Uso |
| --- | --- |
| `pnpm --filter @salud-digna/api prisma:validate` | Valida el esquema sin conectarse a PostgreSQL. |
| `pnpm --filter @salud-digna/api prisma:generate` | Genera el cliente en `apps/api/src/generated/prisma/`, excluido de Git. |
| `pnpm --filter @salud-digna/api prisma:migrate:dev` | Crea y aplica migraciones en una base de desarrollo. |
| `pnpm --filter @salud-digna/api prisma:migrate:deploy` | Aplica las migraciones versionadas pendientes en la base indicada. |

`build`, `dev` y `check` generan el cliente antes de ejecutar TypeScript. Generación y validación funcionan con `DATABASE_URL` vacía. Versiona el SQL revisado en `apps/api/prisma/migrations/`. Consulta el [procedimiento para inspeccionar y aplicar la migración inicial](database.md).

Para crear migraciones posteriores con `migrate dev`, usa una identidad de migración con permisos de DDL sobre el esquema de desarrollo. Si carece de `CREATEDB`, configura `SHADOW_DATABASE_URL` con una base auxiliar separada y desechable, previamente aprovisionada por un administrador y accesible para esa identidad. Prisma reinicializa el contenido de la auxiliar al ejecutar `migrate dev`. Mantén `salud_digna_app` con privilegios de aplicación y conserva una URL distinta para cada base. [Base auxiliar de Prisma Migrate](https://www.prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate/shadow-database)
