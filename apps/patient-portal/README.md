# Portal del paciente

Sitio web del paciente de Salud Digna para el Hackatec. Es un prototipo con datos sintéticos: no es el sitio oficial. Está hecho con Next.js, TypeScript y Tailwind CSS, y simula el canal Web del recorrido omnicanal.

El portal habla con dos servicios, siempre desde su servidor:

| Servicio | Para qué | Contrato |
| --- | --- | --- |
| API general | Acceso, perfil del paciente y catálogo de estudios y clínicas. | [`docs/openapi.json`](../../docs/openapi.json) |
| Orquestador | Trámites, historial y códigos de continuidad entre canales. | [`apps/orchestrator/docs/`](../orchestrator/docs/) |

Las decisiones y sus motivos están en [docs/decisions.md](docs/decisions.md).

## Requisitos

- Node.js 24 y pnpm 11, las versiones que fija el monorepo.
- La URL de la API general.
- Para el modo orquestador, la URL del orquestador y una clave de canal con los scopes `EVENTS_PUBLISH` y `JOURNEYS_READ`.
- En producción, un proxy inverso con TLS delante del portal.

## Variables

Todas las lee solo el servidor de Next. Ninguna lleva el prefijo `NEXT_PUBLIC_`, así que ninguna llega al navegador. [`.env.example`](.env.example) lista los nombres.

| Variable | Propósito | Sin valor |
| --- | --- | --- |
| `API_BASE_URL` | URL base de la API general, con `/api/v1`. Debe usar `https`, salvo en `localhost` y `127.0.0.1`. | El portal no arranca. |
| `REQUESTS_BACKEND` | Quién registra los trámites: `legacy`, la API general, u `orchestrator`. | `legacy`. |
| `ORCHESTRATOR_BASE_URL` | URL base del orquestador, con `/api/v1`. Mismas reglas que la anterior. | Obligatoria en modo `orchestrator`. |
| `ORCHESTRATOR_API_KEY` | Clave del canal Web, con la forma `<keyId>.<secret>` y sin el prefijo `Bearer`. Es un secreto. | Obligatoria en modo `orchestrator`. |
| `PORTAL_DATA_DIR` | Carpeta del registro del canal Web: qué trámites tiene cada cuenta. | `.data/` dentro del portal. |
| `REGISTRATION_ENABLED` | `true` o `false`. Decide si existe `/registro`. | Apagado en producción, encendido en desarrollo. |
| `FORWARD_CLIENT_IP` | `true` o `false`. Envía a la API general la IP del paciente en `X-Portal-Client-IP`. | Apagada. |
| `CATALOG_CACHE_SECONDS` | Segundos que dura en caché el catálogo, de 1 a 86 400. **Se lee al compilar**: cambiarla exige volver a compilar. | 300. |
| `PATIENT_IDENTITY_MODE` | `none` o `assertion`. Con `assertion`, cada trámite se crea y se consulta con la acreditación del paciente. Exige `REQUESTS_BACKEND=orchestrator`. | `none`. |
| `PATIENT_ASSERTION_PROVIDER` | `pending` o `simulator`. `pending` falla siempre hasta que exista el emisor de la API central. `simulator` solo arranca con servicios locales. | `pending`. |
| `PATIENT_ASSERTION_SIMULATOR_KEY` | Clave del emisor de simulación, 32 bytes en base64url. Solo para pruebas locales. Es un secreto. | Obligatoria con `simulator`. |

Un valor ausente o inválido detiene el arranque: el servidor registra qué variable falla, sin mostrar su valor, y responde `500` a todo.

`FORWARD_CLIENT_IP` debe seguir apagada hasta que el equipo de la API confirme que confía en esa cabecera solo cuando la petición viene del servidor del portal.

### Dónde se entregan las credenciales

Este repositorio no contiene credenciales y no debe contenerlas.

- La clave del canal la emite quien opera el orquestador, con la utilidad descrita en [su README](../orchestrator/README.md), y la entrega por un canal privado. Vence a los 30 días.
- La cuenta de demostración la custodia el responsable del portal y se comparte por un canal privado.
- En desarrollo van en `apps/patient-portal/.env.local`, que Git ignora. En producción, en la configuración privada del servicio.

## Arrancar en local

Desde la raíz del monorepo:

```sh
pnpm install --frozen-lockfile
cp apps/patient-portal/.env.example apps/patient-portal/.env.local
pnpm --filter @salud-digna/patient-portal dev
```

Completa `.env.local` antes de arrancar. El portal queda en `http://127.0.0.1:5173`. En desarrollo el registro está encendido y no se envía `Strict-Transport-Security`.

`pnpm --filter @salud-digna/patient-portal check` comprueba los tipos. Las pruebas están en «Pruebas».

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
- **Credenciales.** Cuentas, contraseña, tokens, claves de canal y clave del emisor de acreditaciones son sintéticos. Se generan en cada ejecución a partir de un valor aleatorio que no se escribe en disco ni en la salida. Los correos son del dominio reservado `example.com`.
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
| identidad | `suites/identity.mjs simulador` y `pendiente` | Creación y listado con acreditación, `access-grants`, dos pacientes aislados, permiso renovado, trámite de otro canal, fallo de acreditación sin creación anónima, emisor pendiente y nada secreto en HTML, cookies, URL ni registro |
| arranque | en `run.mjs` | Seis configuraciones inválidas de identidad que deben impedir el arranque, sin secretos en el registro |
| publicacion | `suites/publication.mjs abierto` y `cerrado` | Registro controlado, IP del cliente, cabeceras de seguridad, página de error, sesión vencida, límites de acceso y topes de trámites y códigos |
| publicacion | `browser/publication.mjs` | La política de contenido no rompe nada en un navegador real |
| carga | `suites/load.mjs` | Peticiones por segundo, latencias y llamadas a los servicios por petición en cinco escenarios. Solo exige que todas las respuestas sean 200 |

**Fallos conocidos en modo orquestador.** `shell.mjs` da 39 de 41 en ese modo. Fallan «otro canal conocido: se nombra WhatsApp» y «canal sin nombre en el portal: se muestra «otro canal»». El aviso «Dejaste este trámite en…» sale del canal de la última actividad que informa la API general, y en ese modo el trámite vive en el orquestador. El lanzador los marca como «fallos conocidos» y no hace fallar la ejecución; cualquier otro fallo, sí. `flow.mjs` no se ejecuta en modo orquestador: recorre las operaciones `/requests` de la API general, y `orchestrator.mjs` cubre ese modo.

## Recorrido de demostración: Web, código de continuidad y app móvil

Requiere `REQUESTS_BACKEND=orchestrator`. Desde el 2026-11-24 WhatsApp está fuera del MVP; ver «Continuidad identificada» en [las decisiones](docs/decisions.md).

Con `PATIENT_IDENTITY_MODE=assertion` el recorrido no necesita código: el trámite aparece en **Continuar** y en **Mi espacio** en cualquier canal donde el paciente se identifique, y el código queda bajo **Otra forma de continuar**. Ese modo necesita el emisor de acreditaciones de la API central, que aún no existe: con el emisor `pending`, el portal responde «No pudimos verificar tu identidad». El recorrido siguiente es el del modo `none`.

1. Entra en el portal e inicia sesión con la cuenta de prueba.
2. Abre **Estudios**, elige uno y pulsa **Agendar este estudio**. Después, **Empezar el trámite**.
3. En «Elige una clínica», baja hasta **Continuar en otro canal** y pulsa **Generar código de continuidad**.
4. La pantalla muestra un código de doce caracteres y la hora a la que vence.
5. Escribe el código en la app móvil antes de esa hora. La app continúa el mismo trámite.
6. De vuelta en el portal, recarga el trámite para ver el avance. **Ver el historial del trámite** nombra los dos canales.

Tiempos que conviene tener presentes:

- El portal puede leer y cambiar un trámite durante cinco minutos desde que lo crea. Después muestra «Necesita un permiso nuevo».
- El código vale como mucho hasta ese mismo momento. Genéralo justo después de elegir el estudio.
- Para volver al portal pasado ese tiempo, pide un código en la app móvil o en Call Center y escríbelo en **Continuar**, en el campo **Tengo un código de continuidad**.
- El portal no puede canjear un código que él mismo generó.
