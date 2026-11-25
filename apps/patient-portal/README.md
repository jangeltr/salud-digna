# Portal del paciente

Sitio web del paciente de Salud Digna para el Hackatec. Es un prototipo con datos sintéticos: no es el sitio oficial. Está hecho con Next.js, TypeScript y Tailwind CSS.

## Índice

1. [Qué es el portal](#qué-es-el-portal)
2. [Requisitos](#requisitos)
3. [Arrancar en local desde un clon limpio](#arrancar-en-local-desde-un-clon-limpio)
4. [Cuenta de paciente y clave de canal en local](#cuenta-de-paciente-y-clave-de-canal-en-local)
5. [Variables de entorno](#variables-de-entorno)
6. [Modos](#modos)
7. [Pruebas](#pruebas)
8. [Seguridad](#seguridad)
9. [Arrancar en producción](#arrancar-en-producción)
10. [Lista de publicación](#lista-de-publicación)
11. [Límites propios del portal](#límites-propios-del-portal)
12. [Limitaciones conocidas](#limitaciones-conocidas)
13. [Más documentación](#más-documentación)

## Qué es el portal

Es el **canal Web** del recorrido omnicanal. Los canales del MVP son este portal, la app móvil nativa, Call Center y Administración. WhatsApp quedó fuera del MVP el 2026-11-24.

El portal habla con dos servicios, cada uno con su propia base de datos, y **siempre desde su servidor**: el navegador del paciente solo habla con el portal.

| Servicio | Para qué | Contrato |
| --- | --- | --- |
| API general | Acceso, perfil del paciente y catálogo de estudios y clínicas. En el modo heredado, también los trámites. | [`docs/openapi.json`](../../docs/openapi.json) |
| Orquestador | Trámites, eventos, contexto, historial, permisos y códigos de continuidad entre canales. | [`apps/orchestrator/docs/`](../orchestrator/docs/) |

Dentro del portal, las páginas y acciones solo conocen el modelo y las interfaces de `lib/domain`. Los adaptadores de `lib/adapters` traducen cada servicio, y `lib/composition.ts` decide cuál se usa según los [modos](#modos). Las decisiones y sus motivos están en [docs/decisions.md](docs/decisions.md).

## Requisitos

- **Node.js 24**: el monorepo fija `"node": "24.x"` en `engines`.
- **pnpm 11.28.11**: fijado en `packageManager` del `package.json` de la raíz.
- Git y acceso al repositorio.
- Para levantar los servicios en local: PostgreSQL 17, como indica el [README de la raíz](../../README.md).

Para probar el portal no hace falta nada de lo anterior salvo Node y pnpm: las pruebas traen sus propios servicios simulados. Ver [Pruebas](#pruebas).

## Arrancar en local desde un clon limpio

Todos los comandos se ejecutan desde la raíz del monorepo.

**1. Instalar dependencias.**

```sh
pnpm install --frozen-lockfile
```

**2. Levantar la API general.** Sigue el [README de la raíz](../../README.md), secciones «Entorno e instalación inicial» y «Catálogos de demostración», y [docs/development.md](../../docs/development.md) para la base de datos. Con los valores del ejemplo, la API queda en `http://127.0.0.1:3000` y su prefijo es `/api/v1`. Carga los catálogos de demostración para tener estudios y clínicas.

**3. Configurar el portal.**

```sh
cp apps/patient-portal/.env.example apps/patient-portal/.env.local
```

En `.env.local`, como mínimo:

```sh
API_BASE_URL=http://127.0.0.1:3000/api/v1
```

Con eso el portal arranca en el modo heredado, que solo necesita la API general. `.env.local` queda fuera de Git.

**4. Arrancar el portal.**

```sh
pnpm --filter @salud-digna/patient-portal dev
```

El portal queda en `http://127.0.0.1:5173`. En desarrollo el registro está encendido y no se envía `Strict-Transport-Security`. `pnpm --filter @salud-digna/patient-portal check` comprueba los tipos.

**5. Crear una cuenta de paciente.** Abre `/registro` en el portal. Ver la sección siguiente.

**6. Opcional: el modo orquestador.** Levanta el orquestador según [su README](../orchestrator/README.md): escucha en `http://127.0.0.1:3300`. Obtén una clave de canal, como se explica abajo, y añade a `.env.local`:

```sh
REQUESTS_BACKEND=orchestrator
ORCHESTRATOR_BASE_URL=http://127.0.0.1:3300/api/v1
ORCHESTRATOR_API_KEY=<clave del canal Web, entregada por quien opera el orquestador>
```

Reinicia el servidor de desarrollo para que lea los cambios.

## Cuenta de paciente y clave de canal en local

Este repositorio no contiene credenciales y no debe contenerlas.

**Cuenta de paciente sintética.** El registro público de la API general crea cuentas con el rol `PATIENT`: `POST /api/v1/auth/register`, descrito en [docs/api-auth.md](../../docs/api-auth.md), sección «Registro».

- En local, el portal lo ofrece en `/registro`, encendido en desarrollo.
- Usa un correo de un dominio reservado para ejemplos, como `example.com` o `example.test`, y una contraseña que no uses en ningún otro sitio.
- La API no tiene una carga de pacientes de demostración: solo carga catálogos (`catalogs:seed-demo`) y crea cuentas de administrador y de asesor por CLI.
- Para la demostración sobre servicios desplegados, la cuenta la entrega el equipo de backend por un canal privado. El registro está apagado en producción.

**Clave de canal del orquestador.** La emite un operador con la utilidad `auth:create-channel-credential`, descrita en [el README del orquestador](../orchestrator/README.md), sección «Credenciales de canal».

- El portal necesita los dos scopes, `EVENTS_PUBLISH` y `JOURNEYS_READ`, porque emitir un código de continuidad exige ambos: se repite `--scope`.
- La utilidad entrega el valor una sola vez por la salida estándar. La clave vence a los 30 días.
- **No documentado:** la utilidad exige que el canal, por ejemplo `demo-web`, ya exista activo, registrado y aprobado en la base del orquestador. Ningún documento del repositorio explica cómo darlo de alta en local. Hay que pedirlo al equipo del orquestador.
- La preparación de la base del orquestador sí está documentada en su README: usuario `salud_digna_orchestrator_app`, base `salud_digna_orchestrator` y sección «Prisma».

**Dónde se guardan.** En desarrollo, en `apps/patient-portal/.env.local`. En producción, en la configuración privada del servicio. Nunca en Git, en el navegador, en capturas ni en chats.

## Variables de entorno

Todas las lee solo el servidor de Next. Ninguna lleva el prefijo `NEXT_PUBLIC_`, así que ninguna llega al navegador. [`.env.example`](.env.example) lista los nombres, sin valores.

| Variable | Propósito | Valor por defecto | Obligatoria |
| --- | --- | --- | --- |
| `API_BASE_URL` | URL base de la API general, con `/api/v1`. Debe usar `https`, salvo en `localhost` y `127.0.0.1`. | Ninguno | Sí |
| `REQUESTS_BACKEND` | Quién registra los trámites: `legacy` u `orchestrator`. Ver [Modos](#modos). | `legacy` | No |
| `ORCHESTRATOR_BASE_URL` | URL base del orquestador, con `/api/v1`. Mismas reglas que `API_BASE_URL`. | Ninguno | Sí, con `orchestrator` |
| `ORCHESTRATOR_API_KEY` | Clave del canal Web, con la forma `<keyId>.<secret>` y sin el prefijo `Bearer`. Secreto. | Ninguno | Sí, con `orchestrator` |
| `PORTAL_DATA_DIR` | Carpeta del registro del canal Web: qué trámites tiene cada cuenta. Solo se usa con `orchestrator` y `PATIENT_IDENTITY_MODE=none`. | `.data/` dentro del portal | No. En producción, recomendada fuera del código |
| `REGISTRATION_ENABLED` | `true` o `false`. Decide si existe `/registro`. | Apagado en producción, encendido en desarrollo | No |
| `FORWARD_CLIENT_IP` | `true` o `false`. Envía a la API general la IP del paciente en `X-Portal-Client-IP`. Debe seguir apagada hasta que el equipo de la API confirme que confía en esa cabecera solo desde el servidor del portal. | `false` | No |
| `CATALOG_CACHE_SECONDS` | Segundos que dura en caché el catálogo, de 1 a 86 400. **Se lee al compilar**: cambiarla exige volver a compilar. | `300` | No |
| `PATIENT_IDENTITY_MODE` | `none` o `assertion`. Ver [Modos](#modos). | `none` | No |
| `PATIENT_ASSERTION_CHANNEL_KEY` | Credencial del canal Web ante el emisor de acreditaciones de la API central, 32 bytes en base64url. Distinta de `ORCHESTRATOR_API_KEY`. Secreto. | Ninguno | Sí, con `assertion` |

Un valor ausente o inválido detiene el arranque: el servidor registra qué variable falla, sin mostrar su valor, y responde `500` a todo. Al arrancar bien, registra los modos activos y el identificador público de la clave del canal, nunca su secreto.

## Modos

**`REQUESTS_BACKEND`: quién registra los trámites.**

| Valor | Qué hace |
| --- | --- |
| `legacy` | Los trámites viven en la API general, operaciones `/requests`. Incluye horario, nota, pausa, confirmación de la cita y código de asistencia. No habla con el orquestador. |
| `orchestrator` | Los trámites viven en el orquestador. El paciente elige estudio y clínica y envía el trámite a confirmación; también puede cancelar, ver el historial y emitir o canjear códigos de continuidad. El contrato del orquestador no admite fecha, nota ni pausa, y el portal las oculta. |

**`PATIENT_IDENTITY_MODE`: cómo se identifica al paciente ante el orquestador.** Solo vale con `REQUESTS_BACKEND=orchestrator`.

| Valor | Qué hace |
| --- | --- |
| `none` | Sin acreditación. El portal recuerda qué trámites creó cada cuenta en su registro del canal Web, en `PORTAL_DATA_DIR`. Cada trámite tiene un permiso de cinco minutos. Para cambiar de canal se usa un código de continuidad. |
| `assertion` | Cada trámite se crea y se lista con la acreditación institucional del paciente. `/continuar` y `/mi-espacio` muestran sus trámites de cualquier canal, y el permiso se renueva solo. El código queda como alternativa plegada. Si no hay acreditación, no se crea ni se lee nada. |

**Cuál usar hoy:** `REQUESTS_BACKEND=orchestrator` con `PATIENT_IDENTITY_MODE=assertion` y `PATIENT_ASSERTION_CHANNEL_KEY`, contra la API central y el orquestador que ya publican el emisor de acreditaciones y `access-grants` (`main` en `17c9b27`). Así el paciente recupera sus trámites en cualquier canal, sin código. Si el emisor no responde, el portal muestra «No pudimos verificar tu identidad» y no crea ningún trámite. `PATIENT_IDENTITY_MODE=none`, con códigos de continuidad, sigue disponible como alternativa. El detalle está en [docs/decisions.md](docs/decisions.md), «Continuidad identificada» y «Emisor conectado».

## Pruebas

Las pruebas viven en [`tests/`](tests/) y solo usan Node y lo que ya instaló el proyecto. Compilan el portal en modo producción, lo arrancan con `next start` y lo recorren contra una API general y un orquestador simulados. Ninguna prueba llama a servicios desplegados.

Desde la raíz del monorepo:

```sh
pnpm --filter @salud-digna/patient-portal test                 # todo, unos 12 minutos
pnpm --filter @salud-digna/patient-portal test:legacy          # modo heredado
pnpm --filter @salud-digna/patient-portal test:orchestrator    # modo orquestador, sin acreditación
pnpm --filter @salud-digna/patient-portal test:identity        # continuidad identificada y arranques inválidos
pnpm --filter @salud-digna/patient-portal test:publication     # registro, IP del cliente, límites y cabeceras
pnpm --filter @salud-digna/patient-portal test:load            # carga, en los dos modos
```

Cada script acepta `--sin-compilar`, para reutilizar la última compilación de pruebas, y `--sin-navegador`. Por ejemplo, `pnpm --filter @salud-digna/patient-portal test:legacy --sin-compilar`. Con `VERBOSE=1` se ve cada comprobación.

**Qué garantiza el lanzador**, `tests/run.mjs`:

- **Puertos.** Usa el 5183 para el portal, el 4010 para la API general simulada, el 4011 para el orquestador simulado y el 9333 para el navegador.
  - Se cambian con `TEST_PORTAL_PORT`, `TEST_API_PORT`, `TEST_ORCHESTRATOR_PORT` y `TEST_BROWSER_PORT`.
  - Nunca usa el 5173, que es del servidor de desarrollo.
  - Si un puerto está ocupado, se detiene sin tocar el proceso que lo ocupa.
- **Procesos.** Solo cierra los procesos que arrancó.
- **Variables.** Fija todas las que lee el portal, así nunca se usan los valores de `.env.local`. Se niega a arrancar si la API general o el orquestador no apuntan a `127.0.0.1`.
- **Credenciales.** Cuentas, contraseña, tokens, claves de canal, credencial del emisor de acreditaciones y clave de firma son sintéticos. Se generan en cada ejecución a partir de un valor aleatorio que no se escribe en disco ni en la salida. Los correos son del dominio reservado `example.com`.
- **Archivos.** Las suites no escriben en `.data` ni en `.env.local`. El registro del canal Web, los registros del servidor, las capturas y los perfiles del navegador van a una carpeta temporal que se borra al terminar. La compilación escribe en `.next`, como `next build`.
- **Navegador.** Las pruebas de navegador usan Chrome o Chromium sin interfaz, buscado en las rutas habituales o en `CHROME_PATH`. Si no lo encuentra, las omite con un aviso, sin fallar.

**Qué cubre cada suite**:

| Grupo | Suite | Qué comprueba |
| --- | --- | --- |
| heredado | `suites/flow.mjs` | Trámite guiado contra la API general: pasos, horarios, nota, vuelta atrás, selección sin cambios, conflicto de versión, pausa, código de asistencia, confirmación, creación incierta, errores, trámites ajenos y sesión vencida |
| heredado y orquestador | `suites/shell.mjs` | Sin rastro de la PWA, encabezado único con y sin sesión, aviso de continuidad |
| heredado y orquestador | `suites/cache.mjs` | Catálogo en caché, cookie indicadora, caché de sesión de 60 segundos e índice del catálogo |
| heredado y orquestador | `browser/shell.mjs` | Encabezado y carcasa en un navegador real, en teléfono y escritorio |
| orquestador | `suites/capture.mjs` | Paso previo: guarda los formularios que el modo orquestador oculta |
| orquestador | `suites/orchestrator.mjs` | Contrato del orquestador: creación idempotente, eventos, dos casos de 409, historial, tiempos de espera, 401 y 403, permisos vencidos, códigos de continuidad, trámites ajenos y secretos |
| orquestador | `suites/orchestrator.mjs reinicio` | Tras reiniciar el portal: el registro del canal Web se conserva, los permisos se pierden y no hay secretos en disco ni en el registro del servidor |
| orquestador | `browser/orchestrator.mjs` | Revisión, continuidad, cancelación, historial y canje en un navegador real |
| identidad | `suites/identity.mjs central` y `no-disponible` | Emisor de la API central con su contrato: petición exacta, caché por sesión y renovación según `exp`. Paciente nuevo sin vínculo, creación y listado con acreditación, `access-grants`, dos pacientes aislados, permiso renovado, trámite de otro canal, fallo de acreditación sin creación anónima, emisor que no responde y nada secreto en HTML, cookies, URL ni registro |
| arranque | en `run.mjs` | Cuatro configuraciones inválidas de identidad que deben impedir el arranque, sin secretos en el registro |
| publicacion | `suites/publication.mjs abierto` y `cerrado` | Registro controlado, IP del cliente, cabeceras de seguridad, página de error, sesión vencida, límites de acceso y topes de trámites y códigos |
| publicacion | `browser/publication.mjs` | La política de contenido no rompe nada en un navegador real |
| carga | `suites/load.mjs` | Peticiones por segundo, latencias y llamadas a los servicios por petición en cinco escenarios. Solo exige que todas las respuestas sean 200 |

**Fallos conocidos en modo orquestador.** `shell.mjs` da 39 de 41 en ese modo. Fallan «otro canal conocido: se nombra WhatsApp» y «canal sin nombre en el portal: se muestra «otro canal»». El aviso «Dejaste este trámite en…» sale del canal de la última actividad que informa la API general, y en ese modo el trámite vive en el orquestador. El lanzador los marca como «fallos conocidos» y no hace fallar la ejecución; cualquier otro fallo, sí. `flow.mjs` no se ejecuta en modo orquestador: recorre las operaciones `/requests` de la API general, y `orchestrator.mjs` cubre ese modo.


## Seguridad

**Dónde vive cada secreto.**

| Secreto | Dónde vive | Nunca |
| --- | --- | --- |
| Clave del canal Web del orquestador | Variable del servidor, `ORCHESTRATOR_API_KEY` | Navegador, registros, errores, disco |
| Token de sesión de la API general | Cookie `HttpOnly` y `SameSite=Lax`: `__Host-portal-session` y `Secure` en producción, `portal-session` en desarrollo | Código del navegador, URL, registros |
| Permisos de trámite del orquestador | Memoria del proceso, por cuenta y trámite | Navegador, registro del canal Web, disco, registros |
| Credencial del canal Web ante el emisor de acreditaciones | Variable del servidor, `PATIENT_ASSERTION_CHANNEL_KEY` | Navegador, registros, errores, disco |
| Acreditaciones del paciente | Memoria del proceso, por sesión, hasta su `exp` y como mucho cinco minutos | Navegador, registro del canal Web, disco, registros |
| Claves de idempotencia | Memoria del proceso, mientras una creación tenga resultado incierto | Navegador, registros |
| Código de continuidad | Solo en la respuesta de la acción que lo emite | URL, cookies, almacenamiento del navegador, registro del canal Web, registros |

**Qué llega al navegador:** el HTML de cada página y una cookie indicadora con el valor `1`, `__Host-portal-signed-in` en producción y `portal-signed-in` en desarrollo, que no lleva ningún dato y no abre nada por sí sola. Todas las llamadas a servicios salen del servidor de Next.

**Otras protecciones.**

- El registro del canal Web guarda solo identificadores de cuenta y de trámite y fechas.
- Los registros del servidor nombran método, ruta del contrato y código de respuesta, nunca identificadores, cuerpos ni credenciales.
- Política de contenido con un nonce por petición, salvo en las cuatro páginas del catálogo en caché. Además, `Strict-Transport-Security`, `Permissions-Policy` restrictiva, `X-Frame-Options: DENY` y `noindex`.
- La IP del cliente sale solo de `X-Real-IP`, la cabecera que escribe el proxy.

## Arrancar en producción

```sh
pnpm install --frozen-lockfile
pnpm --filter @salud-digna/patient-portal build
pnpm --filter @salud-digna/patient-portal exec next start --hostname 127.0.0.1 --port <puerto>
```

`next build` genera el listado de estudios y el de clínicas, así que llama a la API general con el `API_BASE_URL` del entorno de compilación. Si no la alcanza, la compilación termina igual y esas páginas se generan en cada petición: el catálogo funciona, pero sin servirse desde caché.

El script `start` hace lo mismo en el puerto 5173. El proceso debe escuchar solo en `127.0.0.1` y recibir el tráfico a través del proxy. Las variables se inyectan desde la configuración privada del servicio.

El proxy debe terminar TLS y sobrescribir estas cabeceras, igual que el de la API general:

```nginx
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $remote_addr;
proxy_set_header X-Forwarded-Host $host;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_pass http://127.0.0.1:<puerto>;
```

- Sin el `Host` correcto, el portal rechaza todos los formularios con `403`.
- `X-Real-IP` es la única fuente de la IP del cliente. Si el proxy no la envía, el límite de acceso por IP no se aplica y el servidor lo avisa una vez en su registro. Los demás límites siguen activos.

### Catálogo desde Nginx

`/`, `/estudios`, `/clinicas` y `/estudios/<id>` llegan con `Cache-Control: public, max-age=N, s-maxage=N`. Nginx puede servirlas sin pasar por Next. Las demás rutas responden `private, no-store` y Nginx no las guarda. La clave incluye la consulta y la cabecera `rsc`, como pide la guía de Next sobre CDN:

```nginx
proxy_cache_path /var/cache/nginx/portal keys_zone=portal:10m max_size=200m inactive=1h;

location / {
    proxy_cache portal;
    proxy_cache_key "$scheme$host$request_uri$http_rsc";
    proxy_cache_use_stale error timeout updating;
    # …las cabeceras proxy_set_header y proxy_pass de arriba
}
```

Tras cada despliegue hay que vaciar `/var/cache/nginx/portal`: las páginas guardadas apuntan a los archivos de la compilación anterior.

## Lista de publicación

1. Compilar desde una revisión identificada y con el lockfile.
2. Una sola instancia del portal. Registro, permisos, límites y claves pendientes viven en el proceso. Lo que haría falta para varias está en [docs/decisions.md](docs/decisions.md), «Rendimiento y caché».
3. Variables en la configuración privada del servicio. `REQUESTS_BACKEND=orchestrator` para la demostración.
4. `PORTAL_DATA_DIR` fuera de la carpeta del código, del usuario del servicio, con permisos `0700`, e incluida en los respaldos.
5. Proxy con TLS y las cabeceras de arriba. El puerto del portal no debe ser accesible desde fuera.
6. `REGISTRATION_ENABLED` sin definir o en `false`, salvo que se quiera abrir el registro.
7. `FORWARD_CLIENT_IP` sin definir, hasta acordarla con el equipo de la API.
8. Compilar con acceso a la API general, para que el catálogo se sirva desde caché, y vaciar la caché de Nginx o de la CDN tras cada despliegue.
9. Comprobar tras el despliegue: `/robots.txt` responde `Disallow: /`, `/registro` responde `404`, un acceso funciona y la respuesta trae `Strict-Transport-Security` y `Content-Security-Policy`.

Lo que sigue pendiente antes de abrir el portal a público general está en [docs/decisions.md](docs/decisions.md), sección «Publicación del portal».

## Límites propios del portal

Viven en memoria y se vacían al reiniciar.

| Límite | Valor |
| --- | --- |
| Acceso, por correo | Tres fallos libres. Después, esperas de 30 segundos, 1, 2, 5 y 15 minutos. |
| Acceso, por IP del cliente | Cinco fallos libres y las mismas esperas. |
| Trámites empezados | 20 por paciente y hora. |
| Códigos de continuidad generados | 30 por paciente y hora. |
| Canjes fallidos de un código | 5 por paciente cada 10 minutos. |

## Limitaciones conocidas

- **Una sola instancia.** Permisos, acreditaciones, límites, claves pendientes y caché de sesión viven en memoria, y el registro del canal Web en un archivo local. Al reiniciar se pierden los permisos, y dos instancias no comparten nada. Qué haría falta está en [docs/decisions.md](docs/decisions.md), «Rendimiento y caché».
- **Permiso de cinco minutos sin renovación** en el modo `none`. Pasado ese tiempo, el portal muestra «Necesita un permiso nuevo» y solo recupera el trámite con un código emitido por otro canal. El portal no puede canjear un código que él mismo generó.
- **Sin fecha ni cita en el orquestador.** Su contrato no admite fecha ni cierre con cita: en modo orquestador el trámite termina en «Pendiente de confirmación» y nunca llega a completado.
- **Continuidad identificada.** Necesita que la API central y el orquestador desplegados incluyan `17c9b27` de `main`. Con un orquestador anterior, `access-grants` no existe y el portal no puede abrir los trámites. El consentimiento para que un asesor recupere los trámites no está en el portal.
- **Lista vacía ante una acreditación rechazada.** El orquestador responde igual a una identidad sin trámites que a una acreditación inválida. El portal muestra la lista vacía, y el error aparece al intentar crear.
- **Límite de acceso compartido.** La API general limita el acceso por IP, y todas las peticiones le llegan desde el servidor del portal. Unos pocos fallos pueden bloquear el acceso a todos mientras `FORWARD_CLIENT_IP` siga apagada.
- **Catálogo en caché.** Un cambio en estudios o clínicas tarda hasta `CATALOG_CACHE_SECONDS` en verse, más lo que guarde el proxy.
- **Error de creación en producción sin resolver.** El portal publicado responde «No pudimos crear el trámite» al crear un trámite. El diagnóstico y las comprobaciones pendientes están en [docs/estado.md](docs/estado.md).

## Más documentación

- [Guion de la demostración](docs/demo.md)
- [Estado del portal, para retomar el trabajo](docs/estado.md)
- [Decisiones y sus motivos](docs/decisions.md)
- [Contrato de continuidad identificada](docs/contratos/continuidad-identificada.md)
- [Sección del portal para el README de la raíz](docs/readme-raiz-portal.md)
- [Instrucciones para agentes del portal](CLAUDE.md)
