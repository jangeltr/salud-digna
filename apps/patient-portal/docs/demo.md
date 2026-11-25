# Notas para presentar la demostración

Los pasos exactos de la parte del portal, lo que debe verse en cada pantalla y qué hacer si algo falla están en el [README](../README.md), sección «Demostración». Aquí solo va lo que necesita quien presenta.

**Validación.** La parte del portal se validó el 2026-11-24 contra la API general y el orquestador publicados, con `a8ddcc4`:

- creación del trámite identificado, con estudio y clínica;
- listado por identidad;
- renovación automática del permiso a los cinco minutos;
- historial y cancelación.

## Recorrido

1. **Portal:** pasos 1 a 5 del README.
2. **Otras aplicaciones:** continúan el trámite según su propia documentación. La coordinación con ellas es del equipo.
3. **Portal:** pasos 6 y 7 del README.

El portal no emite autorizaciones para el Call Center. La autorización del paciente, `patient-assertion-consents`, queda para después del MVP: ver «Autorización para Call Center» en [decisions.md](decisions.md).

## Comprobación previa, sin público

1. Arranca el portal según «Instalación y arranque» del README. La línea `[portal]` del arranque debe decir `identidad del paciente: assertion (emisor: API central)` y `registro de cuentas: apagado`.
2. Inicia sesión con una cuenta de paciente de demo.
3. Abre «Continuar»: debe mostrar «Tus trámites activos…» y no «No pudimos verificar tu identidad».

## Durante la demostración

- **Cuentas.** Las cuentas de paciente de demo las administra el equipo en el servidor. No se proyectan en claro ni se escriben en diapositivas o chats.
- **No pulses «Enviar a confirmación»** en el portal: el trámite sigue en otro canal.
- **Si algo falla**, sigue la tabla del README. Si el emisor de acreditaciones falla, el plan B exige reiniciar el portal: si no hay tiempo, pasa al material grabado.

## Material de respaldo

Graba antes de la demostración el recorrido de la parte del portal, con datos sintéticos y sin mostrar cuentas, claves ni códigos que sigan vigentes.
