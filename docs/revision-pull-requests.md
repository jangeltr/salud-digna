# Revisión de pull requests

## Alcance de cada equipo

| Área | Responsable |
| --- | --- |
| `apps/patient-portal/` | Portal público y móvil |
| `apps/call-center/` | Call Center |
| `apps/admin/` | Administración |
| `apps/api/` y `docs/openapi.json` | Propietario del backend, `@jangeltr` |
| `apps/operations/` | Reservada. Acordar cualquier cambio con el propietario |
| Configuración raíz, `packages/`, `.github/`, `AGENTS.md` y `CLAUDE.md` | Compartida. Requiere revisión del propietario |

Los equipos pueden trabajar en sus ramas y actualizar sus manifiestos. Los cambios al lockfile que acompañen esos manifiestos se revisan por su efecto sobre todo el workspace. Cada equipo puede actualizar la documentación de su aplicación. Los cambios de contrato se coordinan con backend.

## Qué valida GitHub Actions

`Integración del monorepo` revisa el resultado de integración con `main` en un PR y admite el candidato de `merge_group` si se habilita una cola compatible. La clasificación compara los árboles de Git de la base y del candidato, incluidas las eliminaciones y ambos lados de los renombres.

- El resumen identifica el alcance y lista los archivos reservados o compartidos. Un aviso de riesgo elevado requiere revisión humana del propietario. El check puede quedar verde con ese aviso.
- Los cambios de una aplicación compilan su paquete cuando existe. Un cambio de manifiesto, lockfile, configuración raíz o área compartida expande el build al workspace, incluida la API. Un cambio documental sin impacto técnico publica solo el resumen. Una carpeta reservada sin manifiesto, como un scaffold, todavía no tiene build.
- La verificación instala con Node 24 y pnpm 11.28.11 mediante `pnpm install --frozen-lockfile`. Los paquetes con script `build` se compilan. La instalación comprueba la consistencia del lockfile. El check genera OpenAPI y comprueba el archivo versionado cuando cambia la API o el contrato.
- El job usa un runner alojado por GitHub, permisos de lectura y checkout sin persistir credenciales. El código y las dependencias del PR se ejecutan en ese entorno. Mantener secretos, runners propios y credenciales de despliegue fuera de este workflow. La generación de Prisma y OpenAPI funciona sin base activa. El workflow carece de pasos de despliegue o migración.

Un fallo de instalación o build es bloqueante. Un PR con conflictos puede quedar sin check hasta resolverlos. Un check verde confirma las verificaciones ejecutadas. La revisión de seguridad de dependencias, los permisos y el comportamiento funcional siguen sujetos a revisión de código y pruebas del flujo correspondiente.

## Resolver conflictos del lockfile

Para #2 y #3, integrar el primero tras su revisión y actualizar la rama del segundo con la nueva base. Conservar los manifiestos de ambas aplicaciones. Resolver los conflictos del lockfile, conservando en lo posible las resoluciones existentes, y regenerarlo desde la raíz:

```sh
pnpm install --lockfile-only
pnpm install --frozen-lockfile
pnpm -r run --if-present build
```

Usar pnpm 11.28.11. Verificar en el diff que el lockfile conserva los importadores de `apps/api`, `apps/call-center` y `apps/admin` y revisar cambios transitivos. Evitar aceptar el lockfile completo de una rama como resolución definitiva sin regenerarlo.

## Activación posterior en GitHub

1. Incorporar estos archivos a `main` mediante revisión. Comprobar que el check aparece en un PR actualizado antes de declararlo requerido.
2. Si el plan lo admite, proteger `main` con PR obligatorio, check `Integración del monorepo` requerido, rama al día y sin pushes directos ni excepciones innecesarias. Habilitar revisión de propietarios e invalidar aprobaciones obsoletas si esas opciones están disponibles. Verificar cómo se revisarán los PR que abra el propio propietario, ya que el autor no puede aprobar su PR.
3. `CODEOWNERS` solicita revisión desde la rama base cuando la función está disponible. En un privado personal, verificar el plan antes de depender de ella. GitHub documenta protección de ramas y CODEOWNERS en repos privados con planes compatibles, incluido Pro. La cola de integración tiene requisitos de organización y plan propios. Mientras falte protección efectiva, el propietario debe comprobar los archivos y autorizar su incorporación de forma manual. Un PR puede modificar el propio workflow y su clasificador, por lo que ese cambio requiere revisión del propietario aunque el check pase.

En **Settings → Actions**, mantener deshabilitado el envío de secretos y de tokens de escritura a workflows de PR desde forks, si el repositorio permite esos PR. Mantener deshabilitada también la aprobación de PR por Actions para este proceso.

Referencias de GitHub para [protección de ramas](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches), [CODEOWNERS](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners) y [cola de integración](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue).
