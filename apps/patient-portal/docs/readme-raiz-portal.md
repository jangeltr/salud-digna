# Sección del portal para el README de la raíz

Texto listo para pegar en el `README.md` de la raíz del monorepo. Los enlaces son relativos a la raíz, no a este archivo. No lleva ningún valor de credencial: los marcadores se sustituyen solo en la copia privada que entrega el equipo de backend, nunca en Git.

---

## Portal del paciente

`apps/patient-portal/` es el canal Web del recorrido omnicanal: el sitio donde el paciente inicia sesión, consulta el catálogo y empieza su trámite de agendamiento. Está hecho con Next.js y habla con la API general y con el orquestador siempre desde su servidor; el navegador nunca recibe claves ni permisos. Es un prototipo con datos sintéticos.

Para arrancarlo en local, con la API general ya en marcha:

```sh
pnpm install --frozen-lockfile
cp apps/patient-portal/.env.example apps/patient-portal/.env.local
# En .env.local: API_BASE_URL=http://127.0.0.1:3000/api/v1
pnpm --filter @salud-digna/patient-portal dev
```

El portal queda en `http://127.0.0.1:5173`. Sus pruebas se ejecutan con `pnpm --filter @salud-digna/patient-portal test`, contra servicios simulados. Variables, modos, seguridad y lista de publicación están en el [README del portal](apps/patient-portal/README.md). El guion de la demostración, en [apps/patient-portal/docs/demo.md](apps/patient-portal/docs/demo.md).

### Credenciales de demostración

| Rol | Aplicación | Usuario | Contraseña |
| --- | --- | --- | --- |
| Paciente | Portal del paciente | `<entregado por el equipo de backend>` | `<entregado por el equipo de backend>` |

Las credenciales se entregan por un canal privado y nunca se escriben en el repositorio.
