# Salud Digna — Adecuaciones del Portal Web para continuidad omnicanal

Estamos realizando cambios en la arquitectura de integración para que el paciente pueda iniciar un trámite desde un canal y continuarlo en otro **sin generar ni proporcionar códigos de continuidad**.

Necesitamos que comiences a adaptar `apps/patient-portal` a este funcionamiento.

## 1. Arquitectura aprobada

Cada canal es responsable de verificar la identidad del paciente utilizando su propio mecanismo de autenticación.

La **API central (`apps/api`)** administra la identidad institucional del paciente, representada por un identificador único y estable denominado `CUSTOMER_ID`.

El **orquestador (`apps/orchestrator`)** registra los trámites, sus eventos, estados, historial y contexto. No autentica nuevamente al paciente, pero sí valida que la acreditación institucional recibida sea legítima.

El flujo será:

1. El paciente inicia sesión en Portal Web.
2. El portal obtiene su identidad autenticada desde la API central.
3. El backend del portal solicita a la API central una acreditación institucional para el canal `demo-web`.
4. La API central devuelve un JWS firmado con Ed25519, asociado al `CUSTOMER_ID` del paciente.
5. El portal envía ese JWS al orquestador mediante `X-Patient-Assertion`.
6. El orquestador registra o recupera los trámites correspondientes al paciente.
7. Cuando el paciente se identifica desde otro canal, ese canal puede recuperar los mismos trámites mediante una acreditación propia.

**No es necesario que el paciente genere códigos para cambiar de canal.**

## 2. Contratos implementados en el orquestador

El orquestador ya tiene implementados localmente los siguientes endpoints:

**Crear un trámite identificado**

`POST /api/v1/journeys`

Encabezados:

- `Authorization: Bearer <API_KEY_DEL_CANAL>`
- `X-Patient-Assertion: <JWS_INSTITUCIONAL>`
- `Idempotency-Key: <CLAVE_UNICA>`

El cuerpo continúa siendo:

```json
{
  "type": "APPOINTMENT"
}
```

El trámite quedará asociado al `CUSTOMER_ID` acreditado.

**Consultar los trámites activos del paciente**

`GET /api/v1/journeys?active=true`

Encabezados:

- `Authorization: Bearer <API_KEY_DEL_CANAL>`
- `X-Patient-Assertion: <JWS_INSTITUCIONAL>`

Devuelve `{"items":[...]}` con los trámites activos asociados al paciente, en estados `DRAFT`, `IN_PROGRESS` o `PENDING_CONFIRMATION`.

**Obtener autorización para continuar un trámite**

`POST /api/v1/journeys/:journeyId/access-grants`

Encabezados:

- `Authorization: Bearer <API_KEY_DEL_CANAL>`
- `X-Patient-Assertion: <JWS_INSTITUCIONAL>`

No requiere cuerpo.

Devuelve el permiso `grant` y su fecha de vencimiento. Este permiso debe utilizarse en `X-Journey-Grant` para consultar contexto, historial y publicar eventos.

Los endpoints existentes para lectura de contexto, historial y publicación de eventos se mantienen.

## 3. Cambios requeridos en Portal Web

- Mantener el inicio de sesión actual mediante la API central.
- Integrar, exclusivamente desde el backend Next.js, la solicitud de acreditación institucional del paciente.
- Incluir `X-Patient-Assertion` en la creación de nuevos trámites.
- Al ingresar a la sección de trámites, consultar automáticamente los trámites activos del paciente.
- Permitir seleccionar y continuar cualquiera de sus trámites activos.
- Solicitar un nuevo `access-grant` cuando sea necesario para acceder al contexto, historial o publicar eventos.
- Mantener `Idempotency-Key`, `expectedVersion` y `externalEventId` según los contratos existentes.
- Mostrar los estados e información actualizada provenientes del orquestador.
- Evitar que el paciente necesite un código de continuidad para cambiar de canal.

Los códigos actuales pueden conservarse como funcionalidad alternativa, pero no deben ser obligatorios ni presentarse como el mecanismo principal.

## 4. Integración pendiente con la API central

Se está desarrollando un endpoint institucional, previsto como:

`POST /api/v1/auth/patient-assertions`

Este endpoint emitirá una acreditación vinculada a la sesión autenticada del paciente y al canal autorizado.

Respuesta prevista:

```json
{
  "assertion": "<JWS_FIRMADO>"
}
```

La acreditación tendrá una vigencia máxima de cinco minutos y deberá renovarse cuando sea necesario.

**Importante:** el contrato de autenticación y solicitud todavía está en desarrollo. No inventar encabezados, credenciales ni mecanismos de verificación. Preparar el adaptador para integrar el contrato definitivo cuando se entregue.

## 5. Seguridad

- Nunca exponer las API keys del orquestador en el navegador.
- Nunca enviar la clave privada Ed25519 al Portal Web.
- Mantener el JWS institucional y los `access-grants` exclusivamente en el backend.
- No guardar acreditaciones en `localStorage`, `sessionStorage` ni enviarlas al cliente.
- No permitir que el navegador proporcione libremente un `CUSTOMER_ID` para consultar otros pacientes.
- No registrar credenciales, acreditaciones o permisos en logs.
- Mantener la separación de sesiones entre pacientes.
- No permitir que un error de acreditación se convierta silenciosamente en una creación de trámite anónimo o provisional.
- No modificar el comportamiento de autenticación actual de la API general.

## 6. Consideraciones importantes

Actualmente el portal ya permite crear trámites mediante el orquestador y completar el flujo de selección de estudio y clínica.

Ese funcionamiento debe conservarse.

Sin embargo, los trámites creados anteriormente sin acreditación institucional no aparecerán automáticamente en la nueva consulta por `CUSTOMER_ID`. Para probar el flujo nuevo deberán crearse trámites identificados.

Los cambios del orquestador todavía no están desplegados en producción.

## 7. Forma de trabajo

Puedes comenzar inmediatamente con las adecuaciones internas del Portal Web, preparando los adaptadores y las pantallas necesarias.

Priorizar:

1. Integración de acreditación institucional.
2. Creación de trámites identificados.
3. Recuperación automática de trámites activos.
4. Continuación del trámite seleccionado mediante `access-grants`.

Evitar rediseños, dependencias innecesarias o modificaciones fuera de `apps/patient-portal`.

No realizar despliegues a producción hasta que confirmemos la integración definitiva de `apps/api` y `apps/orchestrator`.

**Objetivo de la demostración:** un paciente inicia un trámite desde Portal Web y posteriormente puede continuarlo desde Call Center o WhatsApp, conservando el estudio, clínica, estado e historial, sin códigos de continuidad y sin repetir información.
