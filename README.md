# Salud Digna

MVP para el Hackatec de Salud Digna. Un paciente puede iniciar una solicitud en la web, continuar por WhatsApp y finalizarla con el Call Center, conservando su identidad, contexto, datos parciales e historial de atención.

El incremento 008 incorpora catálogos de clínicas y estudios para las solicitudes de agendamiento.

## Arquitectura

El backend será un monolito modular orientado a eventos con Node.js, TypeScript y NestJS. PostgreSQL será la fuente de verdad y Prisma gestionará la persistencia. Los canales se integrarán mediante contratos REST documentados con OpenAPI y publicados con Swagger UI. Socket.IO se incorporará para notificaciones en tiempo real cuando un flujo lo requiera. Redis, BullMQ y los servicios de IA quedan como integraciones opcionales.

## Responsabilidades

| Integrante | Responsabilidad |
| --- | --- |
| 1 | API, contratos públicos y base de datos |
| 2 | Web pública y aplicación móvil |
| 3 | Web de Call Center y administración y monitoreo |

Cada integrante mantiene su aplicación. La ubicación de la aplicación móvil se definirá cuando se incorpore al repositorio.

## Estructura

| Ruta | Propósito |
| --- | --- |
| `apps/api/` | Backend NestJS |
| `apps/patient-portal/` | Web pública del paciente |
| `apps/operations/` | Call Center, administración y monitoreo |
| `packages/contracts/` | Contratos públicos e insumos para clientes |
| `packages/shared/` | Utilidades compartidas independientes de las aplicaciones |
| `docs/` | Arquitectura, módulos, desarrollo y despliegue |

`apps/api` ya forma parte del workspace como `@salud-digna/api`. Los otros directorios de aplicaciones y paquetes están reservados.

## Entorno e instalación inicial

Se requiere acceso al repositorio privado, Git, Node.js 24 LTS y pnpm 11.28.11, fijado en `package.json`. Usa PostgreSQL 17 para comprobar la persistencia. Fuentes de versiones disponibles en [Node.js](https://nodejs.org/en/blog/release/v24.22.3/) y [pnpm](https://github.com/pnpm/pnpm/releases/tag/v11.28.11).

Ejecuta estos comandos desde la raíz del repositorio.

```sh
node --version
pnpm --version
pnpm install
cp -n apps/api/.env.example apps/api/.env
# Configura DATABASE_URL y JWT_SECRET en apps/api/.env.
pnpm --filter @salud-digna/api dev
```

Con los valores del ejemplo, la API queda disponible en `http://127.0.0.1:3000`. El estado del servicio se consulta en `/api/v1/health`, la conectividad de PostgreSQL en `/api/v1/health/db` fuera de producción, Swagger UI en `/api/docs` y el documento OpenAPI en `/api/docs-json`. Consulta los comandos de compilación y las variables en [Desarrollo e integración](docs/development.md).

## Catálogos de demostración

Desde la raíz y con la base local migrada, configura `DATABASE_URL` en `apps/api/.env` y ejecuta.

```sh
pnpm --filter @salud-digna/api build
pnpm --filter @salud-digna/api catalogs:seed-demo
```

El comando carga tres clínicas ficticias y cinco estudios con precios sintéticos que carecen de validez como tarifas oficiales. Usa UUID fijos, conserva los registros existentes y respeta cambios de administradores, incluidas las desactivaciones. La carga es manual.

## Convenciones y documentación

Trabaja en ramas de alcance acotado y revisa los cambios en el contrato antes de integrar. Las aplicaciones consumidoras se apoyan exclusivamente en contratos documentados de la API. Usa datos sintéticos para el desarrollo y conserva las credenciales fuera de Git.

- [Arquitectura del backend](docs/architecture.md)
- [Contratos de autenticación y creación de administradores](docs/api-auth.md)
- [Catálogo de clínicas](docs/api-clinics.md)
- [Catálogo de estudios](docs/api-studies.md)
- [Módulos](docs/modules.md)
- [Desarrollo e integración](docs/development.md)
- [Despliegue futuro en Debian 13](docs/deployment.md)
- [Instrucciones permanentes para Codex](AGENTS.md)
