# API de autenticación

Las rutas usan el prefijo `/api/v1/auth`. Los cuerpos de las solicitudes y respuestas usan JSON. Swagger UI está en `/api/docs` y la especificación OpenAPI en `/api/docs-json`.

| Método y ruta | Autenticación | Resultado |
| --- | --- | --- |
| `POST /api/v1/auth/register` | Pública | `201 Created` con la cuenta y su perfil de paciente. |
| `POST /api/v1/auth/login` | Pública | `200 OK` con el JWT y datos mínimos de la cuenta. |
| `GET /api/v1/auth/me` | `Authorization: Bearer <accessToken>` | `200 OK` con los datos públicos de la cuenta activa y su perfil, si está vinculado. |

Las [acreditaciones institucionales](api-patient-assertions.md) usan la
sesión humana y una credencial privada del backend del canal.

## Registro

`firstName` y `lastName` requieren de 1 a 100 caracteres tras recortar espacios. `email` requiere un correo válido de hasta 254 caracteres y se almacena en minúsculas, sin espacios exteriores. `password` requiere de 12 a 128 caracteres y conserva los espacios ingresados. `phone` admite de 1 a 32 caracteres si se envía. Omítelo cuando no se conozca. Los campos adicionales se rechazan con `400`.

Ejemplo de solicitud. Sustituye el marcador de contraseña por una contraseña elegida para la cuenta.

```json
{
  "firstName": "Alex",
  "lastName": "Ejemplo",
  "email": "paciente@example.test",
  "password": "<contraseña elegida>",
  "phone": "+525500000000"
}
```

El registro asigna `PATIENT`, guarda el hash con Argon2id y usa la restricción de correo único de PostgreSQL. El correo se usa para acceder a la cuenta y queda pendiente de verificación. La vinculación de identidades externas se hará en su propio flujo.

El registro y `GET /me` usan la misma forma de respuesta.

```json
{
  "id": "00000000-0000-4000-8000-000000000001",
  "email": "paciente@example.test",
  "role": "PATIENT",
  "isActive": true,
  "patientId": "00000000-0000-4000-8000-000000000002",
  "patient": {
    "id": "00000000-0000-4000-8000-000000000002",
    "firstName": "Alex",
    "lastName": "Ejemplo",
    "email": "paciente@example.test",
    "phone": "+525500000000"
  }
}
```

`patientId` y `patient` son `null` para una cuenta sin perfil vinculado. En el perfil, `email` y `phone` admiten `null`.

## Inicio de sesión

Envía el correo y la contraseña de la cuenta. `password` admite de 1 a 128 caracteres en este endpoint.

```json
{
  "email": "paciente@example.test",
  "password": "<contraseña elegida>"
}
```

```json
{
  "accessToken": "<jwt>",
  "tokenType": "Bearer",
  "expiresIn": 1800,
  "user": {
    "id": "00000000-0000-4000-8000-000000000001",
    "email": "paciente@example.test",
    "role": "PATIENT"
  }
}
```

`expiresIn` indica segundos. La API firma con HS256 usando `JWT_SECRET` y exige firma, algoritmo y expiración válidos. El JWT contiene el ID de cuenta en `sub`, el rol y los tiempos estándar. La autorización comprueba en PostgreSQL que la cuenta siga activa y conserve el rol del token. Al vencer el JWT, el usuario vuelve a iniciar sesión.

## Errores

| Código | Cuándo ocurre |
| --- | --- |
| `400 Bad Request` | Cuerpo inválido o campos adicionales en registro o login. La respuesta de validación incluye un arreglo de mensajes. |
| `401 Unauthorized` | Login con credenciales incorrectas, cuenta ausente o inactiva. La respuesta de login usa el mismo mensaje en esos casos. En `/me`, indica que la sesión falta o ya no es válida. |
| `409 Conflict` | Correo ya registrado en el registro público. |
| `429 Too Many Requests` | El IP alcanzó el límite compartido de registro y login. `Retry-After` indica segundos antes del siguiente intento. |

## Roles

| Rol | Alcance previsto |
| --- | --- |
| `PATIENT` | Gestionar sus propios trámites. |
| `ADVISOR` | Atender solicitudes desde Call Center. |
| `ADMIN` | Supervisar el sistema. |

Los módulos futuros pueden importar `AuthModule` y usar `@UseGuards(JwtAuthGuard, RolesGuard)` en ese orden, con `@Roles([UserRole.ADMIN])` u otros roles permitidos. `@CurrentUser()` obtiene la cuenta validada. Un usuario autenticado con rol insuficiente recibe HTTP 403. Los permisos por recurso se comprobarán en sus módulos.

## Creación de un administrador

Desde la raíz, configura `DATABASE_URL` en `apps/api/.env` para el entorno autorizado y ejecuta en una terminal interactiva.

```sh
pnpm --filter @salud-digna/api build
pnpm --filter @salud-digna/api auth:create-admin
```

La CLI solicita correo, contraseña y confirmación con la entrada de contraseña oculta. Crea una cuenta `ADMIN` sin perfil asociado. Si el correo ya existe, devuelve un error y conserva la cuenta anterior. Usa la misma ruta de inicio de sesión para la cuenta creada.

## Creación de un asesor de pruebas

Usa una base local o de demostración previamente preparada y autorizada. Antes de ejecutar la CLI, verifica que la `DATABASE_URL` efectiva del proceso apunte a esa base. Mantén la configuración de conexión fuera de Git.

Desde la raíz, ejecuta en una terminal interactiva.

```sh
pnpm --filter @salud-digna/api build
pnpm --filter @salud-digna/api auth:create-advisor
```

La CLI solicita el correo de prueba, una contraseña de 12 a 128 caracteres y su confirmación. La contraseña se introduce con el eco desactivado. Usa una contraseña exclusiva para el entorno de prueba y compártela con el asesor autorizado por un canal privado. La CLI rechaza argumentos y correos duplicados, y crea exclusivamente cuentas `ADVISOR` sin perfil de paciente. El asesor inicia sesión mediante `POST /api/v1/auth/login`. El registro público sigue creando cuentas `PATIENT`.

## Límites del MVP y comprobación local

- Registro e inicio de sesión comparten hasta 10 intentos por IP en una ventana de 15 minutos. Cada login reserva un intento al ingresar y libera solo su propia reserva si la respuesta termina con HTTP 200. Los fallos, las solicitudes interrumpidas y todos los registros consumen cupo. Los intentos contra correos distintos comparten el mismo contador. Al agotarse el cupo, la API devuelve HTTP 429 con `Retry-After`. El canje de Call Center conserva su límite independiente, incluidos los canjes exitosos.
- El contador vive en memoria acotada por proceso y se reinicia con él. Clientes tras la misma IP pública o que usan un intermediario servidor-servidor pueden compartir cupo. Consulta la [configuración de Nginx y Next.js](deployment.md#ip-del-cliente-detrás-de-nginx).
- El correo aún no se verifica. OAuth, MFA, recuperación de contraseñas, refresh tokens y administración HTTP de cuentas quedan para incrementos posteriores.
- Con PostgreSQL local migrado, inicia la API y abre Swagger UI. Registra una cuenta sintética con correo nuevo, inicia sesión y usa **Authorize** con el JWT para comprobar que `GET /me` devuelve su perfil. Retira el JWT y confirma que la misma ruta responde HTTP 401.
