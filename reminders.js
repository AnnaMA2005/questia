/* QuestIA — recordatorios de la encuesta (fase 5b). Sección 7 del documento maestro.

   Dos modos, elegidos en config.js (REMINDERS.MODE):
     "mix"   → nada en la primera visita; tarjeta al terminar el primer reto; en escritorio también si el ratón
               sale de la página sin haber hecho ningún reto; a partir de la segunda sesión, tarjeta arriba de Inicio.
     "modal" → en la primera apertura (y siguientes, dentro de los límites), un modal que se puede cerrar.
   Límites comunes (config.js): mínimo de días entre recordatorios, máximo total, días de silencio al descartar.
   Nunca durante un reto en curso. Cesan definitivamente cuando el servidor confirma la participación.
   Descartar no equivale a participar: la preferencia de ocultar se guarda aparte del estado real. */

(function () {
  "use strict";

  var Q = window.QuestIA;
  if (!Q) return;

  var STORAGE = "questia.reminders";
  var STORAGE_SESSIONS = "questia.sessions";
  var DAY = 86400000;

  var cfg = (Q.config && Q.config.REMINDERS) || {};
  var MODE = cfg.MODE === "modal" ? "modal" : "mix";
  var MIN_DAYS = typeof cfg.MIN_DAYS_BETWEEN === "number" ? cfg.MIN_DAYS_BETWEEN : 3;
  var MAX_TOTAL = typeof cfg.MAX_TOTAL === "number" ? cfg.MAX_TOTAL : 5;
  var DISMISS_DAYS = typeof cfg.DISMISS_DAYS === "number" ? cfg.DISMISS_DAYS : 7;
  var SIGNATURE = String(cfg.SIGNATURE || "");

  var st = load();
  var sessionShown = false;        // como máximo un recordatorio por sesión
  var sessions = 0;
  var cache = { home: null, quest: null, questId: null };   // la tarjeta mostrada se conserva durante la sesión

  function load() {
    try { var s = JSON.parse(Q.storageGet(STORAGE) || "null"); if (s && typeof s === "object") return s; } catch (e) { /* reinicio */ }
    return { shown: 0, lastAt: 0, dismissedUntil: 0 };
  }
  function save() { Q.storageSet(STORAGE, JSON.stringify(st)); }

  /* ---------- Elegibilidad ---------- */

  function surveyStatus() { return Q.survey ? Q.survey.status() : "none"; }

  function eligible() {
    if (!Q.survey || !Q.survey.available()) return false;
    var s = surveyStatus();
    if (s === "confirmed" || s === "sent_pending") return false;
    if (sessionShown) return false;
    if (st.dismissedUntil && Date.now() < st.dismissedUntil) return false;
    if (st.shown >= MAX_TOTAL) return false;
    if (st.lastAt && Date.now() - st.lastAt < MIN_DAYS * DAY) return false;
    return true;
  }

  function markShown() {
    sessionShown = true;
    st.shown += 1; st.lastAt = Date.now(); save();
    /* Fase 5c: evento survey_shown */
  }
  function dismiss() {
    st.dismissedUntil = Date.now() + DISMISS_DAYS * DAY; save();
    cache.home = null; cache.quest = null; cache.questId = null;
    closeOverlay();
    Q.render();
  }
  function goToSurvey() {
    closeOverlay();
    if (Q.survey && surveyStatus() === "none") Q.survey.start();
    location.hash = "#encuesta";
    /* Fase 5c: evento survey_open */
  }

  /* ---------- Mensajes (rotan; primera persona de la autora) ---------- */

  function message(trigger) {
    var key;
    if (surveyStatus() === "open") key = "remMsgContinue";
    else if (trigger === "quest") key = "remMsgAfterQuest";
    else if (st.shown === 0) key = "remMsgInitial";
    else if (st.shown === 1) key = "remMsgShort";
    else key = "remMsgLater";
    var text = Q.t(key);
    return SIGNATURE ? text + " — " + SIGNATURE : text;
  }

  function buildCard(trigger, extraClass) {
    var el = Q.el, t = Q.t;
    var isOpen = surveyStatus() === "open";
    return el("div", { class: "reminder " + (extraClass || "") , role: "region", "aria-label": t("remAria") }, [
      el("p", { class: "eyebrow", text: t("remEyebrow") }),
      el("p", { class: "reminder-text", text: message(trigger) }),
      el("div", { class: "actions" }, [
        el("button", { type: "button", class: "btn btn-primary", text: isOpen ? t("remCtaContinue") : t("remCtaAnswer"), onclick: goToSurvey }),
        el("button", { type: "button", class: "btn btn-ghost", text: t("remLater"), onclick: dismiss })
      ])
    ]);
  }

  /* ---------- Presentaciones ---------- */

  var overlay = null;

  function openOverlay(trigger, blocking) {
    if (overlay) return;
    var el = Q.el;
    overlay = el("div", { class: "reminder-overlay" + (blocking ? " is-modal" : " is-banner"), role: blocking ? "dialog" : "complementary", "aria-modal": blocking ? "true" : "false" });
    var card = buildCard(trigger, "reminder-float");
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    markShown();
    var first = card.querySelector("button");
    if (first) first.focus();
    document.addEventListener("keydown", onKey);
  }
  function closeOverlay() {
    if (!overlay) return;
    overlay.parentNode.removeChild(overlay); overlay = null;
    document.removeEventListener("keydown", onKey);
  }
  function onKey(e) { if (e.key === "Escape") { closeOverlay(); } }

  /* ---------- Puntos de entrada (los llama app.js) ---------- */

  var api = {
    mode: MODE,

    /* Al arrancar la app: cuenta sesiones y, en modo modal, muestra el modal si procede. */
    onSessionStart: function () {
      sessions = parseInt(Q.storageGet(STORAGE_SESSIONS) || "0", 10) + 1;
      Q.storageSet(STORAGE_SESSIONS, String(sessions));
      if (MODE === "modal") {
        /* esperar a que llegue el catálogo (la encuesta debe estar publicada) */
        var tries = 0;
        var timer = setInterval(function () {
          tries += 1;
          if (Q.survey && Q.survey.available()) { clearInterval(timer); if (eligible() && !inQuest()) openOverlay("open", true); }
          else if (tries > 40) clearInterval(timer);
        }, 250);
      }
      if (MODE === "mix") {
        document.addEventListener("mouseleave", function (e) {
          if (e.clientY > 0) return;                       // solo cuando sale por arriba (barra del navegador)
          if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return;  // no en táctil
          if (Q.solvedCount() > 0) return;                 // solo quien aún no ha hecho ningún reto
          if (eligible() && !inQuest()) openOverlay("exit", false);
        });
      }
    },

    /* Tarjeta arriba de Inicio (modo mix, a partir de la segunda sesión). Devuelve un elemento o null. */
    homeCard: function () {
      if (cache.home) return cache.home;
      if (MODE !== "mix" || sessions < 2) return null;
      if (!eligible()) return null;
      markShown();
      cache.home = buildCard("home", "reminder-inline card");
      return cache.home;
    },

    /* Tarjeta al terminar un reto (modo mix): se inserta encima de «Terminar». */
    afterQuestCard: function (questId) {
      if (cache.quest && cache.questId === questId) return cache.quest;
      if (MODE !== "mix") return null;
      if (!eligible()) return null;
      markShown();
      cache.questId = questId;
      cache.quest = buildCard("quest", "reminder-inline");
      return cache.quest;
    }
  };
  Q.reminders = api;

  function inQuest() {
    var h = location.hash || "";
    return h.indexOf("#reto/") === 0 && !(Q.questAnswered && Q.questAnswered());
  }
})();
