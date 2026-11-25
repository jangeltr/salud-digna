# Administración · Salud Digna

Consola Next.js para supervisión operativa de Salud Digna, desarrollada para HackaTec Nacional 2026. Combina indicadores y solicitudes de la API central con seguimiento de trámites específicos del orquestador omnicanal mediante permisos autorizados.

## Vistas y fuentes de datos

| Vista | Fuente | Qué muestra |
| --- | --- | --- |
| Dashboard | `GET /api/v1/admin/overview` de la API central | Trámites registrados, pendientes y completados de la API central. Los indicadores globales del orquestador aparecen como no disponibles. |
| Supervisión | `GET /api/v1/admin/requests` de la API central | Listado paginado y filtrado por estado, con paso, fechas y último canal cuando la API los entrega. |
| Recorrido API general | `GET /api/v1/admin/requests/:id/journey` de la API central | Historial autorizado de una solicitud de la API central. |
| Patient Journey y Centro de Orquestación | Orquestador, vía `POST /api/omnichannel` de Next.js | Resumen, contexto e historial por UUID y grant, sin listado global de trámites. |

La API central autentica al personal y sirve las vistas administrativas. El servidor Next.js revalida la cuenta activa y el rol `ADMIN` con `GET /api/v1/auth/me`. Para el orquestador utiliza una clave de canal con `JOURNEYS_READ` y un grant `READ_JOURNEY` específico del trámite. El rol `ADMIN` por sí solo no concede acceso a todos los trámites. El servidor rechaza intentos de publicar o reintentar eventos.

## Consultar un Patient Journey

1. Inicia sesión como `ADMIN` y abre **Patient Journey** o **Centro de Orquestación**.
2. Introduce el folio (UUID) y el grant de lectura de Administración emitido para ese trámite. El servidor consulta `GET /api/v1/journeys/:journeyId`, `/context` y `/history`.
3. Revisa el estado, el paso, la versión y las referencias de estudio y clínica que devuelva el orquestador. El historial muestra fechas y canales de origen, con hasta 20 eventos por página y paginación por cursor. `PENDING_CONFIRMATION` sigue siendo un estado pendiente, distinto de una cita confirmada o un trámite completado.
4. La vista sondea cada 20 segundos mientras está activa, la pestaña está visible, el permiso local sigue vigente y no hay una operación en curso. Muestra la hora de la última consulta exitosa. Si el estado y la versión coinciden y hay historial cargado, conserva el historial y su cursor. Un evento que no cambie esos campos puede requerir refresco manual para aparecer.
5. **Actualizar desde el orquestador** vuelve a consultar el primer tramo del historial y reanuda el sondeo si estaba pausado por un error. La pérdida de autorización limpia la vista y exige un nuevo acceso.

El grant se envía al servidor en el cuerpo de la apertura, se limpia del formulario y nunca se incluye en las respuestas. El servidor lo conserva en memoria por trámite y por instancia de sesión, con un límite local de cinco minutos o hasta el vencimiento del JWT si ocurre antes. El orquestador valida la vigencia y el alcance efectivos de cada lectura. Cerrar el acceso o la sesión elimina el permiso local cuando el servidor recibe la solicitud. El estado en memoria se pierde al reiniciar. La ruta verifica origen, contenido, sesión y rol.

## Desarrollo local

Requiere Node.js 24.x y pnpm 11.28.11. Ejecuta desde la raíz del monorepo.

```sh
pnpm install --frozen-lockfile
pnpm --filter @salud-digna/admin dev
pnpm --filter @salud-digna/admin check
pnpm --filter @salud-digna/admin build
```

Desarrollo escucha en `http://127.0.0.1:3002`. El script `check` genera tipos de rutas y ejecuta TypeScript. Configura el origen público antes del build y autoriza el origen exacto del frontend en el CORS de la API central.

| Variable | Visibilidad | Propósito |
| --- | --- | --- |
| `NEXT_PUBLIC_ORCHESTRATOR_ORIGIN` | Pública | Nombre histórico para el origen de la **API central** que usa el navegador. Configúralo sin `/api/v1`. |
| `GENERAL_API_ORIGIN` | Solo servidor | Origen de la API central para revalidar la sesión. |
| `STAFF_FRONTEND_ORIGIN` | Solo servidor | Origen exacto del frontend aceptado por Next.js. Producción requiere HTTPS. |
| `ADMIN_ORCHESTRATOR_API_KEY` | Secreto del servidor | Clave independiente del canal de Administración con `JOURNEYS_READ`. |

## Validaciones y estado

- **Local.** TypeScript y build pasaron. Con respuestas controladas se comprobaron los rechazos de sesión, origen y rol, el aislamiento del grant, la prohibición de publicar, la paginación y la recarga condicional del historial usada por el sondeo. El paquete carece de suite de pruebas versionada y de script `test`.
- **Publicación.** La versión funcional `d7c6bab2b0ca6f6a4ad8a8f59ff30bf3996bf95d` está publicada en `feature/orchestrator-admin`. Su integración en `main` y su despliegue siguen sin confirmación. También sigue pendiente una prueba integrada con una cuenta `ADMIN` y un grant real.
- **Próxima validación.** Confirmar la clave y los permisos del canal y consultar en la interfaz el mismo trámite sintético que validó Call Center. Comprobar el temporizador en navegador, incluidos los cambios de pestaña, el refresco manual y la expiración.
- **Contratos pendientes.** Métricas, ingesta, auditoría y salud de conectores a nivel global requieren contratos administrativos del orquestador. La consulta de catálogos para mostrar nombres de estudios y clínicas sigue pendiente.

[Guía técnica de Administración y el orquestador](../../docs/admin-orchestrator.md) · [Consultas del orquestador en main](https://github.com/jangeltr/salud-digna/blob/bff1f5890a6929719a241fe7ed8c40efd4b95860/apps/orchestrator/docs/journey-queries.md)
