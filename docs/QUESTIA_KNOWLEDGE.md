# QuestIA — conocimiento técnico del repositorio

Este documento recoge lo que cualquier persona (o asistente) necesita para trabajar en el código sin leer todo el documento maestro. El documento maestro (decisiones de producto, plan por fases, estado real) sigue siendo la referencia; aquí solo se detalla lo que ya está en el repositorio.

## Decisiones aplicadas en el código

| Tema | Decisión | Dónde |
|---|---|---|
| Idiomas | en / ca / es con el mismo significado. Idioma inicial por `navigator.languages`, cambiable en todas las pantallas, guardado en `localStorage` (`questia.lang`). | `i18n.js`, `app.js` |
| Paleta | Naranja profundo `#D9480F` (acciones, texto blanco encima), naranja vivo `#FF922B` (acentos, nunca como texto sobre blanco), fondo `#FFF8F0`, texto `#1F2933`, secundario `#52606D`, verde `#2F9E44` y rojo `#C92A2A` solo para acierto/error. | `styles.css` (`:root`) |
| Navegación | **Cuatro pestañas** (aprobado 13/11/2026): Inicio, Retos (con filtros Mente / Estudio / Descubre), Vídeos, Encuesta. Rutas por hash: `#inicio`, `#retos`, `#videos`, `#encuesta`, `#reto/ID`. | `index.html`, `app.js` (`render`) |
| Fuente de datos | **Google Sheets «QuestIA · contenidos»** (pestañas `quests`, `videos`, `canales`, `leeme`) servida por **Apps Script** (`apps-script/Code.gs`, web app, `?action=all|quests|videos|canales`, `&nocache=1`). El servidor filtra `estado = publicado` y `fecha ≤ hoy` (Europe/Madrid), marca `todayId`, cachea 1 h por día. La URL vive en `config.js`. | `config.js`, `apps-script/Code.gs`, `app.js` (`loadCatalog`) |
| Carga del catálogo | 1) catálogo guardado en el dispositivo (`localStorage` `questia.catalog`) si es de hoy y tiene < 60 min: se pinta al instante y no se llama al servidor; 2) servidor (timeout 8 s): sustituye y se guarda; 3) si falla y hay caché: se muestra con aviso «sin conexión con el servidor»; 4) si falla y no hay caché: `data/quests.json` + `data/videos.json` (respaldo, con aviso). | `app.js` (`loadCatalog`, `readCachedCatalog`, `loadLocalFallback`) |
| Reto del día | El que el servidor marca en `todayId`; si no viene, el que tiene fecha = hoy. El cliente vuelve a filtrar `fecha ≤ hoy` por seguridad. Sin reto hoy → mensaje controlado. | `app.js` (`todaysQuest`) |
| Recorrido del reto | Enunciado → hasta 2 pistas progresivas → respuesta (opciones o texto corto) → resultado → explicación → curiosidad → fuente. | `app.js` (`renderQuest`) |
| Progreso | En el dispositivo (`localStorage` `questia.progress`): `{solved: {ID: {date, correct}}}`. Un reto cuenta una sola vez aunque se repita. Contador y calendario mensual de días resueltos. Sin puntos, rachas ni push (aprobado 13/11/2026). | `app.js` (`markSolved`, `renderCalendar`) |
| Accesibilidad | Enlace «saltar al contenido», foco visible, controles de mínimo 44 px, `aria-pressed` en idioma y opciones, `aria-current` en navegación, resultado como `role="status"` con foco al responder. | `index.html`, `styles.css`, `app.js` |
| Pestaña Retos | Catálogo disponible (publicados ≤ hoy) con filtros por categoría y marca de resuelto. | `app.js` (`renderQuestsTab`) |
| Vídeos | `data/videos.json` (simula la hoja «videos»): tarjetas con miniatura de `i.ytimg.com`, filtros por categoría e idioma del vídeo, orden por `fecha_alta`. El reproductor (`youtube-nocookie.com/embed`) solo se inserta al pulsar. IDs verificados contra el canal original antes de publicar. | `data/videos.json`, `app.js` (`renderVideos`, `playVideo`) |
| Encuesta | Marcador de posición con texto informativo y botón desactivado hasta la fase 5. | `index.html` |
| Instalación | Tarjeta en Inicio: con `beforeinstallprompt` (Android, Chrome/Edge) muestra botón «Instalar»; en iOS/iPadOS (sin API) muestra guía de dos pasos; oculta si ya está en modo instalado; «Ahora no» la silencia 7 días (`questia.installDismissed`). | `app.js` (`setupInstall`, `renderInstallCard`) |
| Ilustraciones | Tres SVG por categoría en `img/cat-{mente,estudio,descubre}.svg` (cabecera del reto y miniatura en listas). Si la fila del reto tiene `imagen` (ruta o URL), esa imagen sustituye a la de la categoría. | `img/`, `app.js` (`questImageSrc`) |
| Canales | Sección «Canales recomendados» al final de Vídeos, desde la pestaña `canales` (solo `publicado`); columnas `tema_en/ca/es` y `por_que_en/ca/es`; se filtra con el selector de idioma de Vídeos. Criterios de inclusión en la pestaña `leeme`. | `app.js` (`renderChannels`), hoja `canales` |
| Encuesta (motor) | `survey.js` pinta el cuestionario que llega del servidor (pestaña `survey`, solo `publicado`): una pregunta por pantalla, barra de progreso, tipos `intro`/`single`/`multi`/`dropdown`/`text`, `obligatoria`, `orden` y `mostrar_si` (`id=1,2`: visible si la respuesta a `id` está en ese conjunto; las ocultas se vacían). Borrador en `questia.surveyDraft`. | `survey.js` |
| Participación | `questia.participation.status`: none → open → sent_pending → confirmed (o unknown). Id anónimo de dispositivo en `questia.deviceId` (UUID aleatorio). Al abrir la app: si hay envío pendiente se reintenta (mismo `submission_id`); si no está confirmado se consulta `?action=participation&device=`. Confirmado = la tarjeta de Inicio desaparece y la pestaña muestra «Gracias». | `survey.js` (`sync`, `send`, `confirm`) |
| Envío | `POST` a Apps Script con `Content-Type: text/plain` y cuerpo JSON `{action:"survey", submission_id, device_id, lang, answers, app_version, mode}`. El servidor valida contra el cuestionario publicado (obligatorias, índices, longitud ≤ 1000), rechaza duplicados por `submission_id` y por `device_id`, escribe `responses` (columnas por id de pregunta, creadas solas) y `participation` (device_id, fecha), bajo `LockService`. Sin IP ni user-agent. | `apps-script/Code.gs` (`doPost`, `submitSurvey_`) |
| Recordatorios | `reminders.js`, configurado en `config.js` → `REMINDERS`: `MODE` "mix" (nada en la 1.ª visita; tarjeta al terminar el primer reto; en escritorio, banner al salir por arriba sin ningún reto hecho; desde la 2.ª sesión, tarjeta arriba de Inicio) o "modal" (modal cerrable al abrir). Límites comunes: `MIN_DAYS_BETWEEN` 3, `MAX_TOTAL` 5, `DISMISS_DAYS` 7 al pulsar «Ahora no», máximo uno por sesión, nunca durante un reto, cesan al confirmar. Mensajes rotatorios en 1.ª persona (`remMsg*` en `i18n.js`); `SIGNATURE` añade la firma de la autora. Estado en `questia.reminders` {shown, lastAt, dismissedUntil}; sesiones en `questia.sessions`. `config.js` se sirve red-primero para poder cambiar el modo sin publicar versión. | `reminders.js`, `config.js`, `app.js` (`renderReminderTop`, `renderQuest`) |
| Icono | Chispa blanca de cuatro puntas con chispa menor sobre degradado naranja (aprobado 13/11/2026). | `icon.svg`, `icons/` |
| PWA y caché | `manifest.json` con `start_url` y `scope` relativos. Service worker: página y `data/*.json` por red saltando la caché HTTP (caché propia si falla); css/js/iconos versionados con `?v=` y servidos desde caché. Al activarse una versión nueva, la página se recarga una vez (`controllerchange`). Motivo: GitHub Pages cachea 10 min por archivo y sin esto se mezclaban versiones (visto el 13/11/2026). | `manifest.json`, `service-worker.js`, `app.js` |
| Versionado | **En cada publicación cambiar tres cosas:** `APP_VERSION` en `app.js`, `CACHE_VERSION` y la lista `APP_SHELL` en `service-worker.js`, y el sufijo `?v=` de css/js/config (e icono si cambia) en `index.html`. | `app.js`, `service-worker.js`, `index.html` |

## Convenciones

- Sin frameworks ni dependencias externas. Sin secretos en el frontend.
- Rutas siempre relativas (`./`, `data/…`) porque la app vive en un subdirectorio (`/questia/`).
- Todo texto visible pasa por `data-i18n="clave"` (HTML estático) o `t("clave")` (generado); las claves se añaden a los tres idiomas a la vez en `i18n.js`. Los textos de contenido se leen con `tc({en, ca, es})`.
- Formato de un reto (servidor y `data/quests.json`): `respuesta_correcta` es el índice (desde 0) dentro de `opciones`; para `tipo: "respuesta corta"` es un objeto `{en, ca, es}` que se compara sin mayúsculas ni acentos. En la hoja, `opciones_xx` se escriben separadas por ` | `.
- Publicar contenido nuevo: fila en la hoja con `estado = publicado` y fecha ≤ hoy; aparece en la app en menos de una hora (caché del servidor) + hasta una hora (caché del dispositivo). Para verlo al instante: `…/exec?action=all&nocache=1` y borrar `questia.catalog` en el dispositivo.
- Redesplegar el Apps Script tras cambiar `Code.gs`: Implementar → Gestionar implementaciones → lápiz → Versión «Nueva» → Implementar (la URL se mantiene si se edita la implementación existente).
- El DOM se construye con el helper `el(tag, attrs, children)`; nunca con HTML concatenado a partir de contenido.
- El archivo `.nojekyll` evita que GitHub Pages procese el sitio con Jekyll.

## Cómo probar

1. Local: `python3 -m http.server 8080` en la raíz y abrir `http://localhost:8080/`.
2. Publicado: https://annama2005.github.io/questia/ (puede tardar 1–3 minutos tras cada subida).
3. Recordatorios: para volver a verlos en un dispositivo de prueba, `localStorage.removeItem("questia.reminders"); localStorage.removeItem("questia.sessions")`. Para cambiar de modo: editar `REMINDERS.MODE` en `config.js` (en GitHub, lápiz → commit); llega a los dispositivos en ≤ 10 min al reabrir.
3b. Encuesta: para que aparezca, las filas de `survey` deben estar en `publicado`. Para repetirla en un dispositivo de prueba: en consola `localStorage.removeItem("questia.participation"); localStorage.removeItem("questia.surveyDraft")` y borrar la fila del dispositivo en `participation` (o también `questia.deviceId` para contar como dispositivo nuevo). Antes del lanzamiento: vaciar `responses` y `participation` de pruebas.
4. Recorrido mínimo: cambiar de idioma en la cabecera → «Empezar» en el reto del día → pedir una pista → elegir respuesta → «Comprobar» → leer explicación → «Terminar» → comprobar que el contador y el calendario marcan el día.
5. Para reiniciar el progreso en un dispositivo: borrar datos del sitio (o en consola `localStorage.removeItem("questia.progress")`; para volver a ver la tarjeta de instalación, `localStorage.removeItem("questia.installDismissed")`).
6. Para forzar una actualización: cerrar todas las pestañas de la app y volver a abrir; si no, borrar datos del sitio.

## Historial de fases

- **Fase 4 — Catálogo de contenidos, entrega 1 (v0.4.0, 15/11/2026):** hoja de Google creada, Apps Script desplegado, app conectada con caché en dispositivo y respaldo local.
- **Fase 5 — Entrega 2 (v0.5.1, 16/11/2026):** recordatorios con dos modos configurables y límites comunes. Pendiente: métricas (5c), panel (fase 6).
- **Fase 5 — Entrega 1 (v0.5.0, 16/11/2026):** motor de encuesta, envío con validación, participación y confirmación; cuestionario provisional v1 en la pestaña `survey` (borrador). Pendiente: recordatorios (5b), métricas (5c), panel (fase 6).
- **Fase 4 — Entrega 2 (v0.4.1, 15/11/2026):** ilustraciones por categoría; sección Canales (10 canales propuestos en la hoja, estado revisado hasta aprobación de la autora). Pendiente: 30 retos revisados.

- **Fase 2 — Entorno (cerrada el 13/11/2026):** archivos base publicados en GitHub Pages y verificados (v0.2.0).
- **Fase 3 — Prototipo de frontend, entrega 1 (v0.3.0, parche v0.3.1):** Inicio con reto del día, recorrido completo del reto, progreso con calendario, navegación definitiva de cuatro pestañas (Retos, Vídeos y Encuesta como «próximamente»), icono definitivo.
- **Fase 3 — Entrega 2 (v0.3.2):** pestaña Retos con filtros, pestaña Vídeos con lista demo verificada, pestaña Encuesta como marcador de posición, tarjeta de instalación. Pendiente editorial: un vídeo en castellano de canal original.
