# components

Interfaz compartida entre los módulos de `features/` y el encabezado del portal, que contiene su única navegación.

| Archivo | Contenido |
| --- | --- |
| `prototype-banner.tsx` | Franja fija que identifica el portal como prototipo. |
| `page-frame.tsx` | Encabezado y contenido de las páginas públicas. Sin cookie de sesión, para que el catálogo se sirva desde caché. |
| `account-frame.tsx` | Encabezado y contenido de las páginas con sesión, decidido en el servidor. |
| `site-header.tsx` | Encabezado con el nombre del portal y los enlaces de la navegación, según haya sesión o no. |
| `header-menu.tsx` | Navegación del encabezado. En pantallas de teléfono se pliega tras el botón «Menú». |
| `nav-link.tsx` | Enlace de navegación que marca la ruta activa con `aria-current`. |
| `page-placeholder.tsx` | Título y aviso de las pantallas aún sin contenido. |
| `text-field.tsx` | Campo de formulario con etiqueta, ayuda y error accesibles. |
| `service-unavailable.tsx` | Aviso cuando la API no responde, con enlace para reintentar. |
| `submit-button.tsx` | Botón de envío que muestra el estado de carga de su formulario. |
| `link-pending.tsx` | Aviso de carga mientras se completa la navegación de un enlace. |
| `copy-button.tsx` | Botón que copia un texto al portapapeles y lo anuncia. El aviso desaparece al cambiar de pantalla. |
