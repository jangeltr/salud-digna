# Módulos del backend

| Módulo | Responsabilidad |
| --- | --- |
| Auth | Implementado. Registra pacientes, autentica las cuentas activas y ofrece guards reutilizables de autenticación y roles. |
| Patients | Mantener el identificador interno y el perfil del paciente. |
| Identity | Implementado. Vincula identidades mediante códigos temporales, resuelve internamente identidades verificadas y ofrece un simulador de desarrollo. |
| Studies | Implementado. Ofrece consulta pública de estudios activos y gestión del catálogo para administradores. |
| Clinics | Implementado. Ofrece consulta pública de clínicas activas y gestión del catálogo para administradores. |
| Requests | Implementado para agendamiento. Crea y recupera solicitudes, registra interrupciones y reanudaciones y controla escrituras concurrentes. |
| Context | El motor de solicitudes conserva el contexto parcial y registra las interacciones operativas de pausa y reanudación. |
| Workflow | El motor recalcula paso y estado a partir del contexto. Las transferencias al Call Center y las asignaciones quedan pendientes. |
| Appointments | Implementado para confirmación y consulta de citas propias. La disponibilidad y los cambios de cita quedan pendientes. |
| Events | Registrar eventos de negocio y, cuando se requiera, publicarlos y distribuirlos entre módulos. |
| Audit | Registrar acciones relevantes y correlacionarlas con el actor y la solicitud. |

Cada módulo pendiente se incorporará a `AppModule` cuando su primer flujo lo requiera. Los adaptadores de canal se incorporarán con sus integraciones y traducirán las entradas y salidas de cada canal. Los contratos públicos formarán parte de OpenAPI y podrán compartirse desde `packages/contracts/`.

El [modelo de datos del MVP](database.md) define las entidades que podrán usar estos módulos. La oferta de estudios por clínica, las asignaciones y las reglas de disponibilidad quedan para sus respectivos flujos.

Consulta los [contratos de Auth y la gestión inicial de administradores](api-auth.md).

Consulta los [contratos de Identity y el simulador](api-identity.md).

Consulta los [contratos del motor de solicitudes](api-requests.md).

Consulta los contratos de [clínicas](api-clinics.md) y [estudios](api-studies.md).

Consulta los [contratos de confirmación y consulta de citas](api-appointments.md).
