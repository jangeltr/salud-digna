# Call Center

La aplicación independiente `@salud-digna/call-center` vive en `apps/call-center/` y utiliza Next.js App Router, React, TypeScript y Tailwind CSS. El puerto local predeterminado es 3001.

Desde la raíz del monorepo, con Node.js 24 y pnpm 11.28.11:

```sh
pnpm --filter @salud-digna/call-center install --frozen-lockfile
pnpm --filter @salud-digna/call-center dev
pnpm --filter @salud-digna/call-center check
pnpm --filter @salud-digna/call-center build
```

La pantalla de acceso está en `http://127.0.0.1:3001`. La consola de diseño está en `http://127.0.0.1:3001/diseno` únicamente durante `next dev`. La extensión `.dev.tsx` habilita esa página durante desarrollo y la excluye de la tabla de rutas de producción.

El estado local controla la sección visible, los diálogos y el selector «Estado de vista». Este selector permite inspeccionar los estados vacío, sin conexión, carga y error. No se ejecutan consultas ni operaciones de negocio. En escritorio amplio los paneles tienen desplazamiento independiente y en pantallas pequeñas siguen el orden de lectura.

## Integración pendiente

- Acordar sesión, permisos, disponibilidad del asesor, filtros y alcance de la cola.
- Confirmar criterios de búsqueda de pacientes y reglas para solicitudes abiertas, citas, estudios previos y último canal.
- Definir envío, vigencia y verificación del código OTP en el servidor.
- Adaptar los eventos reales al modelo de presentación de la línea temporal. Acordar dirección de mensajes, tipos de eventos y visibilidad de notas internas.
- Acordar transiciones de solicitud, permisos de escritura, canales habilitados de mensajería y manejo de errores.
- Integrar catálogos de estudios y clínicas, zona horaria, disponibilidad y confirmación de citas.

## Aviso de hidratación

El atributo observado `cz-shortcut-listen` no se genera en la aplicación. Que el aviso desaparezca en incógnito es compatible con una extensión que modifica el DOM antes de la hidratación. Para aislarlo, compara la misma URL en un perfil sin extensiones. La aplicación conserva los avisos de hidratación de React.
