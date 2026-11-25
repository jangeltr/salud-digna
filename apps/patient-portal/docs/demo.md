# Notas para presentar la demostración

Los pasos exactos de la parte del portal, lo que debe verse en cada pantalla y qué hacer si algo falla están en el [README](../README.md), sección «Demostración». Aquí solo va lo que necesita quien presenta.

**Validación.** La parte del portal se validó el 2026-11-24 contra la API central y el orquestador publicados, con `a8ddcc4`:

- creación del trámite identificado, con estudio y clínica;
- listado por identidad;
- renovación automática del permiso a los cinco minutos;
- historial y cancelación.

## Orden

1. **Portal:** pasos 1 a 5 del README.
2. **Call Center:** recupera y continúa el trámite según su propia documentación.
3. **Portal:** pasos 6 y 7 del README.
4. **Administración:** según su propia documentación.

El portal no emite autorizaciones para el Call Center. La autorización del paciente, `patient-assertion-consents`, queda para después del MVP: ver «Autorización para Call Center» en [decisions.md](decisions.md).

## Comprobación previa, sin público

1. Arranca el portal con la opción 3a del README. La línea `[portal]` del arranque debe decir `identidad del paciente: assertion (emisor: API central)` y `registro de cuentas: apagado`.
2. Inicia sesión con la cuenta de paciente.
3. Abre «Continuar»: debe mostrar «Tus trámites activos…» y no «No pudimos verificar tu identidad».
4. Confirma con quien presenta cada otra aplicación que está lista, según su propia documentación.

## Durante la demostración

- **Cuentas.** La cuenta de paciente la entrega el equipo de backend por un canal privado. No se proyecta en claro ni se escribe en diapositivas o chats.
- **No pulses «Enviar a confirmación»** en el portal: el trámite sigue en otro canal.
- **Si algo falla**, sigue la tabla del README. Si el emisor de acreditaciones falla, el plan B exige reiniciar el portal: mejor pasar al material grabado si no hay tiempo.

## Material de respaldo

Graba el recorrido completo en un ensayo previo, con datos sintéticos y sin mostrar cuentas, claves ni códigos que sigan vigentes.
