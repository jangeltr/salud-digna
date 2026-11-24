# Portal del paciente

@../../AGENTS.md

Las instrucciones anteriores valen para todo el monorepo. Lo que sigue aplica solo a `apps/patient-portal/`.

## Contexto

Sitio web con Next.js, TypeScript y Tailwind. Las decisiones vigentes y sus motivos están en `apps/patient-portal/docs/decisions.md`. Léelo antes de cambiar la sesión, el canal, las interfaces o los adaptadores, y actualízalo en el mismo cambio si una decisión cambia.

Desde el 2026-11-24 el portal es solo web. El proyecto cambió de arquitectura: el portal simula el canal Web existente y habla con dos servicios, la API general y un orquestador que aún no tiene contrato. Por eso se retiró la PWA instalable que tuvo hasta esa fecha. Su rastro está en la sección «Decisiones retiradas» de ese documento.

- Deja fuera el manifiesto, el service worker, los iconos de instalación y cualquier interfaz para un modo instalado.
- El orquestador aún no tiene contrato. Las interfaces del trámite las atiende hoy `lib/adapters/legacy-requests`, sobre la API actual. Espera al contrato antes de escribir su adaptador.

## Alcance

- Modifica solo `apps/patient-portal/`. El resto del repositorio pertenece a otros integrantes o es compartido: se lee como referencia y se deja intacto.
- Pregunta antes de añadir dependencias. Instalarlas modifica `pnpm-lock.yaml`, que está fuera del portal.
- Trabaja en una rama y abre un pull request contra `main`. Los commits siguen el formato `tipo(patient-portal): descripción`, en inglés.

## Servicios y dependencias

- Páginas, acciones y componentes importan solo el modelo y las interfaces de `lib/domain` y los servicios de `lib/composition.ts`. Nunca importan de `lib/adapters`.
- Los tipos generados del contrato y los códigos HTTP se quedan en `lib/adapters`, que los traduce al modelo y a los errores de `lib/domain`.
- El token queda fuera de páginas y acciones: el adaptador lo toma del módulo de sesión.
- Cada acción del paciente sobre un trámite se notifica como evento de negocio con `requestNotifier.notify` y un `eventId` nuevo. La pantalla vuelve a consultar el estado con `requestQuery`.
- Los eventos llevan la versión que vio el paciente. Ante el error `conflict`, vuelve a consultar el trámite antes de reintentar.
- El contrato de la API general es `docs/openapi.json`. Léelo en su ubicación, sin copiarlo al portal. `lib/adapters/` y `mocks/` usan solo operaciones y propiedades de ese archivo.
- Toda llamada a un servicio sale del servidor de Next. El JWT vive en una cookie `HttpOnly` y queda fuera del código del navegador.
- Cada página nueva de `(account)` o `(booking)` llama a `requireAccount()` y registra su prefijo en `lib/session/routes.ts`.
- Las pruebas locales usan un puerto distinto de 5173 y una API simulada. Contra la API desplegada, solo con autorización y contando cada llamada a registro y acceso.
- Si el portal necesita algo que el contrato no ofrece, repórtalo en lugar de simularlo con campos inventados.

## Convenciones

- Carpetas y código en inglés, con los nombres de dominio de la API. Textos para el paciente y documentación en español. Los segmentos de URL bajo `app/` van en español y sin acentos.
- `app/` compone rutas. La lógica de cada dominio vive en `features/` y lo transversal en `lib/`.
- El servidor de desarrollo usa el puerto 5173.
