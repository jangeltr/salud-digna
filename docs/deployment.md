# Despliegue futuro en Debian 13

La infraestructura propuesta es Debian 13 (trixie) con Node.js 24 LTS y PostgreSQL 17, disponible en esa distribución. La API podrá ejecutarse como servicio systemd con un usuario dedicado y permisos limitados. [Notas de Debian 13](https://www.debian.org/releases/trixie/release-notes/whats-new.en.html)

Un proxy inverso podrá terminar TLS y dirigir el tráfico a la API. Si se habilita Socket.IO, el proxy deberá admitir la negociación de WebSocket y los transportes configurados. PostgreSQL deberá ser accesible únicamente desde los servicios autorizados. Las aplicaciones frontend podrán desplegarse de forma independiente según las tecnologías elegidas por sus responsables.

En el primer despliegue se prevé compilar a partir de una revisión identificada y del lockfile, inyectar secretos desde una ubicación externa al repositorio y aplicar migraciones de Prisma como paso controlado. Antes de cambios de esquema, se deberá contar con un respaldo recuperable y revisar la compatibilidad con la versión anterior de la API. Después del despliegue se verificarán la disponibilidad y el acceso a la base. Los registros operativos evitarán datos sensibles de pacientes.


Compila con `pnpm --filter @salud-digna/api build` y ejecuta el resultado con `pnpm --filter @salud-digna/api start`. Inyecta `NODE_ENV=production` y `DATABASE_URL` desde la configuración privada del servicio. Si PostgreSQL está en otro host, configura TLS con verificación del certificado. Mantén las credenciales de la aplicación limitadas a las operaciones requeridas.

Cuando existan migraciones, aplica el SQL revisado mediante `pnpm --filter @salud-digna/api prisma:migrate:deploy` en un paso separado con las credenciales de migración en `DATABASE_URL`. Este paso prescinde de una base auxiliar. El diagnóstico `/api/v1/health/db` devuelve HTTP 404 en producción. Restringe también su acceso en el proxy si está disponible en entornos internos compartidos.

## IP del cliente detrás de Nginx

Para la topología local comprobada, el servicio usa `API_HOST=127.0.0.1`, `API_PORT=3100` y `TRUST_LOCAL_PROXY=true`. La última variable está desactivada por defecto. Con ella activa, Express acepta como proxy solo al primer salto conectado desde `127.0.0.1`. El proceso rechaza el arranque si se combina con otra dirección de escucha.

Antes de activarla, verifica que el tráfico de la API entre únicamente por Nginx y que el proxy termine TLS, use `proxy_pass http://127.0.0.1:3100` y **reemplace** las cabeceras de reenvío del cliente. La identificación usa `X-Forwarded-For`. Mantén el puerto de NestJS inaccesible desde el exterior.

```nginx
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $remote_addr;
proxy_set_header X-Forwarded-Host $host;
proxy_set_header X-Forwarded-Proto $scheme;
```

La regla de Express identifica el origen de la conexión por su dirección, por lo que cualquier proceso local con acceso directo al puerto puede presentarse como proxy. Los intermediarios Next.js deben llamar a la API a través de Nginx y dejar que este acredite la IP. En ese caso el contador puede agrupar usuarios bajo la IP del servidor Next.js. Para la demo, si ese grupo agota el cupo, usa la llamada de autenticación desde el navegador con su origen exacto en `CORS_ORIGINS`. Evita reenviar una IP declarada por el navegador o agregar Next.js a la lista de confianza. Los usuarios bajo la misma NAT también comparten cupo.

Tras desplegar el binario y reiniciar el servicio autorizado, comprueba con dos IP de prueba que los intentos se separan, que un login válido mantiene HTTP 200 con cupo disponible y que al agotar el límite se conserva `Retry-After`. Este cambio prescinde de migraciones.
