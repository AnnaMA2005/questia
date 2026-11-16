/* QuestIA — configuración pública del frontend.
   Aquí NO va ningún secreto: todo lo que hay en este archivo lo puede ver cualquiera.
   Si se vuelve a desplegar el Apps Script con otra URL, basta con cambiarla aquí
   (y subir la versión en index.html, app.js y service-worker.js). */

window.QUESTIA_CONFIG = {
  /* URL de la aplicación web de Apps Script (termina en /exec). Vacía = solo datos locales de respaldo. */
  API_URL: "https://script.google.com/macros/s/AKfycbyhCB3OuM5Ff3bLXOgkdrDoR5GZFaEQ0AKvQ2pJaCEKwL_AgzLZyBM8KlmZo2MWE_I5/exec",

  /* Minutos durante los que el catálogo guardado en el dispositivo se considera fresco.
     Pasado ese tiempo (o al cambiar de día) se vuelve a pedir al servidor. */
  CATALOG_FRESH_MINUTES: 60,

  /* Segundos máximos de espera al servidor antes de recurrir al catálogo guardado. */
  API_TIMEOUT_SECONDS: 8,

  /* Recordatorios de la encuesta (sección 7 del documento maestro).
     MODE: "mix"   = nada en la primera visita; tarjeta al terminar el primer reto, al salir de la página
                     en escritorio y, desde la segunda sesión, arriba de Inicio (recomendado).
           "modal" = modal al abrir la app desde la primera visita (se puede cerrar).
     Los límites se aplican en los dos modos. SIGNATURE: nombre y universidad de la autora, si decide firmar. */
  REMINDERS: {
    MODE: "modal",
    MIN_DAYS_BETWEEN: 3,
    MAX_TOTAL: 5,
    DISMISS_DAYS: 7,
    SIGNATURE: ""
  }
};
