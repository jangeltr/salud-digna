# Call Center y el orquestador

El asesor inicia sesión con `POST /api/v1/auth/login` como `ADVISOR`. El JWT vive en memoria hasta cerrar la aplicación, cerrar sesión o alcanzar su vencimiento. Configura `NEXT_PUBLIC_ORCHESTRATOR_ORIGIN` antes de compilar y permite el origen exacto del frontend en `CORS_ORIGINS`. El destino predeterminado es la API local en el puerto 3000. Fuera de loopback se requiere HTTPS para la API y el frontend debe servirse por HTTPS.

1. El paciente genera una referencia con `POST /api/v1/requests/:id/assistance-code`.
2. El asesor canjea con `POST /api/v1/call-center/claim` y recupera la atención mediante `GET /api/v1/call-center/requests/:id` y `GET /api/v1/requests/:id/journey`.
3. Al revisar la atención lista, confirma con `POST /api/v1/call-center/requests/:id/confirm` y el cuerpo `{version}`. Un 200 devuelve la cita aplicada o recuperada. El backend asigna los IDs de evento y persiste sus eventos en la misma transacción. Ante resultado incierto, el reintento conserva el ID y la versión originales. Con 409 la interfaz recarga el contexto para una nueva revisión.
4. La interfaz vuelve a consultar estado e historial. Una interrupción en esas lecturas puede dejar una cita confirmada con contexto pendiente de actualizar.

Pendientes con API: descubrimiento de atenciones autorizadas para el asesor (incluida recuperación de un canje cuya respuesta se perdió), verificación de identidad separada del permiso operativo, comandos de contexto/reanudación/notas/mensajes para `ADVISOR`, agenda y disponibilidad, y contrato de ingesta general con identificador externo, idempotencia, acuse y consulta del resultado de procesamiento.


El 200 de confirmación debe contener un `AppointmentDto` completo en estado `CONFIRMED` y con el mismo `requestId`. Un 2xx inesperado, JSON incompleto, interrupción o 5xx deja el resultado sin verificar. Se conserva la versión del intento en memoria durante el permiso. Tras perder acceso se limpian cita, contexto, historial y versión. El mensaje genérico de resultado carece de identificadores y datos del paciente. Para reconciliar tras el vencimiento, el backend debe ofrecer una consulta con autorización renovada que vincule el intento con su resultado.

El contexto y el historial se consultan por separado. Si falla el historial completo pero llega el contexto autorizado, la vista puede mostrar los eventos recientes incluidos en ese contexto. Un 401, 403 o 404 en cualquiera de las dos consultas invalida la vista de esa atención.

El 429 muestra un aviso genérico cuando el navegador no puede leer `Retry-After`. Si se necesita mostrar los segundos exactos, el backend puede incluir `Retry-After` entre sus encabezados expuestos por CORS.
