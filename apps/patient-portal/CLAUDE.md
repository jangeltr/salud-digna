# Portal del paciente

@../../AGENTS.md

Las instrucciones anteriores valen para todo el monorepo. Lo que sigue aplica solo a `apps/patient-portal/`.

## Contexto

App Next.js, TypeScript y Tailwind que funciona como sitio web y como PWA instalable. Las decisiones vigentes y sus motivos están en `apps/patient-portal/docs/decisions.md`. Léelo antes de cambiar la sesión, el canal o el cliente de API, y actualízalo en el mismo cambio si una decisión cambia.

## Alcance

- Modifica solo `apps/patient-portal/`. El resto del repositorio pertenece a otros integrantes o es compartido: se lee como referencia y se deja intacto.
- Pregunta antes de añadir dependencias. Instalarlas modifica `pnpm-lock.yaml`, que está fuera del portal.
- Trabaja en una rama y abre un pull request contra `main`. Los commits siguen el formato `tipo(patient-portal): descripción`, en inglés.

## Contrato con la API

- El contrato es `docs/openapi.json`. Léelo en su ubicación, sin copiarlo al portal. `lib/api/` y `mocks/` usan solo operaciones y propiedades de ese archivo.
- Toda llamada a la API sale del servidor de Next. El JWT vive en una cookie `HttpOnly` y queda fuera del código del navegador.
- Las escrituras sobre una solicitud envían su `version`. Ante un `409`, vuelve a leer la solicitud antes de reintentar.
- Si el portal necesita algo que el contrato no ofrece, repórtalo en lugar de simularlo con campos inventados.

## Convenciones

- Carpetas y código en inglés, con los nombres de dominio de la API. Textos para el paciente y documentación en español.
- `app/` compone rutas. La lógica de cada dominio vive en `features/` y lo transversal en `lib/`.
- El servidor de desarrollo usa el puerto 5173.
