# QuestIA

Webapp educativa instalable (PWA) en inglés, catalán y castellano para estudiantes de universidades españolas: un reto diario sobre inteligencia artificial y pensamiento crítico, vídeos de interés académico y la encuesta de un TFG sobre IA generativa en la universidad.

- **Publicación:** GitHub Pages desde la rama `main` → https://annama2005.github.io/questia/
- **Frontend:** HTML, CSS y JavaScript sin frameworks.
- **Backend (fases posteriores):** Google Sheets + Apps Script.
- **Documentación del proyecto:** `docs/QUESTIA_KNOWLEDGE.md`.

## Estructura

```
index.html            Página principal (shell de la app)
styles.css            Estilos base y paleta
app.js                Idioma, service worker y comprobaciones de entorno
i18n.js               Textos de interfaz en en / ca / es
manifest.json         Manifiesto PWA
service-worker.js     Caché de la interfaz (cambiar CACHE_VERSION en cada publicación)
icon.svg              Icono vectorial
icons/                Iconos PNG 192 y 512 px
data/quests.json      Catálogo de retos de demostración (solo prototipo y respaldo)
docs/                 Documentación técnica y editorial
```

## Probar en local

No hace falta instalar nada. Desde la carpeta del repositorio:

```
python3 -m http.server 8080
```

y abrir http://localhost:8080/ en el navegador. El service worker solo se registra en `localhost` o en HTTPS.

## Estado

Fase 3, entrega 1 (v0.3.1): Inicio con reto del día, recorrido completo del reto, progreso con calendario y navegación definitiva de cuatro pestañas (Inicio, Retos, Vídeos, Encuesta). Pendiente la entrega 2: Retos con filtros, Vídeos y Encuesta.
