# Acreditaciones institucionales para el orquestador

La API central usa `Patient.id` como `CUSTOMER_ID`. Es el UUID persistente de
la ficha de paciente, distinto del ID de la cuenta. Una sesión de paciente
solo puede acreditar el UUID asociado a su propia cuenta activa. El login
existente acredita esa cuenta. Una prueba de identidad legal requiere
controles adicionales del canal.

## Configuración de servidor

Genera el par Ed25519 una vez en un directorio privado fuera del repositorio:

```sh
umask 077
openssl genpkey -algorithm ED25519 -out central-patient-assertion.pem
openssl pkey -in central-patient-assertion.pem -pubout -out central-patient-assertion.pub.pem
```

- `PATIENT_ASSERTION_PRIVATE_KEY` en la API central contiene el PEM privado
  PKCS#8 multilineal. El orquestador recibe solo el PEM público SPKI en
  `ORCHESTRATOR_CENTRAL_ASSERTION_PUBLIC_KEY`. La rotación requiere coordinar
  ambas configuraciones. Los consentimientos y acreditaciones anteriores
  pierden vigencia criptográfica al sustituir el par.
- `PATIENT_ASSERTION_CHANNELS` en la API central es un objeto JSON con los
  códigos de canal registrados y su rol de sesión permitido. Cada canal usa
  un secreto distinto de 32 bytes aleatorios, enviado en base64url sin
  relleno. Guarda el secreto solo en el backend del canal y configura en
  la API central su `secretDigest`, el SHA-256 de los bytes originales en
  64 caracteres hexadecimales minúsculos. La credencial es independiente
  de la API key del orquestador.

```json
{
  "demo-web": {"role":"PATIENT","secretDigest":"<sha256-hex>"},
  "demo-callcenter": {"role":"ADVISOR","secretDigest":"<sha256-hex>"}
}
```

Los códigos deben coincidir con `Channel.code` en el orquestador. Las
configuraciones de emisión se cargan al primer uso. Reinicia la API de
forma coordinada al rotar una clave o retirar un canal. Las rutas devuelven
`503` si falta configuración válida. Los endpoints existentes conservan
su configuración y funcionamiento.

## Contrato HTTP

Ambas rutas requieren HTTPS, `Content-Type: application/json`,
`Authorization: Bearer <JWT de la cuenta humana>` y
`X-Patient-Assertion-Channel-Key: <secreto del backend>`. El backend
construye la solicitud sin reenviar el encabezado `Origin` del navegador.
La sesión humana y la credencial del backend se verifican por separado.
Guarda ambos tokens de respuesta en servidor y exclúyelos, junto con
los encabezados de credenciales, de logs, trazas y respuestas al navegador.

| Ruta | Sesión y cuerpo | Éxito |
| --- | --- | --- |
| `POST /api/v1/auth/patient-assertions` | `PATIENT` en un backend de paciente. Envía `{}`. | `200` con `{"assertion":"<JWS>"}` |
| `POST /api/v1/auth/patient-assertion-consents` | `PATIENT` en un backend de paciente. Envía `{"advisorId":"<UUID de cuenta del asesor>","channel":"demo-callcenter"}`. | `200` con `{"consent":"<JWS de consentimiento>"}` |
| `POST /api/v1/auth/patient-assertions` | `ADVISOR` en el backend destinatario. Envía `{"consent":"<JWS de consentimiento>"}`. | `200` con `{"assertion":"<JWS>"}` |

Las respuestas exitosas incluyen `Cache-Control: no-store`. Los campos
adicionales y los cuerpos inválidos devuelven `400`. Credenciales ausentes
o inválidas devuelven `401`. Un rol incompatible, consentimiento faltante,
inválido, vencido o ajeno al asesor y canal devuelve `403`.

El JWS que se envía al orquestador tiene cabecera
`{"alg":"EdDSA","typ":"sd-patient+jwt"}`, emisor
`https://api.salud-digna.app`, audiencia `https://orchestrator.salud-digna.app`
y scope `journeys:patient`. Incluye `channel` derivado de la credencial,
`customerId` derivado de la cuenta o consentimiento, `sub` con el UUID
de la cuenta humana, `jti` aleatorio e `iat` y `exp` en segundos Unix.
Vence en un máximo de cinco minutos, acotado además por el JWT humano y,
para el asesor, por el consentimiento.

## Web → Call Center

1. Web llama al emisor con la sesión del paciente. Usa la acreditación como
   `X-Patient-Assertion` al crear el trámite en el orquestador.
2. Cuando el paciente autoriza explícitamente la atención de un asesor
   identificado, Web obtiene un consentimiento dirigido a su UUID de
   cuenta y al canal de Call Center. Los backends deben acordar cómo
   identificar al asesor y entregar el consentimiento de forma privada.
   En la demo, pueden transferirlo por un medio administrativo privado
   entre backends, manteniendo la decisión en la sesión del paciente.
3. Call Center usa su JWT de asesor y su credencial de canal para presentar
   el consentimiento al emisor central. La API verifica que el paciente
   siga activo y que la autorización corresponda al asesor y canal
   autenticados. Call Center usa la acreditación resultante para listar
   trámites activos y solicitar un permiso para el elegido al orquestador.

El consentimiento permite recuperar trámites del paciente durante su
vigencia. Tiene audiencia y tipo propios y solo puede canjearlo el asesor
y canal destinatarios. Es reutilizable durante ese plazo y carece de
revocación individual anticipada en el MVP. El permiso de asistencia
preexistente sobre una solicitud central conserva su alcance. La
transferencia entre backends queda pendiente de implementación en los
canales y no usa códigos de continuidad del orquestador.
