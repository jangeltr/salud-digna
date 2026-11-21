# API de identidad omnicanal

`Patient.id` identifica al paciente en todos los canales. La sesión JWT acredita quién controla la cuenta en la API. La prueba del canal externo se obtiene en ese canal mediante su adaptador. El correo de la cuenta sigue pendiente de verificación y un número recibido, conocido o declarado por el cliente no acredita su control.

## Contratos REST

Todas las rutas requieren un JWT Bearer de una cuenta activa con rol `PATIENT` y un perfil asociado. La API obtiene el `patientId` de la cuenta autenticada. Swagger UI está en `/api/docs`.

| Método y ruta | Solicitud | Resultado |
| --- | --- | --- |
| `GET /api/v1/identity` | Sin cuerpo. | `200 OK` con las identidades propias. |
| `POST /api/v1/identity/links` | `provider`. | `201 Created` con `linkId`, `code` y `expiresAt`. Incluye `Cache-Control: no-store`. |
| `POST /api/v1/identity/dev/confirm` | `provider`, `linkId` y `code`. | `200 OK` con la identidad sintética vinculada. Requiere habilitar el simulador. |

Los proveedores admitidos son `WEB`, `WHATSAPP`, `MOBILE` y `CALL_CENTER`.

Ejemplo de solicitud de código.

```json
{ "provider": "WHATSAPP" }
```

Ejemplo sintético de respuesta. Usa los valores emitidos por tu instalación al probar la confirmación.

```json
{
  "linkId": "00000000-0000-4000-8000-000000000001",
  "code": "EjemploSintetico_00001",
  "expiresAt": "2026-11-21T19:05:00.000Z"
}
```

Ejemplo de confirmación en el simulador.

```json
{
  "provider": "WHATSAPP",
  "linkId": "00000000-0000-4000-8000-000000000001",
  "code": "EjemploSintetico_00001"
}
```

La confirmación devuelve un objeto de esta forma. El listado devuelve un arreglo de objetos con la misma estructura.

```json
{
  "id": "00000000-0000-4000-8000-000000000002",
  "provider": "WHATSAPP",
  "externalId": "sim:+12025550100",
  "verifiedAt": null,
  "simulated": true
}
```

| Código | Significado |
| --- | --- |
| `400` | Cuerpo inválido o campos adicionales. En la confirmación también cubre códigos incorrectos, vencidos, consumidos, agotados o de otro paciente o canal. |
| `401` | Sesión ausente o inválida. |
| `403` | Rol insuficiente o cuenta sin perfil de paciente. |
| `404` | Simulador deshabilitado para una petición válida de confirmación. |
| `409` | Identidad de simulación ya asociada a otro paciente. La respuesta omite el titular. |

## Vinculación y resolución interna

- Cada código contiene 128 bits aleatorios, dura cinco minutos y admite hasta cinco intentos de validación para el desafío, paciente y proveedor correspondientes. PostgreSQL guarda solo su hash. Una actualización condicional incrementa el contador y, cuando el código coincide, lo consume una sola vez. Una colisión con una identidad ajena también consume el código correcto.
- El adaptador interno llama a `linkTrustedIdentity` con el identificador obtenido desde el canal y el par `linkId` y `code`. Debe comprobar la procedencia y el control del canal antes de invocar el servicio. WhatsApp usa E.164 con prefijo internacional. Los demás canales conservan mayúsculas y minúsculas en identificadores opacos de hasta 128 caracteres.
- `resolveVerifiedIdentity` distingue `UNKNOWN`, `UNVERIFIED` y `VERIFIED`. Solo `VERIFIED` incluye `patientId`. La operación se ofrece a módulos internos y puede usarse en contexto, solicitudes o Call Center. La autenticación del operador y la autorización sobre el recurso son comprobaciones adicionales. Una identidad desconocida deja el vínculo pendiente de una sesión de paciente.
- `AuditLog` registra solicitudes, vinculaciones y rechazos de intentos contabilizados. Solo registra `IDENTITY_VERIFIED` cuando el adaptador confiable aporta evidencia y se establece `verifiedAt`. En los metadatos se usan proveedor, origen y motivo cuando corresponde, sin incluir el código, su hash, tokens o identificadores externos.

## Simulación local

Con la migración aplicada en una base de desarrollo, configura `NODE_ENV=development` e `IDENTITY_SIMULATOR_ENABLED=true` en `apps/api/.env` y reinicia la API. Usa un JWT de paciente para pedir el código y confirmar con el mismo proveedor. Repite la confirmación para comprobar el rechazo por uso único.

El servidor aporta una identidad sintética fija por proveedor. Así el cliente no elige el identificador de destino. El registro usa el prefijo reservado `sim:`, conserva `verifiedAt: null` y se excluye de la resolución real. Cada fixture puede pertenecer a un solo paciente por base de desarrollo. El simulador está deshabilitado por defecto y solo funciona en desarrollo con activación explícita.

WhatsApp real queda pendiente de un adaptador que valide la firma y el origen del webhook, extraiga el identificador del remitente, normalice el teléfono y entregue el desafío desde ese canal. También queda pendiente definir la retención de desafíos vencidos y la interacción mediante la que se presenta el par `linkId` y `code` en el canal real.
