# Interpretación de conversaciones con OpenAI

`ConversationModule` selecciona el intérprete al iniciar. Cuando OpenAI está habilitado, el adaptador usa el SDK oficial de Node.js con Responses API y Structured Outputs mediante `text.format` y JSON Schema estricto. La respuesta se valida también en el backend. El contrato REST y las operaciones de negocio siguen en los servicios existentes. [SDK oficial](https://github.com/openai/openai-node/releases/tag/v7.62.0) · [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses)

## Configuración local

Instala las dependencias con `pnpm install` desde la raíz. Configura manualmente `apps/api/.env` y reinicia la API para cambiar de intérprete.

| Variable | Valor predeterminado | Uso |
| --- | --- | --- |
| `OPENAI_ENABLED` | `false` | Activa el proveedor con `true`. |
| `OPENAI_API_KEY` | Vacía | Clave privada del proyecto, necesaria al activar el proveedor. |
| `OPENAI_MODEL` | Vacío | Modelo accesible para el proyecto, con Responses API y Structured Outputs. |
| `OPENAI_TIMEOUT_MS` | `8000` | Límite de 1 a 30 000 ms por llamada. |

Elige un modelo disponible para tu proyecto. `gpt-6-luna` es un ejemplo orientado a tareas de bajo costo que documenta soporte para ambas capacidades. Para ese modelo, la aplicación solicita `reasoning.effort: none` en esta tarea de clasificación. Si la API rechaza el modelo o su formato, se usa el intérprete local. [Ficha del modelo](https://developers.openai.com/api/docs/models/gpt-6-luna)

Al desactivar el proveedor, se usa la clasificación determinista local. Una configuración incompleta registra un error que identifica las variables requeridas y permite seguir con el modo local. El mismo fallback cubre fallos de carga del SDK, errores del proveedor, respuestas incompletas o inválidas y una confianza inferior a 0.65.

## Datos, autorización y consumo

- El mensaje se reduce a vocabulario operativo y, cuando se reconoce un único instante ISO 8601 explícito, a ese instante. Los mensajes con indicadores de secretos, códigos o información clínica sensible se interpretan localmente. El filtrado limita el vocabulario disponible para reconocer nombres de catálogo. Para la prueba manual usa exclusivamente datos sintéticos.
- El contexto enviado contiene estado, paso, indicadores de selecciones y acciones posibles. Los identificadores, nombres de pacientes, notas y conversaciones permanecen en el backend.
- El modelo propone una intención, confianza, parámetros y una sugerencia de texto opcional. El backend usa mensajes controlados y prioriza exclusivamente opciones del catálogo existente. Una fecha inferida debe coincidir con un instante explícito escrito por el usuario. Para una expresión ambigua como «mañana», el servicio pide fecha, hora y zona horaria.
- Las selecciones explícitas siguen la ruta de escritura de Requests con JWT, propiedad y versión. Se procesan sin llamar a OpenAI. El proveedor carece de herramientas y su salida no ejecuta acciones.
- Se envía como máximo una petición de interpretación por mensaje elegible, con 400 caracteres de texto filtrado, un máximo de 256 tokens de salida, `store: false` y cero reintentos del SDK. Los logs registran resultado, latencia, tipo de fallo y conteos de tokens cuando están disponibles. Excluyen mensajes, respuestas, credenciales y errores brutos del proveedor.

## Prueba manual con una clave real

Con autorización para consumir la API, activa OpenAI y el simulador de conversaciones, inicia la API y usa un JWT de paciente de demostración. Envía «Quiero seguir con mi cita» o «¿En qué quedó mi ultrasonido?» a `POST /api/v1/conversations/dev/message`. El contrato devuelve el mismo formato y los logs técnicos muestran si la respuesta fue interpretada o usó fallback. Para una fecha sin hora ni zona, verifica que la respuesta solicite esos datos cuando la solicitud ya tenga clínica.

La disponibilidad de horarios y el uso con datos de pacientes reales quedan fuera de esta prueba. Para volver al modo local, establece `OPENAI_ENABLED=false` y reinicia la API.
