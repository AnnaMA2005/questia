/* QuestIA — lógica base (fase 2).
   Responsabilidades en esta fase: idioma, registro del service worker y comprobaciones de entorno.
   Los módulos de retos, encuesta, recordatorios y métricas se añaden en fases posteriores. */

(function () {
  "use strict";

  var APP_VERSION = "0.2.0";
  var STORAGE_LANG = "questia.lang";
  var I18N = window.QUESTIA_I18N;
  var LANGS = window.QUESTIA_LANGS;
  var currentLang = null;

  /* ---------- Idioma ---------- */

  function detectLang() {
    var saved = null;
    try { saved = localStorage.getItem(STORAGE_LANG); } catch (e) { /* almacenamiento no disponible */ }
    if (saved && LANGS.indexOf(saved) !== -1) return saved;

    var candidates = navigator.languages || [navigator.language || ""];
    for (var i = 0; i < candidates.length; i++) {
      var code = String(candidates[i]).slice(0, 2).toLowerCase();
      if (LANGS.indexOf(code) !== -1) return code;
    }
    return window.QUESTIA_DEFAULT_LANG;
  }

  function t(key, params) {
    var dict = I18N[currentLang] || I18N[window.QUESTIA_DEFAULT_LANG];
    var text = dict[key];
    if (text === undefined) return key;
    if (params) {
      Object.keys(params).forEach(function (p) {
        text = text.replace("{" + p + "}", params[p]);
      });
    }
    return text;
  }

  function applyLang(lang) {
    currentLang = lang;
    document.documentElement.lang = lang;
    try { localStorage.setItem(STORAGE_LANG, lang); } catch (e) { /* ignorar */ }

    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-i18n-aria]").forEach(function (el) {
      el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria")));
    });
    document.querySelectorAll(".lang-btn").forEach(function (btn) {
      var active = btn.getAttribute("data-lang") === lang;
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });

    document.title = "QuestIA";
    setCheck("check-lang", t("langName"));
    renderDynamicChecks();
  }

  /* ---------- Comprobaciones ---------- */

  var state = { sw: "pending", dataCount: null, dataError: false };

  function setCheck(id, value, status) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = value;
    el.classList.remove("is-ok", "is-error");
    if (status) el.classList.add(status === "ok" ? "is-ok" : "is-error");
  }

  function isStandalone() {
    return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
      window.navigator.standalone === true;
  }

  function renderDynamicChecks() {
    setCheck("check-mode", isStandalone() ? t("modeStandalone") : t("modeBrowser"));
    setCheck("check-version", APP_VERSION);

    var swMap = { active: ["swActive", "ok"], unsupported: ["swUnsupported", null], error: ["swError", "error"], pending: ["swPending", null] };
    setCheck("check-sw", t(swMap[state.sw][0]), swMap[state.sw][1]);

    if (state.dataError) setCheck("check-data", t("dataError"), "error");
    else if (state.dataCount !== null) setCheck("check-data", t("dataOk", { n: state.dataCount }), "ok");
  }

  function loadDemoData() {
    fetch("data/quests.json", { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (json) {
        state.dataCount = Array.isArray(json.quests) ? json.quests.length : 0;
        renderDynamicChecks();
      })
      .catch(function () {
        state.dataError = true;
        renderDynamicChecks();
      });
  }

  /* ---------- Service worker ---------- */

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) {
      state.sw = "unsupported";
      renderDynamicChecks();
      return;
    }
    navigator.serviceWorker.register("service-worker.js")
      .then(function (reg) {
        state.sw = "active";
        renderDynamicChecks();
        reg.addEventListener("updatefound", function () {
          /* Fase posterior: avisar al usuario de que hay una actualización disponible. */
        });
      })
      .catch(function () {
        state.sw = "error";
        renderDynamicChecks();
      });
  }

  /* ---------- Arranque ---------- */

  function init() {
    document.querySelectorAll(".lang-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        applyLang(btn.getAttribute("data-lang"));
      });
    });

    applyLang(detectLang());
    loadDemoData();
    registerServiceWorker();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
