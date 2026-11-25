# Sección del portal para el README de la raíz

Texto listo para pegar en el `README.md` de la raíz del monorepo. Los enlaces son relativos a la raíz, no a este archivo. No lleva credenciales.

---

## Portal del paciente

`apps/patient-portal/` es el canal Web del recorrido omnicanal: el sitio donde el paciente inicia sesión, consulta el catálogo y empieza su trámite de agendamiento. Está hecho con Next.js y habla con la API general y con el orquestador publicados, siempre desde su servidor: el navegador nunca recibe claves ni permisos. Es un prototipo con datos sintéticos.

```sh
pnpm install --frozen-lockfile
cp apps/patient-portal/.env.example apps/patient-portal/.env.local
# Variables según el README del portal, «Instalación y arranque»
pnpm --filter @salud-digna/patient-portal dev
```

El portal queda en `http://127.0.0.1:5173`. La configuración, los modos, la seguridad y los pasos de la demostración están en el [README del portal](apps/patient-portal/README.md).

Las cuentas de paciente de demo y las credenciales del servidor las administra el equipo en el servidor: no están en el repositorio.

Las pruebas automáticas se ejecutan con `pnpm --filter @salud-digna/patient-portal test`, contra servicios simulados que solo existen para ellas.
