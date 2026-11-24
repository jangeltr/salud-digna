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

`pnpm --filter @salud-digna/patient-portal check` comprueba los tipos.

## Arrancar en producción

```sh
pnpm install --frozen-lockfile
pnpm --filter @salud-digna/patient-portal build
pnpm --filter @salud-digna/patient-portal exec next start --hostname 127.0.0.1 --port <puerto>
```

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

## Lista de publicación

1. Compilar desde una revisión identificada y con el lockfile.
2. Una sola instancia del portal. Registro, permisos, límites y claves pendientes viven en el proceso.
3. Variables en la configuración privada del servicio. `REQUESTS_BACKEND=orchestrator` para la demostración.
4. `PORTAL_DATA_DIR` fuera de la carpeta del código, del usuario del servicio, con permisos `0700`, e incluida en los respaldos.
5. Proxy con TLS y las cabeceras de arriba. El puerto del portal no debe ser accesible desde fuera.
6. `REGISTRATION_ENABLED` sin definir o en `false`, salvo que se quiera abrir el registro.
7. `FORWARD_CLIENT_IP` sin definir, hasta acordarla con el equipo de la API.
8. Comprobar tras el despliegue: `/robots.txt` responde `Disallow: /`, `/registro` responde `404`, un acceso funciona y la respuesta trae `Strict-Transport-Security` y `Content-Security-Policy`.

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

## Recorrido de demostración: Web, código de continuidad y WhatsApp

Requiere `REQUESTS_BACKEND=orchestrator`.

1. Entra en el portal e inicia sesión con la cuenta de prueba.
2. Abre **Estudios**, elige uno y pulsa **Agendar este estudio**. Después, **Empezar el trámite**.
3. En «Elige una clínica», baja hasta **Continuar en otro canal** y pulsa **Generar código de continuidad**.
4. La pantalla muestra un código de doce caracteres y la hora a la que vence.
5. Escribe el código en WhatsApp antes de esa hora. WhatsApp continúa el mismo trámite.
6. De vuelta en el portal, recarga el trámite para ver el avance. **Ver el historial del trámite** nombra los dos canales.

Tiempos que conviene tener presentes:

- El portal puede leer y cambiar un trámite durante cinco minutos desde que lo crea. Después muestra «Necesita un permiso nuevo».
- El código vale como mucho hasta ese mismo momento. Genéralo justo después de elegir el estudio.
- Para volver al portal pasado ese tiempo, pide un código en WhatsApp y escríbelo en **Continuar**, en el campo **Tengo un código de continuidad**.
- El portal no puede canjear un código que él mismo generó.
