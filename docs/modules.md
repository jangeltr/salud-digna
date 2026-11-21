# Módulos previstos

| Módulo | Responsabilidad |
| --- | --- |
| Auth | Autenticar pacientes, operadores y administradores y aplicar sus permisos. |
| Patients | Mantener el identificador interno y el perfil del paciente. |
| Identity | Resolver identidades verificadas por canal y vincularlas al paciente con trazabilidad. |
| Studies | Consultar el catálogo de estudios y sus requisitos. |
| Clinics | Mantener el catálogo de clínicas e identificar qué estudios ofrece cada sede. |
| Requests | Gestionar las solicitudes de estudio y su historial. |
| Context | Conservar los datos parciales de la solicitud y registrar las interacciones necesarias para retomar la atención entre canales. |
| Workflow | Coordinar transiciones de estado, transferencias al Call Center y asignaciones a operadores. |
| Appointments | Gestionar disponibilidad, reservas y cambios de cita. |
| Events | Registrar eventos de negocio y, cuando se requiera, publicarlos y distribuirlos entre módulos. |
| Audit | Registrar acciones relevantes y correlacionarlas con el actor y la solicitud. |

Cada módulo se incorporará a `AppModule` cuando su primer flujo lo requiera. Los adaptadores de canal se incorporarán con sus integraciones y traducirán las entradas y salidas de cada canal. Los contratos públicos formarán parte de OpenAPI y podrán compartirse desde `packages/contracts/`.

El [modelo de datos del MVP](database.md) define las entidades que podrán usar estos módulos. La oferta de estudios por clínica, las asignaciones y las reglas de disponibilidad quedan para sus respectivos flujos.
