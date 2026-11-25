# Estado del portal del paciente

**Fecha.** 2026-11-25. **Rama.** `dev/patient-portal`, publicada en `origin`. `main` ya incluye el portal hasta `a8ddcc4`. Este documento sirve para retomar el trabajo en otra sesión. Las decisiones y sus motivos están en [decisions.md](decisions.md).

## Resumen

1. El portal es el sitio web del paciente, con Next.js: acceso, catálogo de estudios y clínicas, y trámite de agendamiento.
2. Registra los trámites en la API general o en el orquestador, según `REQUESTS_BACKEND`, y en el orquestador emite y canjea códigos de continuidad.
3. `main` incluye el portal hasta la fase 8, `a8ddcc4`, fusionado en `7df5c1b`. En la rama quedan solo commits de documentación posteriores. Qué revisión corre el servidor publicado está por confirmar.
4. La continuidad identificada ya usa el emisor de acreditaciones de la API central y `access-grants` del orquestador, publicados en `main` en `17c9b27`. La prueba real del portal pasó el 2026-11-24. El Call Center recupera el trámite según su propia documentación. Que el portal emita la autorización del paciente para Call Center, `patient-assertion-consents`, queda para después del MVP.
5. **Bloquea la demo:** el portal publicado responde «No pudimos crear el trámite. Inténtalo de nuevo.» al crear un trámite.
6. El diagnóstico apunta a la clave del canal o a la URL del orquestador en el servidor. Faltan las comprobaciones del responsable del servidor.

## Arquitectura vigente

**Canales del MVP.**

| Canal | Responsable |
| --- | --- |
| Portal web | Este proyecto |
| App móvil nativa | Otro integrante |
| Call Center | Otro integrante |
| Administración | Otro integrante |

WhatsApp quedó fuera del MVP el 2026-11-24. Desde la fase 7 la interfaz del portal ya no lo ofrece como canal.

**Orden de integración del equipo.**

1. Portal web y Call Center.
2. Administración.
3. App móvil, si da tiempo.

**Servicios.** Cada uno con su propia base de datos.

| Servicio | Qué atiende | Contrato |
| --- | --- | --- |
| API general | Acceso, perfil, catálogo y citas | [`docs/openapi.json`](../../../docs/openapi.json) |
| Orquestador | Trámites, eventos, contexto, historial y códigos de continuidad | [`apps/orchestrator/docs/`](../../orchestrator/docs/) |

El portal llama a los dos desde su servidor. La clave del canal Web y los permisos de trámite nunca llegan al navegador. El token de sesión vive en una cookie `HttpOnly`.

**Recorrido de la demo.**

1. Web inicia el trámite y elige el estudio y la clínica.
2. El Call Center recupera el trámite y lo continúa, según su propia documentación.
3. Administración muestra el recorrido completo.

El código de continuidad queda como contingencia. Los pasos del portal están en el [README](../README.md), «Demostración», y las notas para presentar en [demo.md](demo.md).

## Lo terminado

| Fase | Qué | Commit |
| --- | --- | --- |
| Antes de las fases | Estructura, base técnica, carcasa, acceso y sesión, catálogo y trámite guiado contra la API general | `47e1cbd`, `202703a`, `a7fe549`, `5184fd0`, `830bfbc`, `464e3fe` |
| 0 | Retirada de la PWA; navegación única en el encabezado | `27ec5cd` |
| 1 | Modelo propio, tres interfaces internas y adaptadores; nada fuera de los adaptadores conoce la API | `1f6dbae` |
| 2a | Lectura del contrato del orquestador e informe; integración de `main` | `c9d93cd` (merge) |
| 2b | Adaptador del orquestador tras `REQUESTS_BACKEND`, capacidades por adaptador, registro del canal Web y permisos en memoria | `00dfcad`, `f46ac0a` |
| 2c | Códigos de continuidad, creación idempotente y recorrido real autorizado | `846dd68` (merge), `f243c2e` |
| 3 | Preparación para publicar: registro controlado, límites propios, cabeceras de seguridad y páginas de error | `7407038` |
| 4 | PR #8 contra `main`, fusionado el 2026-11-24 | `1b32a24` (merge en `main`) |
| 5 | Rendimiento: catálogo servido desde caché, caché de sesión, índice del catálogo y estado detrás de interfaces | `17cf8ed` |
| 7 | Continuidad identificada tras `PATIENT_IDENTITY_MODE`, emisor de acreditaciones pendiente, registro mínimo de errores, textos sin WhatsApp y selección sin cambios sin evento. Integra `main` (`f9ffcf3`) | `f69d8d4` |
| 6a | Suites y servicios simulados dentro del repositorio, en `tests/`, con lanzador propio, credenciales sintéticas por ejecución y scripts `pnpm test` | `8ec9c78` |
| 6b | Documentación de entrega: README completo del portal, [guion de la demostración](demo.md), [sección para el README de la raíz](readme-raiz-portal.md) y `CATALOG_CACHE_SECONDS` en `.env.example` | `ff4b912` |
| 8 | Emisor de acreditaciones de la API central conectado, `access-grants` según el contrato publicado y prueba real contra los servicios publicados | `a8ddcc4`, publicado |
| 9 | Guion de demo sin código y medición del catálogo por petición | `6e45140` |
| 10 | Documentación: autorización del paciente para Call Center pospuesta después del MVP, orden de integración y lo que falta para publicar | `82d0235` |
| — | Merge de `main` hasta `bff1f58` | `224aa20` |
| 11 | Documentación de entrega: README con instalación desde un clon limpio, credenciales por rol con marcadores y pasos de la demostración; READMEs de subcarpetas al día | Este commit |

**Diagnóstico posterior.** El error de creación en producción, sin cambios de código. El resultado está en «Estado del despliegue».

**Prompt anterior a la fase 7.** Pedía registro mínimo, cambiar los textos de WhatsApp por app móvil y preparar la descripción del PR. Los dos primeros quedaron hechos en la fase 7. La descripción del PR sigue pendiente. El PR no se abre sin autorización.

**Fase 7 en detalle.** Ver «Continuidad identificada» en [decisions.md](decisions.md), con la comparación entre el contrato y el código del orquestador.

## Estado del despliegue

**Versión en `main`.** El portal hasta la fase 8, `a8ddcc4`, fusionado en `7df5c1b`. Qué revisión corre el servidor publicado, y con qué variables, está por confirmar con su responsable.

**En la rama.** `origin/dev/patient-portal` añade a `main` solo documentación: las fases 9, 10 y 11. Integra `main` hasta `bff1f58`.

**Error «No pudimos crear el trámite. Inténtalo de nuevo.»**

- El portal lo muestra cuando la creación del trámite devuelve un error que no es «servicio no disponible» ni «sesión vencida».
- **Modo orquestador:** `POST /journeys` respondió 401, 403, 404, 400, 409 o 429, u otro 4xx.
- **Modo legacy:** `POST /requests` respondió un 4xx distinto de 401.
- **Qué no lo produce:** un fallo de red, un tiempo de espera agotado o un 5xx muestran otro texto, «El servicio no respondió…». Tampoco el fallo del segundo evento (el estudio), que lleva al trámite con su propio aviso.
- **Qué registra el portal publicado:** solo 401 y 403 dejan línea: `[orquestador] POST /journeys: credencial de canal rechazada (401)`, o `(403)`. Los demás códigos no dejan rastro. Desde la fase 7, en local, toda respuesta no 2xx deja `[orquestador] POST /journeys: respuesta <código>`, y el error mostrado deja `[portal] error mostrado en acción: empezar trámite: <tipo>`.
- **Qué registra el orquestador:** nada. Arranca sin registro y no audita los rechazos de credencial.

**Comprobaciones pedidas al servidor**, de la más probable a la menos:

| # | Comprobación | Síntoma en el registro del portal | Síntoma del lado del orquestador |
| --- | --- | --- | --- |
| 1 | La clave del canal Web no es válida para el orquestador de producción: emitida contra otra base, revocada, vencida (dura 30 días), canal inactivo o sin el scope `EVENTS_PUBLISH` | `[orquestador] POST /journeys: credencial de canal rechazada (401)` o `(403)` | Ninguna línea. Sin filas nuevas de trámites. El proxy registra `POST /api/v1/journeys 401` o `403` |
| 2 | `ORCHESTRATOR_BASE_URL` no llega al orquestador: host o prefijo `/api/v1` equivocados, o el proxy público envía esa ruta a otro servicio | Ninguna línea | El orquestador no recibe la petición. Otro servicio registra `POST /api/v1/journeys 404` |
| 3 | Un proxy entre el portal y el orquestador quita la cabecera `Idempotency-Key` o limita peticiones | Ninguna línea | El proxy registra `POST /api/v1/journeys 400` o `429` |
| 4 | `REQUESTS_BACKEND` falta o vale `legacy`, así que el portal crea en la API general | Ninguna línea | El orquestador no recibe nada. La API general registra `POST /api/v1/requests` con un 4xx |

En pantalla se distingue el modo:
- **Modo orquestador:** `/tramite/nuevo` dice «Elegirás el estudio y la clínica paso a paso.» y `/continuar` ofrece «Tengo un código de continuidad».
- **Modo legacy:** `/tramite/nuevo` menciona el horario.

## Lo que falta para publicar

1. **Integración en `main`.** `main` ya incluye el portal hasta `a8ddcc4`. Falta fusionar la documentación posterior de `dev/patient-portal` con un PR, cuando se autorice abrirlo.
2. **Variables de producción**, en la configuración privada del servicio. Aquí solo van los nombres. Los valores los pone el responsable del servidor.

| Variable | Valor en producción |
| --- | --- |
| `API_BASE_URL` | URL de la API central de producción, con `/api/v1` y `https`. |
| `REQUESTS_BACKEND` | `orchestrator`. |
| `ORCHESTRATOR_BASE_URL` | URL del orquestador de producción, con `/api/v1` y `https`. |
| `ORCHESTRATOR_API_KEY` | Clave del canal Web emitida contra la base de producción. Secreto. |
| `PATIENT_IDENTITY_MODE` | `assertion`. |
| `PATIENT_ASSERTION_CHANNEL_KEY` | Credencial del canal Web ante el emisor de producción. Secreto, distinto de `ORCHESTRATOR_API_KEY`. |
| `REGISTRATION_ENABLED` | Sin definir o `false`. |
| `FORWARD_CLIENT_IP` | Sin definir, hasta acordarla con backend. |
| `CATALOG_CACHE_SECONDS` | Opcional, 300 por defecto. Se lee al compilar. |
| `PORTAL_DATA_DIR` | No se usa con `assertion`. |

La API central y el orquestador de producción deben incluir `17c9b27` de `main`. El resto de la publicación está en el [README](../README.md), «Arrancar en producción» y «Lista de publicación».

## Pendientes del portal

En este orden:

1. **Resolver el error de creación en producción**, con las comprobaciones de arriba.
2. **Integración en `main` y variables de producción**, según «Lo que falta para publicar».
3. **Ensayo conjunto con el Call Center** de la [demostración](../README.md#demostración).
4. **Prueba del portal publicado desde el navegador de un teléfono.**
5. **Prueba conjunta con la app móvil**, si se integra a tiempo.
6. **Fase 6:**
   - suites y servicios simulados dentro del repositorio: hecho en la fase 6a, en [`tests/`](../tests/);
   - README completo del portal y `CATALOG_CACHE_SECONDS` en `.env.example`: hecho en la fase 6b;
   - texto de la sección del portal para el README de la raíz: preparado en [readme-raiz-portal.md](readme-raiz-portal.md). Falta pegarlo en la raíz, que está fuera del portal y la decide su responsable.

**Rendimiento: en pausa hasta terminar el MVP.** Dato de Salud Digna: unos 5 millones de consultas diarias en el portal web. Las mediciones y la estimación de capacidad están en [decisions.md](decisions.md), «Rendimiento y caché».

## Pendientes con los compañeros

| Compañero | Asunto | Estado |
| --- | --- | --- |
| Backend | Revocar la clave del canal Web que quedó expuesta en un archivo suelto y emitir otra contra la base de producción | Por confirmar |
| Backend | Las cuatro comprobaciones del error de creación | Por confirmar |
| Backend | Cuentas de demo por rol, pacientes y asesores, porque el registro está apagado; entregarlas por canal privado | Por confirmar |
| Backend | Dos cuentas sintéticas del dominio `example.com` creadas por error en una prueba: decidir si se borran | Por confirmar |
| Backend | Confiar en `X-Portal-Client-IP` solo desde el servidor del portal, o subir el límite de accesos durante la demo | Por confirmar |
| Backend | Duración o renovación del permiso de trámite de cinco minutos | Por confirmar |
| Backend | `scheduledAt` en el contexto y un evento de cierre con referencia de cita, para llegar a `COMPLETED` | Por confirmar |
| Backend | Filtro `city` en `GET /clinics` | Por confirmar |
| Backend | `Cache-Control` en las lecturas del catálogo | Por confirmar |
| Backend | Lectura de estado y contexto del trámite en una sola llamada | Por confirmar |
| Backend | `expiresAt` en `GET /auth/me` | Por confirmar |
| Backend | Cierre de sesión con revocación del token | Por confirmar |
| Backend | Límite de canje de códigos por actor, no solo por canal | Por confirmar |
| Backend | Registrar en el orquestador los rechazos de credencial y de ruta | Por confirmar |
| Backend | Diagramas de arquitectura y de secuencia | Por confirmar |
| Backend | Contenido del README de la raíz: instalación, credenciales sintéticas por rol y pasos de la demo. Nunca claves de canal ni secretos del servidor | Por confirmar |
| App móvil | Servidor intermedio que guarde la clave y los permisos, y canal propio en el orquestador | Por confirmar |
| App móvil | Evento de contacto, «contacto iniciado» y «que me contacten», solo si backend lo aprueba | Por confirmar |
| App móvil | Números ficticios de Call Center para la demo | Por confirmar |
| Call Center | Mostrar el evento de contacto, si se aprueba | Por confirmar |
| Call Center | Prueba conjunta del código de continuidad | Por confirmar |
| Backend | Contrato del emisor `POST /auth/patient-assertions` | Resuelto en `main`, `17c9b27` |
| Backend | Publicar en el repositorio `POST /journeys/:id/access-grants` y el filtro `active` del listado | Resuelto en `main`, `17c9b27` |
| Backend | Autorización del paciente para Call Center, `patient-assertion-consents`: UUID del asesor, código del canal, entrega del consentimiento entre backends, momento y lo que ve el paciente. Preguntas para una fase posterior, en [decisions.md](decisions.md) | Después del MVP |
| Backend | Que el orquestador acepte la acreditación JWS Ed25519 del emisor | Resuelto en `main`, `17c9b27` |

## Riesgos conocidos

| Riesgo | Efecto |
| --- | --- |
| Límite de accesos compartido | La API general limita el acceso a 10 intentos por IP cada 15 minutos, y todas las peticiones salen del servidor del portal. Unos pocos fallos pueden dejar a todos los pacientes sin poder entrar. |
| Estado en memoria y una sola instancia | Permisos, límites, claves pendientes y caché de sesión viven en el proceso, y el registro del canal en un archivo local. Al reiniciar se pierden los permisos, y dos instancias no comparten nada. |
| Permiso de cinco minutos | Pasado ese tiempo, el portal no puede leer ni cambiar el trámite hasta recibir un código de continuidad emitido en otro canal. |
| Trámites que no llegan a `COMPLETED` | El contrato del orquestador no admite fecha ni cierre con cita. En el portal, el trámite termina en «Pendiente de confirmación». |
| Lista vacía ante una acreditación rechazada | El orquestador responde igual a una identidad sin trámites que a una acreditación inválida. El portal muestra la lista vacía, y el error aparece al intentar crear. |

## Cómo retomar

**Arrancar en desarrollo.** El servidor de desarrollo usa el puerto 5173 y lee `apps/patient-portal/.env.local`, que apunta a los servicios desplegados.

```sh
pnpm install --frozen-lockfile
pnpm --filter @salud-digna/patient-portal dev
```

**Comprobar y compilar.** `next build` genera el catálogo y llama a la API general. En pruebas, compila con las variables de servicio apuntando a los servicios simulados: las variables del proceso tienen prioridad sobre `.env.local`.

```sh
pnpm --filter @salud-digna/patient-portal check
API_BASE_URL=http://127.0.0.1:4010/api/v1 REQUESTS_BACKEND=legacy \
  pnpm --filter @salud-digna/patient-portal build
```

**Probar en los dos modos.** Las suites y los servicios simulados están en [`tests/`](../tests/). El lanzador compila, arranca el portal en el puerto 5183 contra los simuladores y genera credenciales sintéticas en cada ejecución. Qué cubre cada suite y los dos fallos conocidos en modo orquestador están en el [README](../README.md), sección «Pruebas».

```sh
pnpm --filter @salud-digna/patient-portal test                # todo
pnpm --filter @salud-digna/patient-portal test:legacy         # o un grupo: legacy, orchestrator, identity, publication, load
```

**Variables.** Todas las lee solo el servidor.

| Variable | Propósito |
| --- | --- |
| `API_BASE_URL` | URL de la API general, con `/api/v1`. Obligatoria. |
| `REQUESTS_BACKEND` | `legacy`, por defecto, u `orchestrator`. |
| `ORCHESTRATOR_BASE_URL` | URL del orquestador, con `/api/v1`. |
| `ORCHESTRATOR_API_KEY` | Clave del canal Web en el orquestador. Secreto. |
| `PORTAL_DATA_DIR` | Carpeta del registro del canal Web. |
| `REGISTRATION_ENABLED` | Registro de cuentas. Apagado por defecto en producción. |
| `FORWARD_CLIENT_IP` | Envía a la API general la IP del paciente. Apagada hasta acordarlo con backend. |
| `CATALOG_CACHE_SECONDS` | Duración de la caché del catálogo. Se lee al compilar. |
| `PATIENT_IDENTITY_MODE` | `none`, por defecto, o `assertion`. |
| `PATIENT_ASSERTION_CHANNEL_KEY` | Credencial del canal Web ante el emisor de acreditaciones. Obligatoria con `assertion`. Secreto. |

`.env.local` además tiene `PORTAL_TEST_EMAIL`, `PORTAL_TEST_PASSWORD`, `PORTAL_TEST_EMAIL_2` y `PORTAL_TEST_PASSWORD_2`. Son de la cuenta de prueba y solo las usan las pruebas autorizadas.

**Reglas de trabajo que se mantienen.**

- No escribir fuera de `apps/patient-portal`, salvo `pnpm-lock.yaml` cuando un merge o una instalación lo exijan.
- Push solo a `dev/patient-portal` y solo cuando se autorice. Nunca a `main` ni a otra rama, nunca force push y ningún PR sin autorización. `git fetch` sí, para leer.
- Un solo PR por entrega, contra `main`.
- No usar endpoints ni propiedades fuera de los contratos. Lo que falte se reporta.
- Las credenciales solo van en `.env.local`, y las escribe el responsable del portal.
- Las pruebas van contra servicios simulados, en un puerto distinto de 5173.
- Las llamadas a servicios desplegados, solo autorizadas y contadas.

**Documentos.**

- [Decisiones del portal](decisions.md)
- [Notas para presentar la demostración](demo.md). Los pasos están en el [README](../README.md), «Demostración».
- [Sección del portal para el README de la raíz](readme-raiz-portal.md)
- [Contrato de continuidad identificada](contratos/continuidad-identificada.md)
- [README del portal](../README.md)
- [Instrucciones para agentes del portal](../CLAUDE.md)
- Contratos del orquestador:
  - [escrituras](../../orchestrator/docs/journey-writes.md)
  - [consultas](../../orchestrator/docs/journey-queries.md)
  - [códigos de continuidad](../../orchestrator/docs/continuity-codes.md)
  - [identidad del paciente](../../orchestrator/docs/patient-identity.md)
- [Contrato de la API general](../../../docs/openapi.json)
