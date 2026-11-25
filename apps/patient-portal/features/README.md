# features

Un módulo por dominio, con los mismos nombres que usa la API.

| Carpeta | Contenido | Contrato |
| --- | --- | --- |
| `auth/` | Formularios y acciones de acceso, registro y cierre de sesión, y el resumen del perfil. | [Autenticación](../../../docs/api-auth.md) |
| `catalog/` | Listados, búsqueda, tarjetas y paginación de estudios y clínicas. | [Estudios](../../../docs/api-studies.md) y [clínicas](../../../docs/api-clinics.md) |
| `requests/` | Trámite de agendamiento: pasos, selección de estudio y clínica, revisión, continuidad en otro canal, códigos de continuidad, historial y cancelación. En modo heredado, también horario y código de asistencia. | [Solicitudes](../../../docs/api-requests.md). En modo orquestador, [escrituras](../../orchestrator/docs/journey-writes.md), [consultas](../../orchestrator/docs/journey-queries.md) y [continuidad](../../orchestrator/docs/continuity-codes.md) |
| `appointments/`, `help/`, `identity/` | Vacías, solo con `.gitkeep`. `/citas` y `/ayuda` muestran hoy un aviso de pantalla sin contenido. | — |
