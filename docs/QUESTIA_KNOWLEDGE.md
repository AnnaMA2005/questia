# QuestIA — conocimiento técnico del repositorio

Este documento recoge lo que cualquier persona (o asistente) necesita para trabajar en el código sin leer todo el documento maestro. El documento maestro (decisiones de producto, plan por fases, estado real) sigue siendo la referencia; aquí solo se detalla lo que ya está en el repositorio.

## Decisiones aplicadas en el código

| Tema | Decisión | Dónde |
|---|---|---|
| Idiomas | en / ca / es con el mismo significado. Idioma inicial por `navigator.languages`, cambiable en todas las pantallas, guardado en `localStorage` (`questia.lang`). | `i18n.js`, `app.js` |
| Paleta | Naranja profundo `#D9480F` (acciones, texto blanco encima), naranja vivo `#FF922B` (acentos, nunca como texto sobre blanco), fondo `#FFF8F0`, texto `#1F2933`, secundario `#52606D`, verde `#2F9E44` y rojo `#C92A2A` solo para acierto/error. | `styles.css` (`:root`) |
| Navegación | **Cuatro pestañas** (aprobado 13/11/2026): Inicio, Retos (con filtros Mente / Estudio / Descubre), Vídeos, Encuesta. Rutas por hash: `#inicio`, `#retos`, `#videos`, `#encuesta`, `#reto/ID`. | `index.html`, `app.js` (`render`) |
| Reto del día | Simulación local de la selección en servidor: solo retos con `estado: publicado` y `fecha_publicacion ≤ hoy` (Europe/Madrid). El de hoy es el que tiene fecha = hoy; si no hay, mensaje controlado. En la fase 4 el filtrado pasa a Apps Script. | `app.js` (`availableQuests`, `todaysQuest`) |
| Modo demo | `data/quests.json` lleva `demo_relative_dates: true`: la app asigna hoy, ayer, anteayer… por orden de la lista. Se retira cuando exista el servidor. | `data/quests.json`, `app.js` (`loadCatalog`) |
| Recorrido del reto | Enunciado → hasta 2 pistas progresivas → respuesta (opciones o texto corto) → resultado → explicación → curiosidad → fuente. | `app.js` (`renderQuest`) |
| Progreso | En el dispositivo (`localStorage` `questia.progress`): `{solved: {ID: {date, correct}}}`. Un reto cuenta una sola vez aunque se repita. Contador y calendario mensual de días resueltos. Sin puntos, rachas ni push (aprobado 13/11/2026). | `app.js` (`markSolved`, `renderCalendar`) |
| Accesibilidad | Enlace «saltar al contenido», foco visible, controles de mínimo 44 px, `aria-pressed` en idioma y opciones, `aria-current` en navegación, resultado como `role="status"` con foco al responder. | `index.html`, `styles.css`, `app.js` |
| Icono | Chispa blanca de cuatro puntas con chispa menor sobre degradado naranja (aprobado 13/11/2026). | `icon.svg`, `icons/` |
| PWA | `manifest.json` con `start_url` y `scope` relativos. Service worker «red primero, caché si falla». | `manifest.json`, `service-worker.js` |
| Versionado | `APP_VERSION` en `app.js` y `CACHE_VERSION` en `service-worker.js`. **Cambiar ambos en cada publicación.** | `app.js`, `service-worker.js` |

## Convenciones

- Sin frameworks ni dependencias externas. Sin secretos en el frontend.
- Rutas siempre relativas (`./`, `data/…`) porque la app vive en un subdirectorio (`/questia/`).
- Todo texto visible pasa por `data-i18n="clave"` (HTML estático) o `t("clave")` (generado); las claves se añaden a los tres idiomas a la vez en `i18n.js`. Los textos de contenido se leen con `tc({en, ca, es})`.
- `data/quests.json`: `respuesta_correcta` es el índice (desde 0) dentro de `opciones`; para `tipo: "respuesta corta"` es un objeto `{en, ca, es}` que se compara sin mayúsculas ni acentos.
- El DOM se construye con el helper `el(tag, attrs, children)`; nunca con HTML concatenado a partir de contenido.
- El archivo `.nojekyll` evita que GitHub Pages procese el sitio con Jekyll.

## Cómo probar

1. Local: `python3 -m http.server 8080` en la raíz y abrir `http://localhost:8080/`.
2. Publicado: https://annama2005.github.io/questia/ (puede tardar 1–3 minutos tras cada subida).
3. Recorrido mínimo: cambiar de idioma en la cabecera → «Empezar» en el reto del día → pedir una pista → elegir respuesta → «Comprobar» → leer explicación → «Terminar» → comprobar que el contador y el calendario marcan el día.
4. Para reiniciar el progreso en un dispositivo: borrar datos del sitio (o en consola `localStorage.removeItem("questia.progress")`).
5. Para forzar una actualización: cerrar todas las pestañas de la app y volver a abrir; si no, borrar datos del sitio.

## Historial de fases

- **Fase 2 — Entorno (cerrada el 13/11/2026):** archivos base publicados en GitHub Pages y verificados (v0.2.0).
- **Fase 3 — Prototipo de frontend, entrega 1 (v0.3.0):** Inicio con reto del día, recorrido completo del reto, progreso con calendario, navegación definitiva de cuatro pestañas (Retos, Vídeos y Encuesta como «próximamente»), icono definitivo.
- **Fase 3 — Entrega 2 (prevista, v0.3.1):** pestaña Retos con filtros, pestaña Vídeos, pestaña Encuesta de marcador de posición mejorada.
