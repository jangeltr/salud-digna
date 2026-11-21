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
pnpm --filter @salud-digna/api dev
```

El comando `dev` recompila y reinicia la API al cambiar el código. Para compilar y ejecutar el resultado, usa estos comandos en lugar de `dev`.

```sh
pnpm --filter @salud-digna/api build
pnpm --filter @salud-digna/api start
```

`pnpm --filter @salud-digna/api check` comprueba los tipos sin emitir archivos. Los comandos de ejecución cargan `apps/api/.env` si existe. Las variables exportadas en el entorno tienen prioridad.

| Variable | Valor predeterminado | Uso |
| --- | --- | --- |
| `NODE_ENV` | `development` | Acepta `development`, `test` o `production`. |
| `API_HOST` | `127.0.0.1` | Dirección de escucha. |
| `API_PORT` | `3000` | Puerto TCP entre 1 y 65535. |
| `CORS_ORIGINS` | Lista vacía | Orígenes HTTP(S) separados por comas, sin rutas ni comodines. Las credenciales de CORS están desactivadas. El archivo de ejemplo permite `http://localhost:5173` y `http://localhost:5174`. |

Con los valores de desarrollo, estas peticiones comprueban el estado y el documento OpenAPI.

```sh
curl --fail --show-error http://127.0.0.1:3000/api/v1/health
curl --fail --show-error http://127.0.0.1:3000/api/docs-json
```

El endpoint de salud responde HTTP 200 con `{"status":"ok"}`. Swagger UI está en `http://127.0.0.1:3000/api/docs`.

El workspace deshabilita el script de telemetría de instalación de `@scarf/scarf`, una dependencia transitiva de Swagger UI.
