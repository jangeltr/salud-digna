# Call Center · Salud Digna

Consola Next.js para asesores de Salud Digna, desarrollada para HackaTec Nacional 2026. Permite recuperar solicitudes autorizadas y continuar trámites iniciados en otro canal conservando su folio, contexto e historial.

## Qué puede hacer el asesor

| Área | Funcionalidad |
| --- | --- |
| Acceso | Inicio de sesión con una cuenta activa `ADVISOR` de la API central. |
| Atención en la API central | La vista **Pacientes** canjea una referencia de asistencia. El asesor puede consultar la solicitud y su historial, y confirmar una cita si la API central lo permite y la respuesta acredita la confirmación. La búsqueda abierta de pacientes, la verificación de identidad en esta vista, las notas y los mensajes siguen pendientes. |
| Continuidad institucional | Con el consentimiento firmado del paciente, el asesor obtiene el listado de trámites activos autorizados, selecciona uno y accede sin códigos. |
| Seguimiento omnicanal | Consulta por el mismo UUID, con estado, paso, versión, referencias de estudio y clínica, e historial paginado con canales de origen. |
| Avance | Puede dejar el trámite en `PENDING_CONFIRMATION` si el estado, las referencias, la versión y los permisos lo permiten. El servidor publica el evento con `expectedVersion` y conserva el mismo identificador y cuerpo en un reintento incierto. La interfaz vuelve a leer el estado persistido. |
| Alternativa | Canje de un código de continuidad de un solo uso del canal anterior. Es un contrato independiente de la referencia de asistencia de la API central. |

**`PENDING_CONFIRMATION` indica una atención pendiente de confirmación. La publicación de ese avance no crea ni confirma una cita.**

## Arquitectura y flujo institucional

1. Portal Web u otro canal autorizado registra un trámite en el orquestador vinculado al `CUSTOMER_ID`, el UUID institucional del paciente en la API central NestJS. La emisión del consentimiento exige una sesión de paciente y un backend de canal autorizado por la API central.
2. El consentimiento se entrega de forma privada, asociado al asesor y al canal `demo-callcenter`. El servidor Next.js revalida la sesión `ADVISOR` en `/api/v1/auth/me` y pide la acreditación firmada Ed25519 en `POST /api/v1/auth/patient-assertions`. La API central verifica destinatario, canal, firma y vigencia.
3. El servidor agrega la acreditación a `X-Patient-Assertion` y consulta `GET /api/v1/journeys?active=true`. Solo solicita `POST /api/v1/journeys/:journeyId/access-grants` para un UUID de ese listado autorizado.
4. El servidor utiliza `X-Journey-Grant` para leer resumen, contexto e historial del mismo trámite. Si el acceso permite publicar, envía el avance a `POST /api/v1/events`. Tanto las lecturas como las escrituras omnicanal pasan por `POST /api/omnichannel` de Next.js.

La API central autentica al operador y administra la identidad institucional. El orquestador conserva el estado, el contexto y los eventos compartidos entre canales. Las claves de canal, acreditaciones y grants institucionales permanecen en el servidor. Los permisos se guardan en memoria, aislados por sesión y trámite, y caducan como máximo a los cinco minutos o antes según el JWT y el permiso aplicable.

### Custodia del consentimiento en Linux

- Usa una ruta absoluta fuera del repositorio y de las carpetas públicas de Next.js. Cada archivo `<UUID del asesor en minúsculas>.jws` contiene solo el consentimiento institucional compacto.
- Ejecuta el servicio con un usuario sin privilegios y con `salud-digna-callcenter` como grupo primario. El directorio debe ser de root y del grupo del servicio, con modo `0750`. Los archivos deben tener el mismo propietario y grupo, con modo `0640`. Los directorios superiores deben pertenecer a root y carecer de escritura para grupo u otros. Evita ACL que amplíen el acceso.
- El lector usa descriptores anclados con `/proc/self/fd`, apertura con `O_NOFOLLOW` y `O_NONBLOCK`, y validación de metadatos sobre los descriptores. Rechaza enlaces simbólicos, archivos irregulares, permisos incorrectos y contenido que exceda el límite o incumpla el formato. La API central comprueba la vigencia. En Windows se rechaza la lectura institucional por archivo y sigue disponible la alternativa por código.
- El operador retira el archivo. Su ausencia impide emitir nuevas acreditaciones. Las acreditaciones y grants ya emitidos conservan su caducidad o revocación contractual.

## Desarrollo local

Requiere Node.js 24.x y pnpm 11.28.11. Ejecuta desde la raíz del monorepo.

```sh
pnpm install --frozen-lockfile
pnpm --filter @salud-digna/call-center dev
pnpm --filter @salud-digna/call-center check
pnpm --filter @salud-digna/call-center build
node --test apps/call-center/test/consent-file.test.mjs
```

Desarrollo escucha en `http://127.0.0.1:3001`. El script `check` genera tipos de rutas y ejecuta TypeScript. Configura el origen público antes del build y autoriza el origen exacto del frontend en el CORS de la API central.

| Variable | Visibilidad | Propósito |
| --- | --- | --- |
| `NEXT_PUBLIC_ORCHESTRATOR_ORIGIN` | Pública | Nombre histórico para el origen de la **API central** que usa el navegador. Configúralo sin `/api/v1`. |
| `GENERAL_API_ORIGIN` | Solo servidor | Origen de la API central para revalidar la sesión. |
| `STAFF_FRONTEND_ORIGIN` | Solo servidor | Origen exacto del frontend permitido en la ruta Next.js. Producción requiere HTTPS. |
| `CALL_CENTER_ORCHESTRATOR_API_KEY` | Secreto del servidor | Clave del orquestador con `JOURNEYS_READ` y, para publicar, `EVENTS_PUBLISH`. |
| `CALL_CENTER_PATIENT_ASSERTION_CHANNEL_KEY` | Secreto del servidor | Credencial de Call Center para pedir acreditaciones a la API central. |
| `CALL_CENTER_PATIENT_CONSENT_DIR` | Solo servidor | Ruta privada de los consentimientos institucionales. |

## Validaciones y estado

- **Local.** TypeScript y build pasaron. La suite versionada prueba el acceso a archivos de consentimiento con dobles del sistema de archivos. También se ejecutaron comprobaciones aisladas de continuidad institucional y por códigos. La suite con dobles no acredita el comportamiento real del sistema de archivos Linux.
- **Prueba omnicanal reportada por backend.** Folio sintético `22419b98-826c-4b61-829b-24a63abe1942`, sin códigos de continuidad.

  1. Web creó el trámite, versión 1.
  2. Web seleccionó Demo Biometría hemática, versión 2.
  3. El backend móvil seleccionó Demo Clínica Alameda, versión 3. La evidencia de este paso corresponde al backend móvil.
  4. Call Center publicó la transición a `PENDING_CONFIRMATION`, versión 4.
  5. Web recuperó el historial completo. Backend confirmó los cuatro eventos y el contexto final en PostgreSQL.

- **Publicación.** Call Center se integró en `main` mediante `ec8ddd6`. El equipo de backend reportó el despliegue en `https://callcenter.salud-digna.app`.
- **Pendientes.** Automatizar la entrega del consentimiento desde Portal Web, ampliar las pruebas negativas, verificar los permisos efectivos del servicio en Linux y acordar una consulta para reconciliar intentos inciertos después de expirar el acceso.

[Guía técnica de Call Center y el orquestador](../../docs/call-center-orchestrator.md) · [Contrato de acreditaciones en main](https://github.com/jangeltr/salud-digna/blob/bff1f5890a6929719a241fe7ed8c40efd4b95860/docs/api-patient-assertions.md) · [Consultas del orquestador en main](https://github.com/jangeltr/salud-digna/blob/bff1f5890a6929719a241fe7ed8c40efd4b95860/apps/orchestrator/docs/journey-queries.md)
