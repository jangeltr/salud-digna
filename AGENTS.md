# Instrucciones para Codex

- Prioriza un MVP funcional y evita la sobreingeniería.
- Mantén los cambios acotados a la tarea. Evita refactorizaciones generales innecesarias.
- Ejecuta comprobaciones proporcionales al cambio. Evita pruebas exhaustivas.
- Mantén la compatibilidad de los contratos públicos. Revisa los cambios que afecten a la API, sus contratos y sus consumidores. Identifica y coordina cualquier ruptura antes de integrar.
- Documenta las decisiones técnicas relevantes en `docs/`.
- Modifica código de frontend únicamente con autorización explícita.
- Mantén las credenciales, los secretos y la información sensible fuera de Git.
- No modifiques servidores de producción ni ejecutes operaciones destructivas sobre bases de datos.
- Realiza commits o push únicamente con autorización explícita.

## Integración para equipos frontend

- Empieza por [la guía rápida](docs/INTEGRACION-FRONTENDS.md) y verifica método, ruta, parámetros, cuerpos y respuestas en [OpenAPI](docs/openapi.json).
- Usa la [guía pública](docs/frontend-publico.md) para Web y móvil, o la [guía de Call Center](docs/frontend-callcenter.md) para asesoría y administración.
- Usa `Authorization: Bearer <accessToken>` para operaciones protegidas. Confirma el rol, la titularidad y el permiso temporal en la guía. Aplica el prefijo `/api/v1` una sola vez.
- Contrasta ejemplos y pruebas con el esquema y los DTO. Usa datos sintéticos y comunica faltantes al equipo API con método, ruta, rol y código HTTP. Espera un contrato acordado antes de agregar rutas, campos o respuestas al cliente.
