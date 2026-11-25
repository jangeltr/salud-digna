# Guion de la demostración

Dos recorridos: el que se puede mostrar hoy, con un código de continuidad, y el previsto, sin código. Los textos entre comillas son los que muestran las pantallas. La configuración de cada modo está en el [README](../README.md), sección «Modos».

## Antes de empezar

**Configuración del portal.** `REQUESTS_BACKEND=orchestrator` y `PATIENT_IDENTITY_MODE` sin definir o en `none`.

**Configuración del Call Center.** Su integración con el orquestador debe estar activa: clave de su canal con los scopes `JOURNEYS_READ` y `EVENTS_PUBLISH`, según [Call Center y el orquestador](../../../docs/call-center-orchestrator.md). Si falta, su pantalla «Continuar atención» dice «Integración deshabilitada. Falta la configuración privada del servidor.»

**Un mismo orquestador.** El portal y el Call Center deben apuntar al mismo orquestador.

**Cuentas.** Una de paciente para el portal y una de asesor, con rol `ADVISOR`, para el Call Center. Las entrega el equipo de backend por un canal privado. Nunca se proyectan ni se escriben en pantalla.

**Comprobación previa, sin público.**
1. Abre el portal e inicia sesión con la cuenta de paciente.
2. En el Call Center, abre «Continuar atención» y comprueba que aparece el campo «Código de continuidad».

**El reloj manda.** El portal puede leer y cambiar un trámite durante cinco minutos desde que pulsa «Empezar el trámite». El código de continuidad nunca dura más que eso. Ensaya el recorrido para hacerlo entero en menos de cuatro minutos.

## Recorrido disponible hoy: Web, código de continuidad y Call Center

### En el portal

1. **Acceso.** Inicia sesión con la cuenta de paciente.
   - Se ve: la página «Mi espacio», y en el encabezado Estudios, Clínicas, Mi espacio, Continuar, Citas, Ayuda y Perfil.
2. **Elegir el estudio.** Abre «Estudios», elige uno y pulsa «Agendar este estudio».
   - Se ve: «Agendar un estudio», con «Vas a agendar `<estudio>`, `<precio>`.» y el texto «Al terminar lo envías a confirmación y continúas en la app móvil o en Call Center.»
3. **Empezar.** Pulsa «Empezar el trámite». Desde aquí cuentan los cinco minutos.
   - Se ve: el trámite en el paso «Elige una clínica», con «Llevas elegido: `<estudio>`» y el avance en tres pasos: Estudio, Clínica y Revisión.
   - La dirección termina en `/tramite/<folio>`. El folio es el identificador que verá después el Call Center.
4. **Elegir la clínica.** Pulsa «Elegir esta clínica» en una de ellas.
   - Se ve: «Revisa tu trámite», con el estudio, la clínica y el precio, el botón «Enviar a confirmación» y, más abajo, «Continuar en otro canal».
   - **No pulses «Enviar a confirmación»:** ese paso lo hace el Call Center.
5. **Generar el código.** En «Continuar en otro canal», pulsa «Generar código de continuidad».
   - Se ve: «Tu código de continuidad», doce caracteres en tres grupos de cuatro, como `XXXX-XXXX-XXXX`.
   - Debajo: «Vence a las HH:MM, hora del centro de México, en unos N minutos.», «Es de un solo uso.» y el botón «Copiar código».
   - **Cuánto dura:** como mucho cinco minutos, y nunca más allá de los cinco minutos del permiso del portal. Generarlo justo después de elegir la clínica deja casi todo ese tiempo.
   - El código solo está en esa pantalla: al recargar desaparece. No va en la dirección ni se guarda.

### En el Call Center

6. **Canjear.** Con la sesión de asesor, abre «Continuar atención». En «Código de continuidad» escribe el código, con o sin guiones, y pulsa «Continuar atención».
   - Se ve: «Contexto recuperado», con «Folio del trámite (UUID)», que es el mismo de la dirección del portal, «Estado vigente», «Paso vigente» y «Versión».
   - El estudio y la clínica aparecen como identificadores.
   - El acceso del Call Center dura lo menos de tres plazos: el permiso del canje, la sesión del asesor o cinco minutos ([Call Center y el orquestador](../../../docs/call-center-orchestrator.md), «Continuar atención para la demo»).
7. **Continuar el trámite.** Pulsa «Dejar pendiente de confirmación».
   - Se ve: «Atención registrada» y «Estado: Pendiente de confirmación».

### De vuelta en el portal

8. **Ver el avance.** Recarga el trámite dentro de sus cinco minutos.
   - Se ve: «Pendiente de confirmación», el resumen, «Folio del trámite» con «Copiar folio» y «Puedes continuar en la app móvil o en Call Center.»
9. **Historial.** Pulsa «Ver el historial del trámite».
   - Se ve: «Trámite creado» y «Selección actualizada», «En la web», y «Enviado a confirmación», hecho por el Call Center.
   - El portal nombra ese canal «En Call Center» si su código contiene «call». Si no, lo muestra como «En el canal `<código>`». El código de canal del Call Center no está documentado en el repositorio.

## Recorrido sin código: continuidad identificada

> **Pendiente de validar en el portal contra los servicios reales.** El emisor de acreditaciones y `access-grants` ya están en `main` (`17c9b27`), y la recuperación entre Web y Call Center se validó con las APIs reales, según el equipo de backend. El portal lo cubre en sus pruebas contra servicios simulados con el mismo contrato: `pnpm --filter @salud-digna/patient-portal test:identity`. El lado del Call Center usa el consentimiento del paciente, que el portal todavía no emite: ver «Emisor conectado» en [decisions.md](decisions.md).

Configuración: `REQUESTS_BACKEND=orchestrator`, `PATIENT_IDENTITY_MODE=assertion` y `PATIENT_ASSERTION_CHANNEL_KEY` con la credencial del canal Web ante el emisor.

1. **Acceso.** Inicia sesión con la cuenta de paciente.
   - Se ve: «Mi espacio», con «Tus trámites activos», que muestra los de cualquier canal: folio, estado y última actividad.
2. **Estudio, clínica y revisión**, como en los pasos 2 a 4 de arriba.
   - En «Continuar en otro canal» se ve: «Puedes seguir con este trámite en la app móvil o en Call Center. Al identificarte allí verás tus trámites activos, sin necesidad de código.»
   - El código queda plegado bajo «Otra forma de continuar».
3. **En el Call Center**, el asesor identifica al paciente y ve sus trámites activos, sin código. Cómo lo hace está pendiente de su equipo.
4. **De vuelta en el portal**, «Continuar» muestra el trámite con su estado nuevo. Al abrirlo, el permiso se renueva solo: nunca aparece «Necesita un permiso nuevo».

Si el emisor no responde, el portal dice «No pudimos verificar tu identidad» y no crea ni muestra ningún trámite.

## Si algo falla en vivo

| Qué se ve | Qué pasó | Qué hacer |
| --- | --- | --- |
| Portal: «Necesita un permiso nuevo» | Pasaron los cinco minutos del permiso del trámite. | Ir a «Agendar un estudio», pulsar «Empezar un trámite nuevo» y repetir más rápido. El trámite anterior queda en «Continuar», bloqueado. |
| Call Center: «El código no está disponible. Puede haber vencido o haberse usado. Solicita otro al canal emisor.» | El código venció, ya se usó o tiene un error de escritura. | Si el portal aún muestra el trámite, pulsar «Generar otro código» y canjear el nuevo. Si no, empezar un trámite nuevo. |
| Call Center: «El permiso del código venció. Solicita otro código.» | El código llegó a tiempo, pero el permiso del portal ya había vencido. | Empezar un trámite nuevo en el portal. |
| Call Center: «Se alcanzó el límite de canjes. Espera un minuto antes de volver a intentarlo.» | El orquestador limita los canjes por canal y minuto. | Esperar un minuto. Mientras, explicar el historial. |
| Portal: «Servicio no disponible», con «Reintentar» | El portal no obtuvo respuesta de un servicio. | Pulsar «Reintentar» una vez. Si sigue, pasar al material grabado. |
| Portal: «El servicio no respondió…» al crear o al elegir | Respuesta perdida o tiempo agotado. | Volver a pulsar: la creación no se duplica, porque se reenvía con la misma clave de idempotencia. |
| Portal: «No pudimos crear el trámite. Inténtalo de nuevo.» | El orquestador rechazó la creación: clave de canal, URL o proxy. | No se arregla en vivo. Pasar al material grabado. El diagnóstico está en [estado.md](estado.md), «Estado del despliegue». |
| Portal: «Has empezado demasiados trámites…» o «Has generado demasiados códigos…» | Topes del portal: 20 trámites y 30 códigos por paciente y hora. | Usar otra cuenta de paciente o retomar un trámite abierto. |

**Material de respaldo.** Graba el recorrido completo en un ensayo previo, con datos sintéticos y sin mostrar cuentas, claves ni códigos que sigan vigentes.
