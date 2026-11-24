# Administración y el orquestador

La aplicación usa `POST /api/v1/auth/login` con cuentas `ADMIN`. El JWT vive en memoria hasta cerrar la aplicación, cerrar sesión o alcanzar su vencimiento. Configura `NEXT_PUBLIC_ORCHESTRATOR_ORIGIN` antes de compilar y permite el origen exacto del frontend en `CORS_ORIGINS`. El destino predeterminado es la API local en el puerto 3000. Fuera de loopback se requiere HTTPS para la API y el frontend debe servirse por HTTPS.

- Dashboard usa `GET /api/v1/admin/overview`. Pendientes corresponde a `openRequests`.
- Supervisión usa `GET /api/v1/admin/requests` con `page` y `status`. El detalle presenta los datos autorizados del listado. La API devuelve último canal, fechas, paso y estado, y aún carece de un campo de canal inicial.
- Patient Journey y Centro de Orquestación consultan explícitamente `GET /api/v1/admin/requests/:id/journey`. La API devuelve el historial autorizado para un trámite y registra `ADMIN_JOURNEY_VIEWED` en auditoría. La consulta conserva el estado de negocio. La vista muestra el rol registrado cuando la API lo incluye.
- Usuarios, roles y catálogos conservan sus interfaces secundarias. El alcance de este cambio es el monitoreo del orquestador.

Pendientes con API: métricas agregadas de canales participantes y eventos procesados con criterios acordados, canal inicial y detalle operativo independiente del listado, ingesta global con filtros y estados de procesamiento, errores/reintentos, directorio y estado de conectores, y lectura paginada de auditoría autorizada por rol. El historial por trámite carece de estado de procesamiento y de identificadores de actor por diseño.
