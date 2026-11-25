# Sección del portal para el README de la raíz

Texto listo para pegar en el `README.md` de la raíz del monorepo. Los enlaces son relativos a la raíz, no a este archivo. No lleva ningún valor de credencial: los marcadores se sustituyen solo en la copia privada que entrega el equipo de backend, nunca en Git.

---

## Portal del paciente

`apps/patient-portal/` es el canal Web del recorrido omnicanal: el sitio donde el paciente inicia sesión, consulta el catálogo y empieza su trámite de agendamiento. Está hecho con Next.js y habla con la API general y con el orquestador siempre desde su servidor; el navegador nunca recibe claves ni permisos. Es un prototipo con datos sintéticos.

Para arrancarlo:

```sh
pnpm install --frozen-lockfile
cp apps/patient-portal/.env.example apps/patient-portal/.env.local
# Rellena .env.local según el README del portal, «Instalación desde un clon limpio»
pnpm --filter @salud-digna/patient-portal dev
```

El portal queda en `http://127.0.0.1:5173`. Para la demostración usa los servicios desplegados, con los valores que entrega el equipo de backend. La configuración, las credenciales por rol y los pasos exactos de la demostración están en el [README del portal](apps/patient-portal/README.md). Sus pruebas se ejecutan con `pnpm --filter @salud-digna/patient-portal test`, contra servicios simulados.

### Credenciales de demostración

| Rol | Aplicación | Usuario | Contraseña |
| --- | --- | --- | --- |
| Paciente | Portal del paciente | `<entregado por el equipo de backend>` | `<entregado por el equipo de backend>` |

Las credenciales se entregan por un canal privado y nunca se escriben en el repositorio.
