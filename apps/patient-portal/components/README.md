# components

Interfaz compartida entre los módulos de `features/` y el encabezado del portal, que contiene su única navegación.

| Archivo | Contenido |
| --- | --- |
| `prototype-banner.tsx` | Franja fija que identifica el portal como prototipo. |
| `site-header.tsx` | Encabezado con el nombre del portal y los enlaces de la navegación, según haya sesión o no. |
| `header-menu.tsx` | Navegación del encabezado. En pantallas de teléfono se pliega tras el botón «Menú». |
| `nav-link.tsx` | Enlace de navegación que marca la ruta activa con `aria-current`. |
| `page-placeholder.tsx` | Título y aviso de las pantallas aún sin contenido. |
| `text-field.tsx` | Campo de formulario con etiqueta, ayuda y error accesibles. |
| `service-unavailable.tsx` | Aviso cuando la API no responde, con enlace para reintentar. |
| `submit-button.tsx` | Botón de envío que muestra el estado de carga de su formulario. |
| `link-pending.tsx` | Aviso de carga mientras se completa la navegación de un enlace. |
| `copy-button.tsx` | Botón que copia un texto al portapapeles y lo anuncia. El aviso desaparece al cambiar de pantalla. |

El portal es solo un sitio web desde el 2026-11-24, cuando el proyecto cambió de arquitectura y dejó de cubrir el canal móvil. Hasta esa fecha existía también `installed-nav.tsx`, la barra inferior del modo instalado. El motivo y el detalle están en [docs/decisions.md](../docs/decisions.md).
