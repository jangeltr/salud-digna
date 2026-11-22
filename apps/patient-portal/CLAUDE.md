# Portal del paciente

@../../AGENTS.md

Las instrucciones anteriores valen para todo el monorepo. Lo que sigue aplica solo a `apps/patient-portal/`.

## Contexto

App Next.js, TypeScript y Tailwind que funciona como sitio web y como PWA instalable. Las decisiones vigentes y sus motivos están en `docs/patient-portal.md`. Léelo antes de cambiar la sesión, el canal o el cliente de API, y actualízalo en el mismo cambio si una decisión cambia.

## Alcance

- Modifica solo `apps/patient-portal/` y `docs/patient-portal.md`. `apps/api/`, `apps/operations/` y `packages/` pertenecen a otros integrantes: se leen como referencia y se dejan intactos.
- Pregunta antes de añadir dependencias o de tocar archivos compartidos de la raíz, como `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.gitignore` o `README.md`.
- Trabaja en una rama y abre un pull request contra `main`. Los commits siguen el formato `tipo(patient-portal): descripción`, en inglés.

## Contrato con la API

- La fuente del contrato son `docs/api-*.md`. Los tipos de `lib/api/` y las respuestas de `mocks/` coinciden con esos documentos en rutas, formas, enums y códigos de error.
- Toda llamada a la API sale del servidor de Next. El JWT vive en una cookie `HttpOnly` y queda fuera del código del navegador.
- Las escrituras sobre una solicitud envían su `version`. Ante un `409`, vuelve a leer la solicitud antes de reintentar.
- Si el portal necesita algo que el contrato no ofrece, repórtalo en lugar de simularlo con campos inventados.

## Convenciones

- Carpetas y código en inglés, con los nombres de dominio de la API. Textos para el paciente y documentación en español.
- `app/` compone rutas. La lógica de cada dominio vive en `features/` y lo transversal en `lib/`.
- El servidor de desarrollo usa el puerto 5173.
