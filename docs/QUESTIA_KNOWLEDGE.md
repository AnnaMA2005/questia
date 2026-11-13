# QuestIA — conocimiento técnico del repositorio

Este documento recoge lo que cualquier persona (o asistente) necesita para trabajar en el código sin leer todo el documento maestro. El documento maestro (decisiones de producto, plan por fases, estado real) sigue siendo la referencia; aquí solo se detalla lo que ya está en el repositorio.

## Decisiones aplicadas en el código

| Tema | Decisión | Dónde |
|---|---|---|
| Idiomas | en / ca / es con el mismo significado. Idioma inicial por `navigator.languages`, cambiable en todas las pantallas, guardado en `localStorage` (`questia.lang`). | `i18n.js`, `app.js` |
| Paleta | Naranja profundo `#D9480F` (acciones, texto blanco encima), naranja vivo `#FF922B` (acentos, nunca como texto sobre blanco), fondo `#FFF8F0`, texto `#1F2933`, secundario `#52606D`, verde `#2F9E44` y rojo `#C92A2A` solo para acierto/error. | `styles.css` (`:root`) |
| Accesibilidad | Enlace «saltar al contenido», foco visible, controles de mínimo 44 px, `aria-pressed` en el selector de idioma, `aria-current` en la navegación. | `index.html`, `styles.css` |
| PWA | `manifest.json` con `start_url` y `scope` relativos (funciona en `/questia/` de GitHub Pages). Service worker con caché «red primero, caché si falla». | `manifest.json`, `service-worker.js` |
| Versionado | `APP_VERSION` en `app.js` y `CACHE_VERSION` en `service-worker.js`. **Cambiar ambos en cada publicación** para que los dispositivos actualicen. | `app.js`, `service-worker.js` |
| Datos demo | `data/quests.json` con 3 retos (formato de la hoja `quests`). Solo prototipo y respaldo; la fuente editorial será Google Sheets. | `data/quests.json` |
| Navegación | Cinco pestañas: Inicio, Mente, Estudio, Descubre, Vídeos. En fase 2 solo Inicio está activa. | `index.html` |

## Convenciones

- Sin frameworks ni dependencias externas. Sin secretos en el frontend.
- Rutas siempre relativas (`./`, `data/…`) porque la app vive en un subdirectorio (`/questia/`).
- Todo texto visible pasa por `data-i18n="clave"`; las claves se añaden a los tres idiomas a la vez en `i18n.js`.
- `data/quests.json`: `respuesta_correcta` es el índice (desde 0) dentro de `opciones`. Los campos multilingües son objetos `{en, ca, es}`.
- El archivo `.nojekyll` evita que GitHub Pages procese el sitio con Jekyll.

## Cómo probar

1. Local: `python3 -m http.server 8080` en la raíz y abrir `http://localhost:8080/`.
2. Publicado: https://annama2005.github.io/questia/ (puede tardar 1–3 minutos tras cada push).
3. Comprobaciones visibles en la página: idioma activo, modo (navegador / app instalada), service worker, catálogo demo cargado, versión.
4. Para forzar una actualización en un dispositivo: cerrar todas las pestañas de la app y volver a abrir; si no, borrar datos del sitio.

## Historial de fases

- **Fase 2 — Entorno (31/10/2026):** archivos base creados y publicados en GitHub Pages.
- **Fase 3 — Prototipo de frontend:** pendiente.
