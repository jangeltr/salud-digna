# Despliegue futuro en Debian 13

La infraestructura propuesta es Debian 13 (trixie) con Node.js 24 LTS y PostgreSQL 17, disponible en esa distribución. La API podrá ejecutarse como servicio systemd con un usuario dedicado y permisos limitados. [Notas de Debian 13](https://www.debian.org/releases/trixie/release-notes/whats-new.en.html)

Un proxy inverso podrá terminar TLS y dirigir el tráfico a la API. Si se habilita Socket.IO, el proxy deberá admitir la negociación de WebSocket y los transportes configurados. PostgreSQL deberá ser accesible únicamente desde los servicios autorizados. Las aplicaciones frontend podrán desplegarse de forma independiente según las tecnologías elegidas por sus responsables.

En el primer despliegue se prevé compilar a partir de una revisión identificada y del lockfile, inyectar secretos desde una ubicación externa al repositorio y aplicar migraciones de Prisma como paso controlado. Antes de cambios de esquema, se deberá contar con un respaldo recuperable y revisar la compatibilidad con la versión anterior de la API. Después del despliegue se verificarán la disponibilidad y el acceso a la base. Los registros operativos evitarán datos sensibles de pacientes.
