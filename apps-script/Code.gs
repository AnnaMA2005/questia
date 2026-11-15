/**
 * QuestIA — backend en Apps Script (fase 4: catálogo de contenidos).
 *
 * Proyecto vinculado a la hoja «QuestIA · contenidos». Se despliega como aplicación web
 * (Ejecutar como: yo · Acceso: cualquier usuario) y la app estática en GitHub Pages lo consulta.
 *
 * Endpoints (GET):
 *   ?action=quests    → retos publicados con fecha ≤ hoy (Europe/Madrid), marcando el de hoy
 *   ?action=videos    → vídeos publicados
 *   ?action=canales   → canales publicados
 *   ?action=all       → los tres a la vez (es lo que usa la app al arrancar)
 *   &nocache=1        → salta la caché de una hora (para comprobar cambios al instante)
 *
 * Reglas (sección 5 y 10 del documento maestro):
 *   - El cliente nunca recibe retos futuros ni no publicados.
 *   - La fecha de «hoy» se calcula aquí, en Europe/Madrid, no en el móvil.
 *   - Solo se devuelven columnas de contenido; nada de datos personales (no los hay en estas hojas).
 *
 * Fase 5 añadirá doPost (encuesta, eventos) en este mismo proyecto.
 */

var TZ = "Europe/Madrid";
var CACHE_SECONDS = 3600;          // una hora (propuesto en el documento; se refresca al cambiar de día)
var LANGS = ["en", "ca", "es"];
var SHEETS = { quests: "quests", videos: "videos", canales: "canales" };

function doGet(e) {
  var params = (e && e.parameter) || {};
  var action = String(params.action || "all").toLowerCase();
  var noCache = params.nocache === "1";
  var today = todayISO();

  try {
    var payload;
    var cacheKey = "questia:" + action + ":" + today;   // la clave incluye el día → caché nueva cada medianoche
    var cache = CacheService.getScriptCache();
    var cached = noCache ? null : cache.get(cacheKey);

    if (cached) {
      payload = JSON.parse(cached);
      payload.cached = true;
    } else {
      payload = buildPayload_(action, today);
      try { cache.put(cacheKey, JSON.stringify(payload), CACHE_SECONDS); } catch (err) { /* payload demasiado grande para la caché: se sirve igualmente */ }
    }
    payload.generated = new Date().toISOString();
    return json_(payload);
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err), today: today });
  }
}

function buildPayload_(action, today) {
  var out = { ok: true, today: today, action: action };
  if (action === "quests" || action === "all") {
    var q = publishedQuests_(today);
    out.quests = q.list;
    out.todayId = q.todayId;
  }
  if (action === "videos" || action === "all") out.videos = publishedVideos_();
  if (action === "canales" || action === "all") out.canales = publishedChannels_();
  if (!out.quests && !out.videos && !out.canales) throw new Error("Acción desconocida: " + action);
  return out;
}

/* ---------------------------------------------------------------------------
   Retos
   --------------------------------------------------------------------------- */

function publishedQuests_(today) {
  var rows = readSheet_(SHEETS.quests);
  var list = [];
  var todayId = null;

  rows.forEach(function (r) {
    if (norm_(r.estado) !== "publicado") return;
    var date = toISODate_(r.fecha_publicacion);
    if (!date || date > today) return;          // nunca futuros
    if (!r.id) return;

    var quest = {
      id: String(r.id).trim(),
      fecha_publicacion: date,
      categoria: norm_(r.categoria),
      dificultad: toInt_(r.dificultad, 1),
      minutos: toInt_(r.minutos, 2),
      tipo: norm_(r.tipo) || "test",
      imagen: String(r.imagen || "").trim(),
      titulo: multi_(r, "titulo"),
      enunciado: multi_(r, "enunciado"),
      opciones: multiList_(r, "opciones"),
      pista1: multi_(r, "pista1"),
      pista2: multi_(r, "pista2"),
      explicacion: multi_(r, "explicacion"),
      curiosidad: multi_(r, "curiosidad"),
      fuente: String(r.fuente || "").trim()
    };
    if (quest.tipo === "respuesta corta") {
      /* En la hoja hay una sola columna; si algún día se separa por idioma, aquí se leería respuesta_correcta_en/ca/es */
      var txt = String(r.respuesta_correcta || "").trim();
      quest.respuesta_correcta = { en: txt, ca: txt, es: txt };
    } else {
      quest.respuesta_correcta = toInt_(r.respuesta_correcta, 0);
    }
    list.push(quest);
    if (date === today) todayId = quest.id;
  });

  list.sort(function (a, b) { return a.fecha_publicacion < b.fecha_publicacion ? 1 : a.fecha_publicacion > b.fecha_publicacion ? -1 : 0; });
  return { list: list, todayId: todayId };
}

/* ---------------------------------------------------------------------------
   Vídeos y canales
   --------------------------------------------------------------------------- */

function publishedVideos_() {
  return readSheet_(SHEETS.videos).filter(function (r) {
    return norm_(r.estado) === "publicado" && r.youtube_id;
  }).map(function (r) {
    return {
      id: String(r.id || "").trim(),
      youtube_id: String(r.youtube_id).trim(),
      canal: String(r.canal || "").trim(),
      idioma_video: norm_(r.idioma_video),
      categoria: norm_(r.categoria),
      duracion_min: toInt_(r.duracion_min, 0) || null,
      fecha_alta: toISODate_(r.fecha_alta) || "",
      titulo: multi_(r, "titulo"),
      descripcion: multi_(r, "descripcion")
    };
  }).sort(function (a, b) { return a.fecha_alta < b.fecha_alta ? 1 : a.fecha_alta > b.fecha_alta ? -1 : 0; });
}

function publishedChannels_() {
  return readSheet_(SHEETS.canales).filter(function (r) {
    return norm_(r.estado) === "publicado" && r.url;
  }).map(function (r) {
    return {
      id: String(r.id || "").trim(),
      nombre: String(r.nombre || "").trim(),
      url: String(r.url).trim(),
      plataforma: norm_(r.plataforma) || "youtube",
      idioma: norm_(r.idioma),
      tema: multi_(r, "tema"),
      por_que: multi_(r, "por_que")
    };
  });
}

/* ---------------------------------------------------------------------------
   Utilidades de hoja
   --------------------------------------------------------------------------- */

/** Lee una pestaña y devuelve un array de objetos {cabecera: valor}. La fila 1 son las cabeceras. */
function readSheet_(name) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error("No existe la pestaña «" + name + "»");
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0].map(function (h) { return String(h).trim(); });
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (row.join("") === "") continue;            // fila vacía
    var obj = {};
    headers.forEach(function (h, j) { if (h) obj[h] = row[j]; });
    rows.push(obj);
  }
  return rows;
}

function multi_(r, base) {
  var out = {};
  LANGS.forEach(function (l) { out[l] = String(r[base + "_" + l] || "").trim(); });
  return out;
}

function multiList_(r, base) {
  var out = {};
  LANGS.forEach(function (l) {
    var raw = String(r[base + "_" + l] || "").trim();
    out[l] = raw ? raw.split("|").map(function (s) { return s.trim(); }).filter(String) : [];
  });
  return out;
}

function norm_(v) { return String(v || "").trim().toLowerCase(); }

function toInt_(v, fallback) {
  var n = parseInt(v, 10);
  return isNaN(n) ? fallback : n;
}

/** Acepta texto "YYYY-MM-DD" o un objeto Date de la hoja; devuelve "YYYY-MM-DD" o null. */
function toISODate_(v) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, TZ, "yyyy-MM-dd");
  var s = String(v || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);   // dd/mm/yyyy escrito a mano
  if (m) return m[3] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2);
  return null;
}

function todayISO() {
  return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd");
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------------------------------------------------------------------------
   Prueba manual desde el editor: Ejecutar → testAll → ver el registro.
   --------------------------------------------------------------------------- */
function testAll() {
  var p = buildPayload_("all", todayISO());
  Logger.log("hoy: " + p.today + " · retos: " + p.quests.length + " · reto de hoy: " + p.todayId + " · vídeos: " + p.videos.length + " · canales: " + p.canales.length);
  Logger.log(JSON.stringify(p.quests[0], null, 2));
}
