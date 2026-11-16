/**
 * QuestIA — backend en Apps Script (fase 4: catálogo · fase 5: encuesta).
 *
 * Proyecto vinculado a la hoja «QuestIA · contenidos». Se despliega como aplicación web
 * (Ejecutar como: yo · Acceso: cualquier usuario) y la app estática en GitHub Pages lo consulta.
 *
 * Endpoints (GET):
 *   ?action=quests    → retos publicados con fecha ≤ hoy (Europe/Madrid), marcando el de hoy
 *   ?action=videos    → vídeos publicados
 *   ?action=canales   → canales publicados
 *   ?action=survey    → preguntas publicadas de la encuesta (pestaña «survey»)
 *   ?action=all       → todo lo anterior a la vez (es lo que usa la app al arrancar)
 *   &nocache=1        → salta la caché de una hora (para comprobar cambios al instante)
 *   ?action=participation&device=ID → {confirmed: true|false} (sin caché)
 *
 * Endpoints (POST, cuerpo JSON con Content-Type text/plain para evitar la comprobación previa CORS):
 *   {action:"survey", submission_id, device_id, lang, answers:{S-01: 0, S-05: [1,3], S-11: "texto"}, app_version, mode}
 *      → valida en el servidor, guarda en «responses» (sin datos identificativos) y «participation», devuelve {ok, confirmed}
 *
 * Reglas (sección 5 y 10 del documento maestro):
 *   - El cliente nunca recibe retos futuros ni no publicados.
 *   - La fecha de «hoy» se calcula aquí, en Europe/Madrid, no en el móvil.
 *   - Solo se devuelven columnas de contenido; nada de datos personales (no los hay en estas hojas).
 *
 * Privacidad: no se guarda IP, user-agent completo ni nada que identifique a la persona. El id de dispositivo es
 * un valor aleatorio generado en el navegador; «responses» y «participation» van en hojas separadas (sección 6).
 * Fase 5b añadirá los eventos de uso (hoja «events»).
 */

var TZ = "Europe/Madrid";
var CACHE_SECONDS = 3600;          // una hora (propuesto en el documento; se refresca al cambiar de día)
var LANGS = ["en", "ca", "es"];
var SHEETS = { quests: "quests", videos: "videos", canales: "canales", survey: "survey", responses: "responses", participation: "participation" };
var MAX_TEXT_ANSWER = 1000;         // caracteres máximos de una respuesta abierta
var MAX_BODY_BYTES = 20000;         // tamaño máximo de un envío

function doGet(e) {
  var params = (e && e.parameter) || {};
  var action = String(params.action || "all").toLowerCase();
  var noCache = params.nocache === "1";
  var today = todayISO();

  try {
    if (action === "participation") {
      return json_({ ok: true, confirmed: isParticipationConfirmed_(String(params.device || "")) });
    }
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
  if (action === "survey" || action === "all") out.survey = publishedSurvey_();
  if (!out.quests && !out.videos && !out.canales && !out.survey) throw new Error("Acción desconocida: " + action);
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
   Encuesta: preguntas publicadas
   --------------------------------------------------------------------------- */

function publishedSurvey_() {
  return readSheet_(SHEETS.survey).filter(function (r) {
    return norm_(r.estado) === "publicado" && r.id;
  }).map(function (r) {
    return {
      id: String(r.id).trim(),
      orden: toInt_(r.orden, 0),
      tipo: norm_(r.tipo) || "single",
      obligatoria: toInt_(r.obligatoria, 0) === 1,
      texto: multi_(r, "texto"),
      opciones: multiList_(r, "opciones"),
      ayuda: multi_(r, "ayuda"),
      mostrar_si: String(r.mostrar_si || "").trim()
    };
  }).sort(function (a, b) { return a.orden - b.orden; });
}

/* ---------------------------------------------------------------------------
   POST: envío de la encuesta
   --------------------------------------------------------------------------- */

function doPost(e) {
  try {
    var raw = e && e.postData && e.postData.contents;
    if (!raw) throw new Error("Cuerpo vacío");
    if (raw.length > MAX_BODY_BYTES) throw new Error("Envío demasiado grande");
    var body = JSON.parse(raw);
    var action = String(body.action || "").toLowerCase();
    if (action === "survey") return json_(submitSurvey_(body));
    throw new Error("Acción desconocida: " + action);
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function submitSurvey_(body) {
  var submissionId = cleanId_(body.submission_id);
  var deviceId = cleanId_(body.device_id);
  var lang = LANGS.indexOf(body.lang) !== -1 ? body.lang : "es";
  if (!submissionId || !deviceId) throw new Error("Faltan identificadores");
  var answers = (body.answers && typeof body.answers === "object") ? body.answers : {};

  /* Validación contra el cuestionario publicado */
  var questions = publishedSurvey_();
  if (!questions.length) throw new Error("La encuesta no está publicada");
  var clean = {};
  var errors = [];
  questions.forEach(function (q) {
    if (q.tipo === "intro") return;
    if (!isVisible_(q, answers, questions)) return;       // pregunta condicional oculta: se ignora
    var a = answers[q.id];
    var nOpts = q.opciones.es.length;
    if (a === undefined || a === null || a === "" || (Array.isArray(a) && !a.length)) {
      if (q.obligatoria) errors.push(q.id + ": obligatoria");
      return;
    }
    if (q.tipo === "single" || q.tipo === "dropdown") {
      var i = parseInt(a, 10);
      if (isNaN(i) || i < 0 || i >= nOpts) { errors.push(q.id + ": opción no válida"); return; }
      clean[q.id] = i;
    } else if (q.tipo === "multi") {
      var arr = Array.isArray(a) ? a : [a];
      var ok = [], seen = {};
      arr.forEach(function (v) { var j = parseInt(v, 10); if (!isNaN(j) && j >= 0 && j < nOpts && !seen[j]) { seen[j] = true; ok.push(j); } });
      if (!ok.length) { errors.push(q.id + ": opción no válida"); return; }
      clean[q.id] = ok.sort(function (x, y) { return x - y; }).join("|");
    } else if (q.tipo === "text") {
      var txt = String(a).replace(/[\u0000-\u001f]+/g, " ").trim();
      if (txt.length > MAX_TEXT_ANSWER) txt = txt.slice(0, MAX_TEXT_ANSWER);
      clean[q.id] = txt;
    }
  });
  if (errors.length) return { ok: false, error: "validation", details: errors };

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    /* Duplicados: mismo envío (reintento) o mismo dispositivo ya confirmado → se confirma sin guardar de nuevo */
    if (findInColumn_(SHEETS.responses, "submission_id", submissionId)) return { ok: true, confirmed: true, duplicate: "submission" };
    if (isParticipationConfirmed_(deviceId)) return { ok: true, confirmed: true, duplicate: "device" };

    var now = new Date().toISOString();
    var responses = getOrCreateSheet_(SHEETS.responses, ["timestamp", "submission_id", "lang", "app_version", "mode"]);
    var headers = ensureHeaders_(responses, Object.keys(clean));
    var row = headers.map(function (h) {
      if (h === "timestamp") return now;
      if (h === "submission_id") return submissionId;
      if (h === "lang") return lang;
      if (h === "app_version") return String(body.app_version || "").slice(0, 20);
      if (h === "mode") return String(body.mode || "").slice(0, 20);
      return clean[h] !== undefined ? clean[h] : "";
    });
    responses.appendRow(row);

    var participation = getOrCreateSheet_(SHEETS.participation, ["device_id", "confirmed_at"]);
    participation.appendRow([deviceId, now]);
  } finally {
    lock.releaseLock();
  }
  return { ok: true, confirmed: true };
}

/* mostrar_si: "S-01=1" o "S-03=1,2,3" → visible si la respuesta a S-01 está en {1} / {1,2,3}. Vacío → siempre visible. */
function isVisible_(q, answers, questions) {
  var rule = q.mostrar_si;
  if (!rule) return true;
  var m = rule.match(/^([A-Za-z0-9\-]+)\s*=\s*([0-9,\s]+)$/);
  if (!m) return true;
  var depId = m[1], allowed = m[2].split(",").map(function (x) { return parseInt(x, 10); });
  var dep = questions.filter(function (x) { return x.id === depId; })[0];
  if (dep && !isVisible_(dep, answers, questions)) return false;
  var a = answers[depId];
  var vals = Array.isArray(a) ? a : [a];
  return vals.some(function (v) { return allowed.indexOf(parseInt(v, 10)) !== -1; });
}

function isParticipationConfirmed_(deviceId) {
  if (!deviceId) return false;
  return !!findInColumn_(SHEETS.participation, "device_id", deviceId);
}

function cleanId_(v) {
  var s = String(v || "").trim();
  return /^[A-Za-z0-9\-_]{8,64}$/.test(s) ? s : "";
}

function getOrCreateSheet_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** Garantiza que todas las claves existen como cabeceras (añade las que falten al final). Devuelve la lista de cabeceras. */
function ensureHeaders_(sheet, keys) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); }).filter(String);
  var missing = keys.filter(function (k) { return headers.indexOf(k) === -1; });
  if (missing.length) {
    sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
    headers = headers.concat(missing);
  }
  return headers;
}

function findInColumn_(sheetName, header, value) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return false;
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  var col = headers.indexOf(header);
  if (col === -1) return false;
  var values = sheet.getRange(2, col + 1, sheet.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) if (String(values[i][0]) === value) return true;
  return false;
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
  Logger.log("hoy: " + p.today + " · retos: " + p.quests.length + " · reto de hoy: " + p.todayId + " · vídeos: " + p.videos.length + " · canales: " + p.canales.length + " · preguntas: " + p.survey.length);
  Logger.log(JSON.stringify(p.quests[0], null, 2));
}
