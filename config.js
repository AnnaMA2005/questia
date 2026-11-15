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
  API_TIMEOUT_SECONDS: 8
};
