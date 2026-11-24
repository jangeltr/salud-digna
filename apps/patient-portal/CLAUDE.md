# Portal del paciente

@../../AGENTS.md

Las instrucciones anteriores valen para todo el monorepo. Lo que sigue aplica solo a `apps/patient-portal/`.

## Contexto

Sitio web con Next.js, TypeScript y Tailwind. Las decisiones vigentes y sus motivos están en `apps/patient-portal/docs/decisions.md`. Léelo antes de cambiar la sesión, el canal o el cliente de API, y actualízalo en el mismo cambio si una decisión cambia.

Desde el 2026-11-24 el portal es solo web. El proyecto cambió de arquitectura: el portal simula el canal Web existente y hablará con dos servicios nuevos cuyos contratos aún no existen. Por eso se retiró la PWA instalable que tuvo hasta esa fecha. Su rastro está en la sección «Decisiones retiradas» de ese documento.

- Deja fuera el manifiesto, el service worker, los iconos de instalación y cualquier interfaz para un modo instalado.
- Mientras no existan los contratos nuevos, el código sigue usando la API actual. Espera a que se publiquen antes de escribir contra esos servicios.

## Alcance

- Modifica solo `apps/patient-portal/`. El resto del repositorio pertenece a otros integrantes o es compartido: se lee como referencia y se deja intacto.
- Pregunta antes de añadir dependencias. Instalarlas modifica `pnpm-lock.yaml`, que está fuera del portal.
- Trabaja en una rama y abre un pull request contra `main`. Los commits siguen el formato `tipo(patient-portal): descripción`, en inglés.

## Contrato con la API

- El contrato es `docs/openapi.json`. Léelo en su ubicación, sin copiarlo al portal. `lib/api/` y `mocks/` usan solo operaciones y propiedades de ese archivo.
- Toda llamada a la API sale del servidor de Next. El JWT vive en una cookie `HttpOnly` y queda fuera del código del navegador.
- Las escrituras sobre una solicitud envían su `version`. Ante un `409`, vuelve a leer la solicitud antes de reintentar.
- Cada página nueva de `(account)` o `(booking)` llama a `requireAccount()` y registra su prefijo en `lib/session/routes.ts`.
- Las pruebas locales usan un puerto distinto de 5173 y una API simulada. Contra la API desplegada, solo con autorización y contando cada llamada a registro y acceso.
- Si el portal necesita algo que el contrato no ofrece, repórtalo en lugar de simularlo con campos inventados.

## Convenciones

- Carpetas y código en inglés, con los nombres de dominio de la API. Textos para el paciente y documentación en español. Los segmentos de URL bajo `app/` van en español y sin acentos.
- `app/` compone rutas. La lógica de cada dominio vive en `features/` y lo transversal en `lib/`.
- El servidor de desarrollo usa el puerto 5173.
