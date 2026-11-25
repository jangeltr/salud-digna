# Portal del paciente

@../../AGENTS.md

Las instrucciones anteriores valen para todo el monorepo. Lo que sigue aplica solo a `apps/patient-portal/`.

## Contexto

Sitio web con Next.js, TypeScript y Tailwind. Las decisiones vigentes y sus motivos están en `apps/patient-portal/docs/decisions.md`. Léelo antes de cambiar la sesión, el canal, las interfaces o los adaptadores, y actualízalo en el mismo cambio si una decisión cambia.

Desde el 2026-11-24 el portal es solo web. El proyecto cambió de arquitectura: el portal simula el canal Web existente y habla con dos servicios, la API general y el orquestador. Por eso se retiró la PWA instalable que tuvo hasta esa fecha. Su rastro está en la sección «Decisiones retiradas» de ese documento.

- Deja fuera el manifiesto, el service worker, los iconos de instalación y cualquier interfaz para un modo instalado.
- `REQUESTS_BACKEND` elige quién registra los trámites: `legacy`, por defecto, usa `lib/adapters/legacy-requests` sobre la API actual; `orchestrator` usa `lib/adapters/orchestrator`. El comportamiento del modo heredado no cambia.
- El contrato del orquestador está en `apps/orchestrator/docs/`. Lo que no cubre se oculta: no se guarda en el portal ni se copia a la API general.

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
- Cada adaptador del trámite declara sus capacidades. Las pantallas muestran solo lo que declara `requestCapabilities` y cada acción lo comprueba otra vez en el servidor.
- La clave del canal y los permisos de trámite del orquestador son secretos: quedan fuera de logs, errores, respuestas, cookies y disco. Los permisos viven solo en memoria.
- Un código de continuidad es una credencial de un solo uso. Se muestra al paciente en la respuesta de la acción y nada más: no viaja en la URL ni se guarda en el navegador, en el registro o en un log.
- En modo orquestador, toda lectura o escritura de un trámite comprueba antes que pertenece al paciente de la sesión. Con `PATIENT_IDENTITY_MODE=none`, en el registro del canal Web. Con `assertion`, pidiendo el permiso con la acreditación de esa sesión: el portal nunca usa un identificador de trámite del navegador sin ese paso.
- La acreditación del paciente es un secreto, como la clave del canal: vive solo en memoria y queda fuera del navegador, del registro de archivo y de los logs. Si falta, no se crea nada: nunca se recurre a la creación anónima.
- Los textos para el paciente nombran como canales la app móvil y Call Center. WhatsApp está fuera del MVP desde el 2026-11-24.
- El contrato de la API general es `docs/openapi.json`. Léelo en su ubicación, sin copiarlo al portal. `lib/adapters/` y `mocks/` usan solo operaciones y propiedades de ese archivo.
- Toda llamada a un servicio sale del servidor de Next. El JWT vive en una cookie `HttpOnly` y queda fuera del código del navegador.
- Cada página nueva de `(account)` o `(booking)` llama a `requireAccount()` y registra su prefijo en `lib/session/routes.ts`.
- `/`, `/estudios`, `/clinicas` y `/estudios/[id]` se sirven desde caché: no deben leer cookies, cabeceras ni la URL en el servidor. La búsqueda y los filtros van en `/estudios/buscar` y `/clinicas/buscar`.
- El portal envía una política de contenido con un nonce por petición, escrita en `proxy.ts`, salvo en esas cuatro páginas, que usan la variante sin nonce. Evita los scripts y estilos en línea y los recursos de otros orígenes; si hace falta alguno, actualiza la política en el mismo cambio.
- El estado entre peticiones va detrás de las interfaces de `lib/state/ports.ts`; `lib/composition.ts` elige la implementación.
- `next build` llama a la API general para generar el catálogo. En las pruebas, compila con `API_BASE_URL` apuntando a la API simulada: `.env.local` apunta al servicio desplegado.
- Los límites propios están en `lib/session/limits.ts`. La IP del cliente sale solo de la cabecera `X-Real-IP` que escribe el proxy, nunca de otra cabecera del navegador.
- `REGISTRATION_ENABLED` y `FORWARD_CLIENT_IP` se leen en el servidor y admiten solo `true` o `false`. La segunda sigue apagada hasta acordarla con el equipo de la API.
- Las pruebas locales usan un puerto distinto de 5173 y servicios simulados. Contra servicios desplegados, solo con autorización y contando cada llamada a registro y acceso.
- Las suites y los simuladores viven en `tests/` y se ejecutan con `pnpm test` y sus grupos. Solo usan Node y lo instalado, credenciales sintéticas generadas en cada ejecución y carpetas temporales. Una suite nueva sigue esas reglas y se documenta en la sección «Pruebas» del README.
- Si el portal necesita algo que el contrato no ofrece, repórtalo en lugar de simularlo con campos inventados.

## Convenciones

- Carpetas y código en inglés, con los nombres de dominio de la API. Textos para el paciente y documentación en español. Los segmentos de URL bajo `app/` van en español y sin acentos.
- `app/` compone rutas. La lógica de cada dominio vive en `features/` y lo transversal en `lib/`.
- El servidor de desarrollo usa el puerto 5173.
