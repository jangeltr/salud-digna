# Administración

`@salud-digna/admin` es una aplicación independiente de Next.js, React, TypeScript y Tailwind. El alcance inicial es visual. Los controles que requieren datos, autenticación o autorización permanecen deshabilitados. La navegación y los diálogos de diseño funcionan localmente.

Desde la raíz del monorepo con Node.js 24 y pnpm 11.28.11:

```sh
pnpm --filter @salud-digna/admin install --frozen-lockfile
pnpm --filter @salud-digna/admin dev
pnpm --filter @salud-digna/admin check
pnpm --filter @salud-digna/admin build
```

El acceso administrativo se muestra en `http://127.0.0.1:3002/`. Las pantallas internas se revisan en `http://127.0.0.1:3002/diseno` únicamente durante `next dev`. La configuración de Next.js excluye la página del build de producción.

## Integración pendiente

- Conectar el acceso con [Auth](api-auth.md) y validar el rol `ADMIN` con la API. Definir el manejo de sesión, el origen de la aplicación y la URL de producción.
- Conectar indicadores, supervisión paginada y Patient Journey al [monitoreo administrativo](api-admin.md). Acordar un contrato adicional para distribución por canal, porque el resumen actual agrupa las solicitudes por estado.
- Conectar los catálogos de [estudios](api-studies.md) y [clínicas](api-clinics.md). Acordar cómo listar los registros inactivos desde Administración.
- Acordar los contratos para usuarios, asignación de roles, gestión de permisos y lectura de auditoría.

El lockfile del workspace se debe regenerar con pnpm 11.28.11 a partir de los manifiestos combinados si coincide con cambios de otras aplicaciones.
