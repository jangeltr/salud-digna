# components

Interfaz compartida entre los módulos de `features/` y las dos navegaciones del portal: la del sitio web y la de la app instalada.

| Archivo | Contenido |
| --- | --- |
| `prototype-banner.tsx` | Franja fija que identifica el portal como prototipo. |
| `site-header.tsx` | Encabezado con la navegación del navegador. |
| `installed-nav.tsx` | Barra inferior del modo instalado. |
| `nav-link.tsx` | Enlace de navegación que marca la ruta activa con `aria-current`. |
| `page-placeholder.tsx` | Título y aviso de las pantallas aún sin contenido. |
| `text-field.tsx` | Campo de formulario con etiqueta, ayuda y error accesibles. |
| `service-unavailable.tsx` | Aviso cuando la API no responde, con enlace para reintentar. |
| `submit-button.tsx` | Botón de envío que muestra el estado de carga de su formulario. |
| `link-pending.tsx` | Aviso de carga mientras se completa la navegación de un enlace. |
