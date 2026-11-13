/* QuestIA — lógica de la app (fase 3).
   Módulos en este archivo: idioma, rutas (#inicio, #retos, #videos, #encuesta, #reto/ID),
   catálogo y reto del día, recorrido del reto, progreso con calendario, pestaña Retos con filtros,
   vídeos, tarjeta de instalación, service worker.
   Cuando crezca, se separará en quests.js / progress.js / etc. (sección 10 del documento maestro). */

(function () {
  "use strict";

  var APP_VERSION = "0.3.2";
  var STORAGE_LANG = "questia.lang";
  var STORAGE_PROGRESS = "questia.progress";
  var STORAGE_INSTALL_DISMISSED = "questia.installDismissed";
  var INSTALL_DISMISS_DAYS = 7;
  var TIMEZONE = "Europe/Madrid";

  var I18N = window.QUESTIA_I18N;
  var LANGS = window.QUESTIA_LANGS;
  var currentLang = null;

  var catalog = { quests: [], loaded: false, error: false };
  var videos = { items: [], loaded: false, error: false };
  var filters = { questCat: "all", videoCat: "all", videoLang: "all" };
  var progress = loadProgress();

  /* =========================================================
     Utilidades
     ========================================================= */

  function storageGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* almacenamiento no disponible */ }
  }

  /* Fecha de hoy en Europe/Madrid como "YYYY-MM-DD".
     En la fase 4 esta decisión pasa al servidor (Apps Script); el cliente la mantiene
     solo para el modo demo y para el calendario. */
  function todayISO() {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    } catch (e) {
      var d = new Date();
      return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
    }
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function addDaysISO(iso, days) {
    var p = iso.split("-").map(Number);
    var d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + days));
    return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
  }

  function formatDate(iso) {
    var p = iso.split("-").map(Number);
    var d = new Date(Date.UTC(p[0], p[1] - 1, p[2], 12));
    try {
      return new Intl.DateTimeFormat(currentLang, { day: "numeric", month: "long", timeZone: "UTC" }).format(d);
    } catch (e) { return iso; }
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "class") node.className = attrs[k];
        else if (k === "text") node.textContent = attrs[k];
        else if (k === "html") node.innerHTML = attrs[k];
        else if (k.indexOf("on") === 0) node.addEventListener(k.slice(2), attrs[k]);
        else node.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) { if (c) node.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return node;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  /* =========================================================
     Idioma
     ========================================================= */

  function detectLang() {
    var saved = storageGet(STORAGE_LANG);
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
      Object.keys(params).forEach(function (p) { text = text.split("{" + p + "}").join(params[p]); });
    }
    return text;
  }

  /* Texto multilingüe de contenido: {en, ca, es} → idioma actual, con respaldo. */
  function tc(obj) {
    if (!obj) return "";
    if (typeof obj === "string") return obj;
    return obj[currentLang] || obj[window.QUESTIA_DEFAULT_LANG] || obj.en || "";
  }

  function applyLang(lang) {
    currentLang = lang;
    document.documentElement.lang = lang;
    storageSet(STORAGE_LANG, lang);

    document.querySelectorAll("[data-i18n]").forEach(function (node) {
      node.textContent = t(node.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-i18n-aria]").forEach(function (node) {
      node.setAttribute("aria-label", t(node.getAttribute("data-i18n-aria")));
    });
    document.querySelectorAll(".lang-btn").forEach(function (btn) {
      btn.setAttribute("aria-pressed", btn.getAttribute("data-lang") === lang ? "true" : "false");
    });
    render();
  }

  /* =========================================================
     Catálogo y reto del día
     ========================================================= */

  function loadCatalog() {
    fetch("data/quests.json", { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (json) {
        var quests = Array.isArray(json.quests) ? json.quests : [];
        /* MODO DEMO: el catálogo de demostración no tiene fechas reales; se reparten
           hoy, ayer, anteayer… para que el prototipo siempre tenga reto del día.
           Con el servidor (fase 4) las fechas vienen de la hoja y esto desaparece. */
        if (json.demo_relative_dates) {
          var today = todayISO();
          quests.forEach(function (q, i) { q.fecha_publicacion = addDaysISO(today, -i); });
        }
        catalog.quests = quests;
        catalog.loaded = true;
        render();
      })
      .catch(function () {
        catalog.error = true;
        render();
      });
  }

  function loadVideos() {
    fetch("data/videos.json", { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (json) {
        videos.items = (Array.isArray(json.videos) ? json.videos : []).filter(function (v) { return v.estado === "publicado" && v.youtube_id; })
          .sort(function (a, b) { return a.fecha_alta < b.fecha_alta ? 1 : -1; });
        videos.loaded = true;
        render();
      })
      .catch(function () { videos.error = true; render(); });
  }

  /* Simulación local de la selección en servidor: solo publicados con fecha ≤ hoy. */
  function availableQuests() {
    var today = todayISO();
    return catalog.quests.filter(function (q) {
      return q.estado === "publicado" && q.fecha_publicacion && q.fecha_publicacion <= today;
    }).sort(function (a, b) { return a.fecha_publicacion < b.fecha_publicacion ? 1 : -1; });
  }
  function todaysQuest() {
    var today = todayISO();
    return availableQuests().filter(function (q) { return q.fecha_publicacion === today; })[0] || null;
  }
  function previousQuests() {
    var today = todayISO();
    return availableQuests().filter(function (q) { return q.fecha_publicacion !== today; });
  }
  function findQuest(id) {
    return availableQuests().filter(function (q) { return q.id === id; })[0] || null;
  }

  /* =========================================================
     Progreso (en el dispositivo)
     ========================================================= */

  function loadProgress() {
    try {
      var raw = storageGet(STORAGE_PROGRESS);
      var data = raw ? JSON.parse(raw) : null;
      if (data && typeof data === "object" && data.solved) return data;
    } catch (e) { /* datos corruptos: se reinicia */ }
    return { solved: {} };
  }
  function saveProgress() { storageSet(STORAGE_PROGRESS, JSON.stringify(progress)); }

  function markSolved(questId, correct) {
    if (progress.solved[questId]) return; /* cuenta una sola vez (decisión pendiente nº 8: repetir no suma) */
    progress.solved[questId] = { date: todayISO(), correct: !!correct };
    saveProgress();
  }
  function solvedCount() { return Object.keys(progress.solved).length; }
  function solvedDates() {
    var set = {};
    Object.keys(progress.solved).forEach(function (id) { set[progress.solved[id].date] = true; });
    return set;
  }

  /* =========================================================
     Render: Inicio
     ========================================================= */

  function renderGreeting() {
    var hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TIMEZONE, hour: "numeric", hour12: false }).format(new Date()));
    var key = hour < 13 ? "greetingMorning" : hour < 20 ? "greetingAfternoon" : "greetingEvening";
    document.getElementById("greeting").textContent = t(key);
  }

  function questMeta(q) {
    var catKey = { mente: "catMente", estudio: "catEstudio", descubre: "catDescubre" }[q.categoria] || "catMente";
    return el("ul", { class: "meta" }, [
      el("li", { class: "chip chip-cat", text: t(catKey) }),
      el("li", { class: "chip", text: t("minutes", { n: q.minutos || 2 }) }),
      el("li", { class: "chip", text: t("diff" + (q.dificultad || 1)) }),
      progress.solved[q.id] ? el("li", { class: "chip chip-solved", text: "✓ " + t("solvedBadge") }) : null
    ]);
  }

  function renderToday() {
    var body = document.getElementById("today-body");
    clear(body);
    if (catalog.error) { body.appendChild(el("p", { class: "notice", text: t("loadError") })); return; }
    if (!catalog.loaded) return;

    var q = todaysQuest();
    if (!q) {
      body.appendChild(el("h1", { text: t("noQuestTitle") }));
      body.appendChild(el("p", { class: "muted", text: t("noQuestBody") }));
      return;
    }
    body.appendChild(el("h1", { text: tc(q.titulo) }));
    body.appendChild(questMeta(q));
    body.appendChild(el("p", { class: "muted", text: tc(q.enunciado) }));
    body.appendChild(el("div", { class: "actions" }, [
      el("a", { class: "btn btn-primary", href: "#reto/" + q.id, text: progress.solved[q.id] ? t("reviewQuest") : t("startQuest") })
    ]));
  }

  function renderProgress() {
    var n = solvedCount();
    document.getElementById("progress-count").textContent = n === 0 ? t("solvedZero") : n === 1 ? t("solvedOne") : t("solvedMany", { n: n });
    renderCalendar();
  }

  function renderCalendar() {
    var box = document.getElementById("calendar");
    clear(box);
    box.setAttribute("aria-label", t("calendarLabel"));

    var today = todayISO();
    var parts = today.split("-").map(Number);
    var year = parts[0], month = parts[1];
    var solved = solvedDates();

    var monthName;
    try {
      monthName = new Intl.DateTimeFormat(currentLang, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
    } catch (e) { monthName = year + "-" + pad(month); }
    monthName = monthName.charAt(0).toUpperCase() + monthName.slice(1);
    box.appendChild(el("div", { class: "calendar-head" }, [el("span", { class: "calendar-month", text: monthName })]));

    var grid = el("div", { class: "calendar-grid" });
    /* Cabecera de días, lunes primero */
    for (var w = 0; w < 7; w++) {
      var ref = new Date(Date.UTC(2024, 0, 1 + w)); /* 1 ene 2024 fue lunes */
      var label;
      try { label = new Intl.DateTimeFormat(currentLang, { weekday: "narrow", timeZone: "UTC" }).format(ref); } catch (e) { label = "·"; }
      grid.appendChild(el("div", { class: "calendar-wd", "aria-hidden": "true", text: label }));
    }
    var first = new Date(Date.UTC(year, month - 1, 1));
    var offset = (first.getUTCDay() + 6) % 7; /* 0 = lunes */
    for (var i = 0; i < offset; i++) grid.appendChild(el("div", { class: "calendar-day is-empty" }));
    var daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    for (var d = 1; d <= daysInMonth; d++) {
      var iso = year + "-" + pad(month) + "-" + pad(d);
      var cls = "calendar-day" + (solved[iso] ? " is-solved" : "") + (iso === today ? " is-today" : "");
      grid.appendChild(el("div", { class: cls, text: String(d) }));
    }
    box.appendChild(grid);
  }

  function renderPrevious() {
    var list = document.getElementById("previous-list");
    clear(list);
    if (!catalog.loaded) return;
    var items = previousQuests();
    if (!items.length) { list.appendChild(el("li", { class: "muted", text: t("noPrevious") })); return; }
    items.forEach(function (q) {
      list.appendChild(el("li", null, [
        el("a", { class: "quest-item", href: "#reto/" + q.id }, [
          el("span", { class: "quest-title", text: tc(q.titulo) }),
          el("span", { class: "quest-date", text: formatDate(q.fecha_publicacion) }),
          progress.solved[q.id] ? el("span", { class: "quest-check", "aria-label": t("solvedBadge"), text: "✓" }) : null
        ])
      ]));
    });
  }

  /* =========================================================
     Render: recorrido del reto
     ========================================================= */

  var questState = { id: null, hints: 0, selected: null, answered: false };

  function renderQuest(id) {
    var card = document.getElementById("quest-card");
    clear(card);
    if (!catalog.loaded) return;
    var q = findQuest(id);
    if (!q) { card.appendChild(el("p", { class: "notice", text: t("questNotFound") })); return; }

    if (questState.id !== id) questState = { id: id, hints: 0, selected: null, answered: false };

    card.appendChild(el("p", { class: "eyebrow", text: formatDate(q.fecha_publicacion) }));
    card.appendChild(el("h1", { text: tc(q.titulo) }));
    card.appendChild(questMeta(q));
    if (progress.solved[q.id]) {
      card.appendChild(el("p", { class: "notice", text: t("alreadySolved", { d: formatDate(progress.solved[q.id].date) }) }));
    }
    card.appendChild(el("p", { class: "quest-statement", text: tc(q.enunciado) }));

    /* Pistas mostradas */
    var hints = [q.pista1, q.pista2].filter(function (h) { return h && tc(h); });
    if (questState.hints > 0) {
      var hintBox = el("div", { class: "hints" });
      for (var i = 0; i < Math.min(questState.hints, hints.length); i++) {
        hintBox.appendChild(el("div", { class: "hint" }, [el("strong", { text: t("hintLabel", { n: i + 1 }) }), tc(hints[i])]));
      }
      card.appendChild(hintBox);
    }

    /* Respuesta */
    var options = tc(q.opciones);
    var isShort = q.tipo === "respuesta corta" || !Array.isArray(options) || !options.length;
    var answerArea;
    if (isShort) {
      answerArea = el("input", {
        class: "short-answer", type: "text", placeholder: t("shortAnswerPlaceholder"),
        "aria-label": t("shortAnswerPlaceholder"), value: questState.selected || "",
        oninput: function (e) { questState.selected = e.target.value; updateAnswerBtn(); }
      });
      if (questState.answered) answerArea.disabled = true;
      card.appendChild(answerArea);
    } else {
      var list = el("ul", { class: "options", role: "group", "aria-label": t("chooseOption") });
      options.forEach(function (opt, idx) {
        var cls = "option";
        if (questState.answered) {
          if (idx === q.respuesta_correcta) cls += " is-correct";
          else if (idx === questState.selected) cls += " is-wrong";
        }
        var btn = el("button", {
          type: "button", class: cls, text: opt,
          "aria-pressed": questState.selected === idx ? "true" : "false",
          onclick: function () { if (questState.answered) return; questState.selected = idx; renderQuest(id); }
        });
        if (questState.answered) btn.disabled = true;
        list.appendChild(el("li", null, [btn]));
      });
      card.appendChild(list);
    }

    /* Acciones antes de responder */
    if (!questState.answered) {
      var actions = el("div", { class: "actions" });
      if (questState.hints < hints.length) {
        actions.appendChild(el("button", {
          type: "button", class: "btn btn-secondary", text: questState.hints === 0 ? t("hintBtn") : t("hintBtn2"),
          onclick: function () { questState.hints++; renderQuest(id); }
        }));
      }
      var answerBtn = el("button", {
        type: "button", class: "btn btn-primary", id: "answer-btn", text: t("answerBtn"),
        onclick: function () { submitAnswer(q, isShort); }
      });
      actions.appendChild(answerBtn);
      card.appendChild(actions);
      updateAnswerBtn();
      return;
    }

    /* Resultado, explicación y curiosidad */
    var correct = isCorrect(q, isShort);
    var result = el("div", { class: "result " + (correct ? "is-correct" : "is-wrong"), role: "status" }, [
      el("h2", { text: correct ? t("correctTitle") : t("incorrectTitle") })
    ]);
    if (!correct) {
      var right = isShort ? tc(q.respuesta_correcta) : options[q.respuesta_correcta];
      result.appendChild(el("p", { text: t("correctAnswerWas", { a: right }) }));
    }
    card.appendChild(result);

    var explain = el("div", { class: "explain" });
    if (tc(q.explicacion)) { explain.appendChild(el("h3", { text: t("explanationTitle") })); explain.appendChild(el("p", { text: tc(q.explicacion) })); }
    if (tc(q.curiosidad)) { explain.appendChild(el("h3", { text: t("curiosityTitle") })); explain.appendChild(el("p", { text: tc(q.curiosidad) })); }
    if (q.fuente) { explain.appendChild(el("p", { class: "source", text: t("sourceLabel") + ": " + q.fuente })); }
    card.appendChild(explain);

    card.appendChild(el("div", { class: "actions" }, [
      el("a", { class: "btn btn-primary btn-block", href: "#inicio", text: t("finishBtn") })
    ]));
  }

  function updateAnswerBtn() {
    var btn = document.getElementById("answer-btn");
    if (!btn) return;
    var has = questState.selected !== null && String(questState.selected).trim() !== "";
    btn.disabled = !has;
  }

  function normalize(s) {
    return String(s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  }
  function isCorrect(q, isShort) {
    if (isShort) {
      var expected = tc(q.respuesta_correcta);
      return normalize(questState.selected) === normalize(expected);
    }
    return questState.selected === q.respuesta_correcta;
  }

  function submitAnswer(q, isShort) {
    if (questState.selected === null || String(questState.selected).trim() === "") return;
    questState.answered = true;
    markSolved(q.id, isCorrect(q, isShort));
    renderQuest(q.id);
    var status = document.querySelector("#quest-card .result");
    if (status) { status.setAttribute("tabindex", "-1"); status.focus(); }
  }

  /* =========================================================
     Render: pestaña Retos
     ========================================================= */

  var CATEGORIES = [["mente", "catMente"], ["estudio", "catEstudio"], ["descubre", "catDescubre"]];

  function renderFilterChips(container, options, current, onPick) {
    clear(container);
    [["all", t("filterAll")]].concat(options).forEach(function (opt) {
      container.appendChild(el("button", {
        type: "button", class: "filter-btn", text: opt[1],
        "aria-pressed": current === opt[0] ? "true" : "false",
        onclick: function () { onPick(opt[0]); }
      }));
    });
  }

  function renderQuestsTab() {
    var filtersBox = document.getElementById("quest-filters");
    var list = document.getElementById("quests-list");
    if (!filtersBox || !list) return;
    renderFilterChips(filtersBox, CATEGORIES.map(function (c) { return [c[0], t(c[1])]; }), filters.questCat, function (v) { filters.questCat = v; renderQuestsTab(); });

    clear(list);
    if (catalog.error) { list.appendChild(el("li", { class: "notice", text: t("loadError") })); return; }
    if (!catalog.loaded) return;
    var today = todayISO();
    var items = availableQuests().filter(function (q) { return filters.questCat === "all" || q.categoria === filters.questCat; });
    if (!items.length) { list.appendChild(el("li", { class: "muted", text: t("noQuestsFilter") })); return; }
    items.forEach(function (q) {
      var catKey = { mente: "catMente", estudio: "catEstudio", descubre: "catDescubre" }[q.categoria] || "catMente";
      list.appendChild(el("li", null, [
        el("a", { class: "quest-item", href: "#reto/" + q.id }, [
          el("span", { class: "quest-title" }, [
            tc(q.titulo),
            el("span", { class: "chip chip-cat", style: "margin-left:8px", text: t(catKey) })
          ]),
          el("span", { class: "quest-date", text: q.fecha_publicacion === today ? t("todayQuest") : formatDate(q.fecha_publicacion) }),
          progress.solved[q.id] ? el("span", { class: "quest-check", "aria-label": t("solvedBadge"), text: "✓" }) : null
        ])
      ]));
    });
  }

  /* =========================================================
     Render: vídeos
     ========================================================= */

  var VIDEO_LANGS = [["en", "videoLang_en"], ["ca", "videoLang_ca"], ["es", "videoLang_es"]];

  function renderVideos() {
    var catBox = document.getElementById("video-filters-cat");
    var langBox = document.getElementById("video-filters-lang");
    var list = document.getElementById("videos-list");
    if (!catBox || !langBox || !list) return;
    renderFilterChips(catBox, CATEGORIES.map(function (c) { return [c[0], t(c[1])]; }), filters.videoCat, function (v) { filters.videoCat = v; renderVideos(); });
    renderFilterChips(langBox, VIDEO_LANGS.map(function (l) { return [l[0], t(l[1])]; }), filters.videoLang, function (v) { filters.videoLang = v; renderVideos(); });

    clear(list);
    if (videos.error) { list.appendChild(el("p", { class: "notice", text: t("loadError") })); return; }
    if (!videos.loaded) return;
    var items = videos.items.filter(function (v) {
      return (filters.videoCat === "all" || v.categoria === filters.videoCat) &&
             (filters.videoLang === "all" || v.idioma_video === filters.videoLang);
    });
    if (!items.length) { list.appendChild(el("p", { class: "muted", text: t("noVideosFilter") })); return; }
    items.forEach(function (v) { list.appendChild(videoCard(v)); });
  }

  function videoCard(v) {
    var catKey = { mente: "catMente", estudio: "catEstudio", descubre: "catDescubre" }[v.categoria] || "catDescubre";
    var langKey = "videoLang_" + v.idioma_video;
    var title = tc(v.titulo);
    var media = el("div", { class: "video-media" }, [
      el("img", { src: "https://i.ytimg.com/vi/" + encodeURIComponent(v.youtube_id) + "/hqdefault.jpg", alt: "", loading: "lazy", width: "480", height: "360" }),
      el("button", {
        type: "button", class: "video-play", "aria-label": t("playVideo") + ": " + title,
        onclick: function () { playVideo(media, v, title); }
      }, [el("span", { html: '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>' })])
    ]);
    return el("article", { class: "card video-card" }, [
      media,
      el("div", { class: "video-body" }, [
        el("h2", { text: title }),
        el("ul", { class: "meta" }, [
          el("li", { class: "chip chip-cat", text: t(catKey) }),
          el("li", { class: "chip", text: t(langKey) })
        ]),
        el("p", { class: "muted", text: tc(v.descripcion) }),
        el("p", { class: "video-channel" }, [
          v.canal + " · ",
          el("a", { href: "https://www.youtube.com/watch?v=" + encodeURIComponent(v.youtube_id), target: "_blank", rel: "noopener noreferrer", text: t("openOnYoutube") })
        ])
      ])
    ]);
  }

  /* El reproductor (youtube-nocookie.com) solo se carga al pulsar: hasta entonces no se envía nada a YouTube
     salvo la miniatura. */
  function playVideo(media, v, title) {
    clear(media);
    media.appendChild(el("iframe", {
      src: "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(v.youtube_id) + "?autoplay=1&rel=0",
      title: title, allow: "autoplay; encrypted-media; picture-in-picture", allowfullscreen: "", loading: "eager"
    }));
    /* Fase 5: aquí se registrará el evento video_open. */
  }

  /* =========================================================
     Tarjeta de instalación (PWA)
     ========================================================= */

  var deferredInstallPrompt = null;

  function isStandalone() {
    return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
      window.navigator.standalone === true;
  }

  function isIOS() {
    var ua = navigator.userAgent || "";
    return /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  function installDismissed() {
    var until = Number(storageGet(STORAGE_INSTALL_DISMISSED) || 0);
    return until > Date.now();
  }

  function renderInstallCard() {
    var card = document.getElementById("install-card");
    if (!card) return;
    var btn = document.getElementById("install-btn");
    var ios = document.getElementById("install-ios");
    var show = !isStandalone() && !installDismissed() && (deferredInstallPrompt || isIOS());
    card.hidden = !show;
    if (!show) return;
    btn.hidden = !deferredInstallPrompt;
    ios.hidden = !!deferredInstallPrompt || !isIOS();
  }

  function setupInstall() {
    window.addEventListener("beforeinstallprompt", function (e) {
      e.preventDefault();
      deferredInstallPrompt = e;
      renderInstallCard();
    });
    window.addEventListener("appinstalled", function () {
      deferredInstallPrompt = null;
      renderInstallCard();
      /* Fase 5: aquí se registrará el evento install. */
    });
    var btn = document.getElementById("install-btn");
    if (btn) btn.addEventListener("click", function () {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      deferredInstallPrompt.userChoice.then(function () { deferredInstallPrompt = null; renderInstallCard(); });
    });
    var dismiss = document.getElementById("install-dismiss");
    if (dismiss) dismiss.addEventListener("click", function () {
      storageSet(STORAGE_INSTALL_DISMISSED, String(Date.now() + INSTALL_DISMISS_DAYS * 86400000));
      renderInstallCard();
    });
  }

  /* =========================================================
     Rutas y render general
     ========================================================= */

  function currentRoute() {
    var hash = (location.hash || "#inicio").slice(1);
    var parts = hash.split("/");
    return { view: parts[0] || "inicio", param: parts[1] || null };
  }

  function render() {
    if (!currentLang) return;
    var route = currentRoute();
    var known = ["inicio", "reto", "retos", "videos", "encuesta"];
    if (known.indexOf(route.view) === -1) { route = { view: "inicio", param: null }; }

    document.querySelectorAll(".view").forEach(function (v) { v.hidden = v.getAttribute("data-view") !== route.view; });
    document.querySelectorAll(".nav-item").forEach(function (a) {
      var active = a.getAttribute("data-nav") === (route.view === "reto" ? "inicio" : route.view);
      a.classList.toggle("is-active", active);
      if (active) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });

    renderGreeting();
    renderToday();
    renderProgress();
    renderPrevious();
    renderInstallCard();
    if (route.view === "retos") renderQuestsTab();
    if (route.view === "videos") renderVideos();
    if (route.view === "reto") renderQuest(route.param);
    document.getElementById("app-version").textContent = "QuestIA v" + APP_VERSION;
  }

  function onRouteChange() {
    questState = { id: null, hints: 0, selected: null, answered: false };
    render();
    window.scrollTo(0, 0);
    var main = document.getElementById("main");
    if (main) main.focus({ preventScroll: true });
  }

  /* =========================================================
     Service worker
     ========================================================= */

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;

    /* Cuando un service worker nuevo toma el control (versión nueva publicada),
       la página se recarga una sola vez para que HTML, CSS y JS sean de la misma versión. */
    var hadController = !!navigator.serviceWorker.controller;
    var reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (hadController && !reloaded) { reloaded = true; location.reload(); }
    });

    navigator.serviceWorker.register("service-worker.js", { updateViaCache: "none" })
      .then(function (reg) { if (reg.update) reg.update(); })
      .catch(function () { /* sin SW: la app sigue funcionando en línea */ });
  }

  /* =========================================================
     Arranque
     ========================================================= */

  function init() {
    document.querySelectorAll(".lang-btn").forEach(function (btn) {
      btn.addEventListener("click", function () { applyLang(btn.getAttribute("data-lang")); });
    });
    window.addEventListener("hashchange", onRouteChange);
    setupInstall();
    applyLang(detectLang());
    loadCatalog();
    loadVideos();
    registerServiceWorker();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
