# Guion de la demostración

Un recorrido principal, sin código, y una contingencia con código de continuidad. Los textos entre comillas son los que muestran las pantallas. La configuración de cada modo está en el [README](../README.md), sección «Modos».

**Validación.** La parte del portal del recorrido principal se validó el 2026-11-24 contra la API central y el orquestador publicados, con `a8ddcc4`:

- creación del trámite identificado, con estudio y clínica;
- listado por identidad;
- renovación automática del permiso a los cinco minutos;
- historial y cancelación.

La recuperación desde Call Center sin código la validó el equipo de backend con las APIs reales. El Call Center recupera el trámite a través del orquestador, sin intervención del portal.

La autorización del paciente para Call Center, `patient-assertion-consents`, queda pospuesta después del MVP y no forma parte de esta demostración. Sus preguntas, para una fase posterior, están en «Autorización para Call Center» en [decisions.md](decisions.md).

## Antes de empezar

**Configuración del portal.** `REQUESTS_BACKEND=orchestrator`, `PATIENT_IDENTITY_MODE=assertion` y `PATIENT_ASSERTION_CHANNEL_KEY` con la credencial del canal Web ante el emisor. La API central y el orquestador deben incluir `17c9b27` de `main`.

**Configuración del Call Center.** Su integración con el orquestador debe estar activa, según [Call Center y el orquestador](../../../docs/call-center-orchestrator.md). Si falta, su pantalla «Continuar atención» dice «Integración deshabilitada. Falta la configuración privada del servidor.»

**Un mismo orquestador.** El portal y el Call Center deben apuntar al mismo orquestador.

**Cuentas.** Una de paciente para el portal y una de asesor, con rol `ADVISOR`, para el Call Center. Las entrega el equipo de backend por un canal privado. Nunca se proyectan ni se escriben en pantalla.

**Comprobación previa, sin público.**
1. Abre el portal e inicia sesión con la cuenta de paciente.
2. Abre «Continuar»: debe mostrar «Tus trámites activos…» y no «No pudimos verificar tu identidad».
3. En el Call Center, abre «Continuar atención».

## Recorrido principal: continuidad identificada, sin código

### En el portal

1. **Acceso.** Inicia sesión con la cuenta de paciente.
   - Se ve: «Mi espacio», con «Tus trámites activos», que muestra los de cualquier canal: folio, estado y última actividad.
2. **Elegir el estudio.** Abre «Estudios», elige uno y pulsa «Agendar este estudio».
   - Se ve: «Agendar un estudio», con «Vas a agendar `<estudio>`, `<precio>`.»
3. **Empezar.** Pulsa «Empezar el trámite».
   - Se ve: el trámite en «Elige una clínica», con «Llevas elegido: `<estudio>`» y el avance en tres pasos: Estudio, Clínica y Revisión.
   - El trámite queda ligado al paciente en el orquestador por su identidad institucional.
4. **Elegir la clínica.** Pulsa «Elegir esta clínica».
   - Se ve: «Revisa tu trámite», con el estudio, la clínica y el precio, y «Continuar en otro canal».
   - Allí se lee: «Puedes seguir con este trámite en la app móvil o en Call Center. Al identificarte allí verás tus trámites activos, sin necesidad de código.»
   - **No pulses «Enviar a confirmación»:** ese paso lo hace el Call Center.
5. **Listado.** Abre «Continuar».
   - Se ve: el trámite con su folio, «En curso» y la última actividad, con «Continuar este trámite».

### En el Call Center

6. **Recuperar el trámite del paciente, sin código.** El Call Center recupera los trámites activos del paciente a través del orquestador y abre el elegido. El portal no interviene y no hace falta código. El equipo de backend lo validó con las APIs reales.
   - Si el trámite no aparece, usa la contingencia de abajo para este paso.
7. **Continuar.** El asesor revisa estudio y clínica y deja el trámite pendiente de confirmación.

### De vuelta en el portal

8. **Ver el avance.** Abre el trámite desde «Continuar».
   - Se ve: «Pendiente de confirmación», con el folio y el resumen.
   - Aunque hayan pasado más de cinco minutos, el trámite se abre: el permiso se renueva solo y nunca aparece «Necesita un permiso nuevo».
9. **Historial.** Pulsa «Ver el historial del trámite».
   - Se ve: «Trámite creado» y las dos «Selección actualizada», en la web, y el envío a confirmación hecho por el Call Center.
   - El portal nombra ese canal «En Call Center» si su código contiene «call». Si no, lo muestra como «En el canal `<código>`».

## Contingencia: código de continuidad

Sirve con la misma configuración, sin reiniciar nada. Úsala si el Call Center no puede recuperar el trámite por identidad.

1. En el trámite, en «Continuar en otro canal», abre «Otra forma de continuar» y pulsa «Generar código de continuidad».
   - Se ve: «Tu código de continuidad», doce caracteres en tres grupos de cuatro, con «Vence a las HH:MM, hora del centro de México, en unos N minutos.», «Es de un solo uso.» y «Copiar código».
   - **Cuánto dura:** como mucho cinco minutos, y nunca más que el permiso del portal sobre ese trámite.
   - El código solo está en esa pantalla: no va en la dirección ni se guarda.
2. En el Call Center, abre «Continuar atención», escribe el código con o sin guiones y pulsa «Continuar atención».
   - Se ve: «Contexto recuperado», con «Folio del trámite (UUID)», el mismo de la dirección del portal, «Estado vigente», «Paso vigente» y «Versión».
3. Pulsa «Dejar pendiente de confirmación».
   - Se ve: «Atención registrada» y «Estado: Pendiente de confirmación».
4. Sigue con el paso 8 del recorrido principal.

## Si algo falla en vivo

| Qué se ve | Qué pasó | Qué hacer |
| --- | --- | --- |
| Portal: «No pudimos verificar tu identidad» en «Continuar», «Mi espacio» o «Agendar un estudio», sin botón para empezar | El emisor de acreditaciones de la API central no responde o rechaza la credencial del canal. | No se arregla en vivo: el portal no crea ni lee trámites sin acreditación. Plan B: reiniciar el portal con `PATIENT_IDENTITY_MODE=none` y hacer la contingencia con código. Los trámites creados así no quedan ligados al paciente. |
| Portal: «Servicio no disponible», con «Reintentar» | El orquestador o la API no respondieron. | Pulsar «Reintentar» una vez. Si sigue, pasar al material grabado. |
| Portal: «El servicio no respondió…» al crear o al elegir | Respuesta perdida o tiempo agotado. | Volver a pulsar. La creación no se duplica, porque se reenvía con la misma clave de idempotencia. |
| Portal: «No pudimos crear el trámite. Inténtalo de nuevo.» | El orquestador rechazó la creación: clave de canal, URL o proxy. | Pasar al material grabado. El diagnóstico está en [estado.md](estado.md). |
| Portal: la lista de «Continuar» sale vacía aunque haya trámites | El orquestador responde igual a una identidad sin trámites que a una acreditación rechazada. | Intentar empezar un trámite: si la acreditación falla, aparece «No pudimos verificar tu identidad». |
| Call Center: «El código no está disponible. Puede haber vencido o haberse usado. Solicita otro al canal emisor.» | En la contingencia, el código venció, ya se usó o se escribió mal. | Volver al trámite en el portal y pulsar «Generar otro código». |
| Call Center: «Se alcanzó el límite de canjes. Espera un minuto antes de volver a intentarlo.» | El orquestador limita los canjes por canal y minuto. | Esperar un minuto. Mientras, explicar el historial. |
| Portal: «Has empezado demasiados trámites…» o «Has generado demasiados códigos…» | Topes del portal: 20 trámites y 30 códigos por paciente y hora. | Retomar un trámite abierto desde «Continuar». |

**Material de respaldo.** Graba el recorrido completo en un ensayo previo, con datos sintéticos y sin mostrar cuentas, claves ni códigos que sigan vigentes.
