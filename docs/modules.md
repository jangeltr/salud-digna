# Módulos previstos

| Módulo | Responsabilidad |
| --- | --- |
| Auth | Autenticar pacientes, operadores y administradores y aplicar sus permisos. |
| Patients | Mantener el identificador interno y el perfil del paciente. |
| Identity | Resolver identidades verificadas por canal y vincularlas al paciente con trazabilidad. |
| Studies | Consultar el catálogo de estudios y sus requisitos. |
| Clinics | Mantener el catálogo de clínicas e identificar qué estudios ofrece cada sede. |
| Requests | Gestionar las solicitudes de estudio y su historial. |
| Context | Conservar la conversación, los mensajes y los datos parciales para retomar la atención entre canales. |
| Workflow | Coordinar transiciones de estado, transferencias al Call Center y asignaciones a operadores. |
| Appointments | Gestionar disponibilidad, reservas y cambios de cita. |
| Events | Publicar y distribuir eventos internos entre módulos. |
| Audit | Registrar acciones relevantes y correlacionarlas con el actor y la solicitud. |

Cada módulo se incorporará a `AppModule` cuando su primer flujo lo requiera. Los adaptadores de canal se incorporarán con sus integraciones y traducirán las entradas y salidas de cada canal. Los contratos públicos formarán parte de OpenAPI y podrán compartirse desde `packages/contracts/`.
