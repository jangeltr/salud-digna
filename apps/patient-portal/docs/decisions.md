# Decisiones del portal del paciente

`apps/patient-portal/` es la web pública del paciente y también su aplicación móvil. Usa Next.js, TypeScript y Tailwind CSS. Funcionará como sitio web y como PWA instalable.

Este documento registra las decisiones del portal y el estado de la API del que dependen. El estado corresponde al contrato y a las guías publicados en `main` el 2026-11-22. El documento vive junto a la aplicación porque cada equipo mantiene la documentación de la suya, según la [guía de revisión de pull requests](../../../docs/revision-pull-requests.md).

El portal ya tiene su carcasa: identidad, rutas, las dos navegaciones y el manifiesto de la PWA. Las pantallas muestran solo su título. Las llamadas a la API, el control de sesión y el service worker llegarán en cambios posteriores.

## Contrato

El contrato oficial es [`docs/openapi.json`](../../../docs/openapi.json). El portal lo lee en esa ubicación y evita copiarlo. `lib/api` y `mocks/` se rigen por ese archivo.

**Regla.** El portal usa únicamente operaciones y propiedades que figuran en `docs/openapi.json`. Lo que falte se reporta al equipo de API con método, ruta, rol y código HTTP, y queda pendiente en el portal hasta que exista un contrato acordado. Así lo piden [AGENTS.md](../../../AGENTS.md) y la [guía de integración](../../../docs/INTEGRACION-FRONTENDS.md), sección «Inconsistencias y trabajo con agentes».

La URL base de integración es `https://api.salud-digna.app/api/v1` y las rutas del contrato ya incluyen el prefijo `/api/v1`. El contrato documenta también operaciones de simulación y webhooks que dependen de la configuración de cada entorno. Su inclusión no implica que estén habilitadas en el despliegue, según la sección «Flujos y disponibilidad» de la misma guía.

## Estructura

| Ruta | Propósito |
| --- | --- |
| `app/` | Rutas del App Router. Los grupos `(public)`, `(booking)` y `(account)` separan las páginas sin sesión, el flujo de agendamiento y el área personal. `api/` contiene los manejadores de servidor del portal. |
| `features/` | Un módulo por dominio: `catalog`, `requests`, `appointments`, `auth`, `identity` y `help`. |
| `lib/` | Código transversal: `api` para el cliente de la API, `channel` para el modo instalado, `session` para la sesión del paciente y `brand.ts` con el nombre y los colores de la aplicación. |
| `components/` | Interfaz compartida y las dos navegaciones, la del sitio web y la de la app instalada. |
| `mocks/` | Respuestas simuladas de operaciones del contrato. |
| `public/` | Manifiesto de la PWA e iconos. |
| `docs/` | Este documento. |

## Idioma y rutas

Los textos visibles y la documentación se escriben en español. El código y las carpetas usan nombres en inglés alineados con los módulos de la API.

La excepción son los segmentos de URL. Van en español y sin acentos porque los ve el paciente, así que las carpetas de ruta bajo `app/` se llaman `estudios`, `clinicas`, `tramite` o `mi-espacio`. Los grupos de rutas quedan fuera de la URL, y `api/` e `icons/` son rutas técnicas: todos siguen en inglés.

| Grupo | Rutas |
| --- | --- |
| `(public)` | `/`, `/estudios`, `/estudios/[id]`, `/clinicas`, `/acceso`, `/registro` |
| `(booking)` | `/tramite/[id]` |
| `(account)` | `/mi-espacio`, `/continuar`, `/citas`, `/citas/[id]`, `/ayuda`, `/perfil` |

Cada ruta muestra por ahora su título y el aviso «Disponible en un paso posterior». Ninguna llama a la API, usa datos de ejemplo ni controla la sesión.

## Base técnica

El portal es el paquete `@salud-digna/patient-portal` del workspace. Usa Node.js 24 y pnpm 11.28.11, fijados en el `package.json` de la raíz. Las versiones se declaran exactas, sin rangos, y resuelven a las mismas que usan las otras aplicaciones Next.js del monorepo.

| Paquete | Versión |
| --- | --- |
| `next` | 16.4.6 |
| `react` y `react-dom` | 19.3.1 |
| `typescript` | 5.9.3 |
| `tailwindcss` y `@tailwindcss/postcss` | 4.3.5 |
| `@types/node` | 24.19.2 |
| `@types/react` y `@types/react-dom` | 19.3.0 |

Los scripts siguen el patrón de las otras aplicaciones. Se ejecutan desde la raíz con `pnpm --filter @salud-digna/patient-portal <script>`.

| Script | Comando | Uso |
| --- | --- | --- |
| `dev` | `next dev --hostname 127.0.0.1 --port 5173` | Servidor de desarrollo. |
| `build` | `next build` | Compilación de producción. La ejecuta también la revisión de integración. |
| `start` | `next start --hostname 127.0.0.1 --port 5173` | Sirve la compilación. |
| `check` | `next typegen && tsc --noEmit` | Genera los tipos de rutas y comprueba TypeScript en modo estricto. |

Configuración de `next.config.ts`:

- `agentRules: false` evita que `next dev` escriba un bloque administrado en un `AGENTS.md` del portal.
- `poweredByHeader: false` retira la cabecera `X-Powered-By`.
- Todas las rutas responden con `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` y `X-Frame-Options: DENY`.

Tailwind CSS 4 se carga con `@tailwindcss/postcss` y `@import "tailwindcss"` en `app/globals.css`. El `.gitignore` local excluye `.next/` y `next-env.d.ts`. El alias `@/*` de `tsconfig.json` apunta a la raíz del portal.

`next dev` guarda tipos de rutas en `.next/dev/`. Si `check` o `build` fallan por una ruta que ya se movió o se borró, elimina la carpeta `.next/` y repite.

## Decisiones

### La app móvil es la PWA del portal

El canal móvil se cubre instalando este mismo portal como PWA. El repositorio no tendrá un proyecto móvil aparte. Esto resuelve la ubicación de la aplicación móvil que el README dejaba por definir.

### Canal de origen

La API determina el canal en el servidor y registra como `WEB` toda petición autenticada con JWT, incluidas las de una app. El cliente carece de un campo o una cabecera para declararlo. Consulta el [contrato de solicitudes](../../../docs/api-requests.md), secciones «Actualización parcial» y «Canales, acceso y trazabilidad».

El portal detecta con `display-mode: standalone` si corre instalado y usa esa señal solo para su propia interfaz. Hoy lo resuelve con CSS, mediante la variante `standalone:` de `app/globals.css`. `lib/channel` queda reservado para cuando haga falta leer el modo desde el código. Sus acciones quedan registradas como `WEB` en ambos modos. Que la API distinga `MOBILE` queda como sugerencia pendiente del equipo de backend.

### Identidad

La aplicación se llama «Portal del Paciente» y su nombre corto es «Paciente». Usa una paleta propia, definida como variables CSS en `app/globals.css`, y prescinde del verde y del logotipo de Salud Digna. Todas las pantallas muestran una franja fija con el texto «Prototipo Hackatec · datos sintéticos · no es el sitio oficial de Salud Digna».

| Uso | Variables | Contraste |
| --- | --- | --- |
| Texto principal | `--ink` sobre `--canvas` o `--surface` | 16.9:1 y 15.7:1 |
| Texto secundario | `--muted` sobre `--canvas` o `--surface` | 7.3:1 y 6.8:1 |
| Primario azul índigo | `--brand` sobre `--canvas`, y el inverso | 9.9:1 |
| Primario sobre su tono suave | `--brand` sobre `--brand-soft` | 8.1:1 |
| Éxito | `--success` sobre `--canvas` o `--success-soft` | 5.5:1 y 4.9:1 |
| Aviso | `--warning` sobre `--canvas` o `--warning-soft` | 6.9:1 y 6.2:1 |
| Error | `--danger` sobre `--canvas` o `--danger-soft` | 6.5:1 y 5.3:1 |

Todas las combinaciones superan el 4.5:1 del nivel AA. El portal usa las fuentes del sistema y carga cero fuentes, scripts o imágenes de terceros.

### Navegación

El portal tiene dos navegaciones y ambas están siempre en el HTML. En el navegador se ve el encabezado con Estudios, Clínicas y Acceso. En modo instalado se oculta ese menú y aparece una barra inferior con Inicio, que lleva a `/mi-espacio`, Continuar, Citas y Ayuda. El cambio depende solo de la media query `display-mode: standalone`, sin JavaScript.

El diseño parte del móvil. Las barras respetan las áreas seguras con `env(safe-area-inset-*)` y `viewport-fit=cover`, y los enlaces miden al menos 44 px de alto. Cada `nav` lleva su etiqueta, hay un enlace «Saltar al contenido» y el foco es visible. El enlace de la página abierta lleva `aria-current="page"`, y el de su sección lleva `aria-current="true"` cuando se está en una página interior. `components/nav-link.tsx` es un Client Component porque `usePathname` lo exige.

### PWA

`app/manifest.ts` genera el manifiesto, que Next sirve en `/manifest.webmanifest`. Declara `display: standalone`, `start_url: /mi-espacio`, `scope: /`, `lang: es`, el color de tema `#3730a3` y el fondo `#ffffff`.

Los iconos se generan con `ImageResponse` de `next/og`, que forma parte de Next. `app/icons/[file]/route.tsx` produce en la compilación los de 192 y 512 px y uno maskable de 512 px, sin archivos binarios en el repositorio. `app/icon.tsx` y `app/apple-icon.tsx` generan el icono de pestaña y el de iOS con la misma figura.

El portal aún no registra un service worker. Chrome dejó de exigirlo para instalar desde su menú a partir de la versión 108 en Android y la 112 en escritorio, según [su blog para desarrolladores](https://developer.chrome.com/blog/update-install-criteria). Sí hará falta para el uso sin conexión y las notificaciones.

### Sesión

`POST /api/v1/auth/register` crea la cuenta y devuelve la cuenta y el perfil, sin token. Después del registro el portal llama a `POST /api/v1/auth/login` para obtener el JWT. Consulta la [guía pública](../../../docs/frontend-publico.md), sección «Cuenta e identidad».

El token dura `expiresIn` segundos. La API carece de renovación y de una operación de cierre de sesión. Al vencer, el paciente vuelve a iniciar sesión. Cerrar sesión en el portal elimina su cookie, y el token conserva su validez en la API hasta que vence. Consulta la misma sección de la guía pública y el [contrato de autenticación](../../../docs/api-auth.md), sección «Límites del MVP y comprobación local».

Las guías piden enviar `Authorization: Bearer <accessToken>` y omiten dónde guardar el token. El portal lo guarda en una cookie `HttpOnly` de su propio origen. El código del navegador no puede leer el token y nunca llama a la API. El navegador habla con el portal, y el servidor de Next llama a la API con el token de la cookie. Los manejadores de `app/api/` y el cliente de `lib/api` se ejecutan solo en el servidor.

### Confirmación de la cita y ayuda del asesor

El paciente confirma su cita en el portal con `POST /api/v1/requests/{id}/confirm` y la versión vigente de la solicitud. Un reintento compatible recupera la misma cita. Consulta la guía pública, sección «Catálogos, solicitudes y citas».

Si el paciente necesita ayuda, genera un código de asistencia con `POST /api/v1/requests/{id}/assistance-code`, sin cuerpo, y lo entrega al asesor. El código tiene 22 caracteres, vence a los cinco minutos y se consume una vez. Con él, el asesor obtiene un permiso de 30 minutos para consultar la solicitud y confirmarla. Para editar las selecciones, el paciente usa su propia sesión. Consulta la [guía de Call Center](../../../docs/frontend-callcenter.md), sección «Recuperar una atención», y el [contrato de Call Center](../../../docs/api-call-center.md), sección «Emitir y canjear».

### Vinculación de WhatsApp

El paciente inicia la vinculación en el portal. `features/identity` llama a `POST /api/v1/identity/links` con `{"provider":"WHATSAPP"}` y muestra el `linkId` y el `code` de la respuesta. El paciente envía `vincular <linkId> <code>` desde su teléfono al remitente configurado. El desafío vence a los cinco minutos. `GET /api/v1/identity` lista las identidades de la cuenta. El campo `phone` del registro carece de efecto sobre la vinculación.

El recorrido requiere un proveedor de WhatsApp configurado en el entorno y un número de prueba habilitado. Consulta la guía pública, secciones «Cuenta e identidad» y «Demostración Web → WhatsApp → Call Center», y el [contrato de identidad](../../../docs/api-identity.md).

### Historial de la solicitud

La línea de tiempo de `GET /api/v1/requests/{id}/journey` se muestra dentro de `features/requests`, junto a la solicitud a la que pertenece. Consulta el [contrato de Journey](../../../docs/api-journey.md).

### Actualización sin tiempo real

La API carece de tiempo real. El portal consulta el estado por REST a intervalos y compara `version` para detectar cambios hechos desde otro canal. La guía pública indica recargar `GET /api/v1/requests/{id}` al volver a la web, en su sección «Demostración Web → WhatsApp → Call Center».

### Dirección de desarrollo

El portal se sirve en `http://127.0.0.1:5173` durante el desarrollo. El puerto 3000, predeterminado de Next.js, es también el de la API local. El ejemplo de configuración de la API permite `http://localhost:5173`, que es un origen distinto, según [Desarrollo e integración](../../../docs/development.md). El portal prescinde de CORS porque sus llamadas a la API salen del servidor de Next.

## Lo que la API no ofrece

| Función | Estado en la API | Fuente |
| --- | --- | --- |
| Cancelar o reprogramar una cita | Sin operación. | Guía pública, «Catálogos, solicitudes y citas». |
| Cancelar un trámite | Sin operación. El contrato define el estado `CANCELLED` y carece de una operación para cancelar. | `docs/openapi.json`. |
| Disponibilidad de horarios | Los horarios son demostrativos y carecen de verificación de disponibilidad real. | Guía pública, «Catálogos, solicitudes y citas». |
| Edición de perfil | Sin operación. `GET /api/v1/auth/me` solo consulta. | `docs/openapi.json`. |
| Tiempo real | Sin operación ni eventos publicados. | [Arquitectura](../../../docs/architecture.md), «Integración pública». |
| Resultados | Sin operaciones ni estados. `COMPLETED` significa cita confirmada, con paso `CONFIRMED`. | Guía pública, tabla de estados. |

El portal deja estas funciones fuera hasta que exista un contrato acordado.

## Pendientes con el equipo de API

| Pendiente | Efecto en el portal |
| --- | --- |
| Sugerencia: distinguir `MOBILE` de `WEB` | Sin ella, el uso instalado queda registrado como `WEB` y el historial no muestra el cambio entre ambos. |
| Límite de registro e inicio de sesión por IP | Ambas operaciones comparten 10 intentos por IP cada 15 minutos, según el contrato de autenticación. Todas las llamadas llegan desde el servidor del portal, así que los pacientes compartirían ese límite. |
