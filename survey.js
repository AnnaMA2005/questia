/* QuestIA — módulo de encuesta (fase 5).
   Pinta el cuestionario que llega del servidor (pestaña «survey»), guarda el borrador en el dispositivo,
   envía las respuestas a Apps Script y mantiene el estado de participación (sección 7 del documento maestro).

   Estados de participación (questia.participation.status):
     none          → no ha empezado
     open          → ha abierto la encuesta y tiene borrador
     sent_pending  → ha enviado pero el servidor aún no ha confirmado (se reintenta)
     confirmed     → el servidor confirmó: nunca más se recuerda
     unknown       → error de red al comprobar; se reintenta en la siguiente sesión
   Depende de window.QuestIA (helpers que exporta app.js). */

(function () {
  "use strict";

  var Q = window.QuestIA;
  if (!Q) return;

  var STORAGE_DEVICE = "questia.deviceId";
  var STORAGE_PART = "questia.participation";
  var STORAGE_DRAFT = "questia.surveyDraft";

  var state = {
    questions: [],          // publicadas, ordenadas (incluye la intro)
    answers: {},            // {id: índice | [índices] | texto}
    step: -1,               // -1 = intro, 0..n-1 = pregunta visible
    sending: false,
    error: null             // clave i18n del último error
  };

  /* ---------- Identidad anónima y persistencia ---------- */

  function uuid() {
    try { if (crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* sin crypto */ }
    var s = "";
    for (var i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
    return s;
  }
  function deviceId() {
    var id = Q.storageGet(STORAGE_DEVICE);
    if (!id) { id = uuid(); Q.storageSet(STORAGE_DEVICE, id); }
    return id;
  }
  function loadPart() {
    try { var p = JSON.parse(Q.storageGet(STORAGE_PART) || "null"); if (p && p.status) return p; } catch (e) { /* reinicio */ }
    return { status: "none" };
  }
  var part = loadPart();
  function savePart() { Q.storageSet(STORAGE_PART, JSON.stringify(part)); }

  function loadDraft() {
    try { var d = JSON.parse(Q.storageGet(STORAGE_DRAFT) || "null"); if (d && d.answers) { state.answers = d.answers; state.step = typeof d.step === "number" ? d.step : -1; } } catch (e) { /* sin borrador */ }
  }
  function saveDraft() { Q.storageSet(STORAGE_DRAFT, JSON.stringify({ answers: state.answers, step: state.step })); }
  function clearDraft() { try { localStorage.removeItem(STORAGE_DRAFT); } catch (e) { /* ignorar */ } }

  /* ---------- Preguntas visibles (mostrar_si) ---------- */

  function isVisible(q) {
    var rule = q.mostrar_si;
    if (!rule) return true;
    var m = rule.match(/^([A-Za-z0-9\-]+)\s*=\s*([0-9,\s]+)$/);
    if (!m) return true;
    var dep = state.questions.filter(function (x) { return x.id === m[1]; })[0];
    if (dep && !isVisible(dep)) return false;
    var allowed = m[2].split(",").map(function (x) { return parseInt(x, 10); });
    var a = state.answers[m[1]];
    var vals = Array.isArray(a) ? a : [a];
    return vals.some(function (v) { return allowed.indexOf(parseInt(v, 10)) !== -1; });
  }
  function visibleQuestions() {
    return state.questions.filter(function (q) { return q.tipo !== "intro" && isVisible(q); });
  }
  function intro() { return state.questions.filter(function (q) { return q.tipo === "intro"; })[0] || null; }

  function isAnswered(q) {
    var a = state.answers[q.id];
    if (a === undefined || a === null || a === "") return false;
    if (Array.isArray(a)) return a.length > 0;
    return true;
  }

  /* ---------- API pública (la usa app.js) ---------- */

  var api = {
    setQuestions: function (list) {
      state.questions = Array.isArray(list) ? list.slice().sort(function (a, b) { return a.orden - b.orden; }) : [];
    },
    status: function () { return part.status; },
    isConfirmed: function () { return part.status === "confirmed"; },
    hasDraft: function () { return part.status === "open"; },
    available: function () { return visibleQuestions().length > 0 || !!intro(); },
    start: function () { if (part.status === "none") { part.status = "open"; savePart(); } state.step = 0; saveDraft(); },
    render: render,
    sync: sync
  };
  Q.survey = api;
  loadDraft();

  /* ---------- Sincronización con el servidor ---------- */

  function sync() {
    if (!Q.config.API_URL || !navigator.onLine) return;
    if (part.status === "sent_pending" && part.pending) { send(part.pending); return; }
    if (part.status === "confirmed") return;
    /* contrastar con el servidor al abrir la app (por si respondió en otra sesión del mismo dispositivo) */
    fetch(Q.config.API_URL + "?action=participation&device=" + encodeURIComponent(deviceId()), { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.ok && j.confirmed) { confirm(); } })
      .catch(function () { /* sin red: se reintenta en la próxima sesión */ });
  }

  function confirm() {
    part = { status: "confirmed", confirmedAt: new Date().toISOString() };
    savePart();
    clearDraft();
    state.answers = {}; state.step = -1; state.sending = false; state.error = null;
    Q.render();
    /* Fase 5b: evento survey_confirmed */
  }

  function send(payload) {
    if (state.sending) return;
    state.sending = true; state.error = null;
    Q.render();
    fetch(Q.config.API_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        state.sending = false;
        if (j && j.ok && j.confirmed) { confirm(); return; }
        if (j && j.error === "validation") {
          /* el servidor rechazó algo: volver a la encuesta, mantener el borrador */
          part.status = "open"; delete part.pending; savePart();
          state.error = "surveyErrorValidation"; state.step = 0; saveDraft();
          Q.render(); return;
        }
        throw new Error(j && j.error || "error");
      })
      .catch(function () {
        /* red o servidor caído: queda pendiente y se reintenta al abrir la app o al volver la conexión */
        state.sending = false;
        part.status = "sent_pending"; part.pending = payload; savePart();
        state.error = null;
        Q.render();
      });
  }

  function submit() {
    var vis = visibleQuestions();
    var missing = vis.filter(function (q) { return q.obligatoria && !isAnswered(q); });
    if (missing.length) {
      state.step = vis.indexOf(missing[0]); state.error = "surveyRequired"; saveDraft(); Q.render(); return;
    }
    var answers = {};
    vis.forEach(function (q) { if (isAnswered(q)) answers[q.id] = state.answers[q.id]; });
    var payload = {
      action: "survey",
      submission_id: part.submissionId || uuid(),
      device_id: deviceId(),
      lang: Q.lang(),
      answers: answers,
      app_version: Q.version,
      mode: Q.isStandalone() ? "standalone" : "browser"
    };
    part.submissionId = payload.submission_id; savePart();
    send(payload);
  }

  window.addEventListener("online", function () { if (part.status === "sent_pending") sync(); });

  /* ---------- Render ---------- */

  function render() {
    var root = document.getElementById("survey-root");
    if (!root) return;
    Q.clear(root);
    var el = Q.el, t = Q.t, tc = Q.tc;

    if (part.status === "confirmed") { root.appendChild(thanksCard()); return; }
    if (part.status === "sent_pending") { root.appendChild(pendingCard()); return; }
    if (!api.available()) { root.appendChild(notPublishedCard()); return; }

    var vis = visibleQuestions();
    if (state.step < 0 || state.step >= vis.length) {
      if (state.step >= vis.length && vis.length) state.step = vis.length - 1;
      else { root.appendChild(introCard()); return; }
    }

    var q = vis[state.step];
    var card = el("article", { class: "card card-survey-q" });
    /* progreso */
    var pct = Math.round(((state.step + 1) / vis.length) * 100);
    card.appendChild(el("div", { class: "survey-progress", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(pct), "aria-label": t("surveyProgress", { i: state.step + 1, n: vis.length }) }, [
      el("div", { class: "survey-progress-bar", style: "width:" + pct + "%" })
    ]));
    card.appendChild(el("p", { class: "eyebrow", text: t("surveyProgress", { i: state.step + 1, n: vis.length }) }));
    card.appendChild(el("h2", { class: "survey-question", id: "survey-q-" + q.id, text: tc(q.texto) + (q.obligatoria ? "" : " " + t("surveyOptional")) }));
    if (tc(q.ayuda)) card.appendChild(el("p", { class: "muted", text: tc(q.ayuda) }));
    card.appendChild(inputFor(q));
    if (state.error) card.appendChild(el("p", { class: "notice notice-error", role: "alert", text: t(state.error) }));

    var actions = el("div", { class: "actions survey-actions" });
    actions.appendChild(el("button", { type: "button", class: "btn btn-ghost", text: t("surveyBack"), onclick: function () { state.error = null; state.step -= 1; saveDraft(); Q.render(); } }));
    var last = state.step === vis.length - 1;
    var next = el("button", { type: "button", class: "btn btn-primary", text: last ? (state.sending ? t("surveySending") : t("surveySend")) : t("surveyNext"),
      onclick: function () {
        /* se evalúa al pulsar (el desplegable y el texto cambian la respuesta sin repintar) */
        if (q.obligatoria && !isAnswered(q)) { state.error = "surveyRequired"; Q.render(); return; }
        state.error = null;
        if (last) { submit(); } else { state.step += 1; saveDraft(); Q.render(); }
      } });
    if (state.sending) next.disabled = true;
    actions.appendChild(next);
    card.appendChild(actions);
    root.appendChild(card);
  }

  function inputFor(q) {
    var el = Q.el, t = Q.t, tc = Q.tc;
    var opts = tc(q.opciones) || [];
    var a = state.answers[q.id];

    if (q.tipo === "single") {
      var list = el("ul", { class: "options", role: "radiogroup", "aria-labelledby": "survey-q-" + q.id });
      opts.forEach(function (o, i) {
        list.appendChild(el("li", null, [el("button", { type: "button", class: "option", role: "radio", "aria-checked": a === i ? "true" : "false", "aria-pressed": a === i ? "true" : "false", text: o,
          onclick: function () { state.answers[q.id] = i; state.error = null; pruneHidden(); saveDraft(); Q.render(); } })]));
      });
      return list;
    }
    if (q.tipo === "multi") {
      var sel = Array.isArray(a) ? a : [];
      var ml = el("ul", { class: "options", role: "group", "aria-labelledby": "survey-q-" + q.id });
      opts.forEach(function (o, i) {
        var on = sel.indexOf(i) !== -1;
        ml.appendChild(el("li", null, [el("button", { type: "button", class: "option option-multi", role: "checkbox", "aria-checked": on ? "true" : "false", "aria-pressed": on ? "true" : "false", text: o,
          onclick: function () {
            var cur = Array.isArray(state.answers[q.id]) ? state.answers[q.id].slice() : [];
            var k = cur.indexOf(i);
            if (k === -1) cur.push(i); else cur.splice(k, 1);
            state.answers[q.id] = cur; state.error = null; pruneHidden(); saveDraft(); Q.render();
          } })]));
      });
      return ml;
    }
    if (q.tipo === "dropdown") {
      var select = el("select", { class: "survey-select", "aria-labelledby": "survey-q-" + q.id,
        onchange: function (e) { var v = e.target.value; state.answers[q.id] = v === "" ? undefined : parseInt(v, 10); state.error = null; pruneHidden(); saveDraft(); } });
      select.appendChild(el("option", { value: "", text: t("surveySelectPlaceholder") }));
      opts.forEach(function (o, i) { var op = el("option", { value: String(i), text: o }); if (a === i) op.selected = true; select.appendChild(op); });
      return select;
    }
    /* text */
    return el("textarea", { class: "survey-text", rows: "4", maxlength: "1000", "aria-labelledby": "survey-q-" + q.id, placeholder: t("surveyTextPlaceholder"),
      oninput: function (e) { state.answers[q.id] = e.target.value; saveDraft(); }, text: typeof a === "string" ? a : "" });
  }

  /* Si una respuesta cambia y oculta preguntas condicionales, se borran sus respuestas. */
  function pruneHidden() {
    state.questions.forEach(function (q) { if (q.tipo !== "intro" && !isVisible(q)) delete state.answers[q.id]; });
  }

  function introCard() {
    var el = Q.el, t = Q.t, tc = Q.tc;
    var i = intro();
    var card = el("article", { class: "card card-today" });
    card.appendChild(el("p", { class: "eyebrow", text: t("surveyEyebrow") }));
    card.appendChild(el("h1", { text: i ? tc(i.texto) : t("surveyTitle") }));
    card.appendChild(el("p", { text: i ? tc(i.ayuda) : t("surveyLead") }));
    card.appendChild(el("ul", { class: "survey-facts" }, [
      el("li", { text: t("surveyFact1") }), el("li", { text: t("surveyFact2") }), el("li", { text: t("surveyFact3") })
    ]));
    card.appendChild(el("div", { class: "actions" }, [
      el("button", { type: "button", class: "btn btn-primary", text: api.hasDraft() ? t("surveyContinue") : t("surveyStart"), onclick: function () { api.start(); Q.render(); } })
    ]));
    return card;
  }
  function thanksCard() {
    var el = Q.el, t = Q.t;
    return el("article", { class: "card card-today" }, [
      el("p", { class: "eyebrow", text: t("surveyEyebrow") }),
      el("h1", { text: t("surveyThanksTitle") }),
      el("p", { text: t("surveyThanksBody") })
    ]);
  }
  function pendingCard() {
    var el = Q.el, t = Q.t;
    return el("article", { class: "card card-today" }, [
      el("p", { class: "eyebrow", text: t("surveyEyebrow") }),
      el("h1", { text: t("surveyPendingTitle") }),
      el("p", { text: t("surveyPendingBody") }),
      el("div", { class: "actions" }, [el("button", { type: "button", class: "btn btn-secondary", text: t("surveyRetry"), onclick: function () { sync(); } })])
    ]);
  }
  function notPublishedCard() {
    var el = Q.el, t = Q.t;
    return el("article", { class: "card card-today" }, [
      el("p", { class: "eyebrow", text: t("surveyEyebrow") }),
      el("h1", { text: t("surveyTitle") }),
      el("p", { text: t("surveyLead") }),
      el("ul", { class: "survey-facts" }, [el("li", { text: t("surveyFact1") }), el("li", { text: t("surveyFact2") }), el("li", { text: t("surveyFact3") })]),
      el("div", { class: "actions" }, [el("button", { type: "button", class: "btn btn-primary", disabled: "", text: t("surveySoonBtn") })])
    ]);
  }
})();
