/* עוזר האתר: כשמוגדר מפתח בשרת, השיחה מנוהלת על ידי סוכן בינה מלאכותית (/api/agent/chat) עם זיכרון שיחה.
   אחרת, או בכשל, פועל עוזר מבוסס כללים (ChatKB) בדפדפן בלבד. */
(function () {
  'use strict';
  if (!window.ChatKB || !window.PS) return;
  var KB = window.ChatKB, h = PS.h;
  var KEY = 'ps-chat-log';
  var log = [];
  var fails = 0;
  var glossary = null;
  var config = null;
  var opened = false;
  var agentOn = false;
  var convLang = null; // שפת השיחה: נקבעת לפי ההודעה האחרונה של המשתמש, ולא לפי שפת האתר
  var waiting = false;

  var ss = PS.store('session');
  try { log = JSON.parse(ss.get(KEY) || '[]'); } catch (e) { log = []; }

  /* ---------- מבנה ---------- */
  var fab = h('button', { class: 'chat-fab', type: 'button', id: 'chat-fab', 'aria-label': 'פתיחת צ\'אט עזרה', 'aria-expanded': 'false', 'aria-controls': 'chat-panel', dir: 'rtl' });
  fab.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M8 10h8M8 13h5"/></svg>';
  var hint = h('div', { class: 'chat-hint', hidden: 'hidden', dir: 'rtl', text: 'צריכים עזרה? אני כאן 👋' });

  var list = h('div', { class: 'chat-log', role: 'log', 'aria-live': 'polite', 'aria-label': 'שיחה עם עוזר האתר', tabindex: '0' });
  var input = h('input', { type: 'text', id: 'chat-input', placeholder: 'כתבו שאלה…', 'aria-label': 'הודעה לעוזר', maxlength: '300', autocomplete: 'off' });
  var send = h('button', { class: 'chat-send', type: 'submit', 'aria-label': 'שליחה', text: '←' });
  var form = h('form', { class: 'chat-form' }, [input, send]);
  var human = h('a', { class: 'chat-human', href: KB.URL.contact, text: '💬 שירות לקוחות' });
  var closeBtn = h('button', { class: 'icon-btn chat-x', type: 'button', 'aria-label': 'סגירת הצ\'אט', text: '✕' });
  var panel = h('section', { class: 'chat-panel', id: 'chat-panel', role: 'dialog', 'aria-label': 'עוזר האתר', dir: 'rtl', lang: 'he', hidden: 'hidden' }, [
    h('header', { role: 'group' }, [h('div', {}, [h('strong', { text: 'עוזר האתר' }), h('small', { text: 'עונה על שאלות שימוש. לא מחליף ייעוץ מקצועי.' })]), closeBtn]),
    list, h('div', {}, [h('p', { class: 'chat-ai-note muted small', id: 'chat-ai-note', hidden: 'hidden', text: 'העוזר פועל בבינה מלאכותית. ההודעות נשלחות לספק AI לצורך מענה ואינן נשמרות אצלנו. אל תכתבו פרטים אישיים.' }), form]), h('footer', { role: 'group' }, [human, h('a', { href: KB.URL.privacy, text: 'פרטיות' })]),
  ]);
  document.body.append(panel, fab, hint);

  /* ---------- הודעות ---------- */
  function save() { ss.set(KEY, JSON.stringify(log.slice(-30))); }

  function actionEl(a) {
    if (a.fn) {
      return h('button', { class: 'chat-act', type: 'button', text: a.label, onclick: function () { runFn(a.fn); } });
    }
    if (a.ask) { // הצעת המשך מהסוכן: כבר בשפת המשתמש, נשלחת כמות שהיא
      return h('button', { class: 'chat-quick', type: 'button', text: a.label, onclick: function () { ask(a.ask, true); } });
    }
    if (a.say) {
      return h('button', { class: 'chat-quick', type: 'button', text: a.label, onclick: function () { ask(a.say, true, { shown: a.label, lang: a.lang }); } });
    }
    var ext = /^https?:/.test(a.href);
    var el = h('a', { class: 'chat-act', href: a.href, text: a.label });
    if (ext) { el.target = '_blank'; el.rel = 'noopener'; }
    if (!ext) el.addEventListener('click', function () { setTimeout(close, 0); });
    return el;
  }

  function render(msg, instant) {
    var bubble = h('div', { class: 'chat-msg ' + msg.from }, [h('p', { text: msg.text })]);
    if (msg.lang) { // הבועה כבר בשפת השיחה: לא לתרגם שוב לפי שפת האתר
      bubble.setAttribute('lang', msg.lang); bubble.setAttribute('dir', window.PSI18n ? PSI18n.dir(msg.lang) : 'rtl'); bubble.setAttribute('data-no-i18n', '');
    } else if (msg.from === 'me') { bubble.setAttribute('dir', 'auto'); bubble.setAttribute('data-no-i18n', ''); }
    if (msg.actions && msg.actions.length) {
      bubble.append(h('div', { class: 'chat-actions' }, msg.actions.map(actionEl)));
    }
    list.append(bubble);
    list.scrollTop = list.scrollHeight;
    return bubble;
  }

  function say(msg, delay) {
    log.push(msg); save();
    if (!delay) return render(msg);
    var dots = h('div', { class: 'chat-msg bot typing', 'aria-hidden': 'true' }, [h('span'), h('span'), h('span')]);
    list.append(dots); list.scrollTop = list.scrollHeight;
    setTimeout(function () { dots.remove(); render(msg); }, delay);
  }

  function runFn(fn) {
    if (fn === 'a11y') { close(); var f = document.getElementById('a11y-fab'); if (f) f.click(); }
    if (fn === 'theme') { var t = document.getElementById('theme-toggle'); if (t) t.click(); }
  }

  /* ---------- נתונים ---------- */
  function ensureData() {
    var jobs = [];
    if (!glossary) jobs.push(fetch('/api/glossary').then(function (r) { return r.json(); }).then(function (g) { glossary = g; }).catch(function () { glossary = []; }));
    if (!config) jobs.push(fetch('/api/site-config').then(function (r) { return r.json(); }).then(function (c) { config = c; }).catch(function () { config = {}; }));
    return Promise.all(jobs);
  }

  function contactLines() {
    var acts = [KB.CONTACT];
    var lines = [];
    if (config && config.supportWhatsapp) acts.push({ label: 'וואטסאפ שירות לקוחות', href: 'https://wa.me/' + config.supportWhatsapp });
    if (config && config.supportEmail) lines.push('אפשר גם במייל: ' + config.supportEmail);
    if (config && config.supportHours) lines.push('שעות מענה: ' + config.supportHours);
    return { acts: acts, text: lines.join('\n') };
  }

  /* ---------- שיחה ---------- */
  /* ---------- שפת השיחה: התשובה תמיד בשפה שבה המשתמש כתב ---------- */
  function loc(text, lang) {
    if (!lang || lang === 'he' || !window.PSI18n) return Promise.resolve(text);
    return PSI18n.translateTo(text, lang);
  }
  function locLines(text, lang) {
    return Promise.all(String(text).split('\n').map(function (l) { return l.trim() ? loc(l, lang) : Promise.resolve(''); })).then(function (a) { return a.join('\n'); });
  }
  function localize(reply, lang) {
    if (!lang) return Promise.resolve(reply);
    var jobs = [reply.noText ? Promise.resolve(reply.text) : locLines(reply.text, lang)]
      .concat((reply.actions || []).map(function (a) { return a.ask || lang === 'he' ? Promise.resolve(a.label) : loc(a.label, lang); }));
    return Promise.all(jobs).then(function (r) {
      var out = { from: reply.from, text: r[0], lang: lang, actions: (reply.actions || []).map(function (a, i) { var c = {}; Object.keys(a).forEach(function (k) { c[k] = a[k]; }); c.label = r[i + 1]; if (a.say) c.lang = lang; return c; }) };
      return out;
    });
  }

  function agentMessages() {
    return log.filter(function (m) { return (m.from === 'me' || m.from === 'bot') && m.text; })
      .map(function (m) { return { role: m.from === 'me' ? 'user' : 'assistant', content: m.text }; });
  }

  function askAgent(text) {
    waiting = true; send.disabled = true;
    var dots = h('div', { class: 'chat-msg bot typing', 'aria-hidden': 'true' }, [h('span'), h('span'), h('span')]);
    list.append(dots); list.scrollTop = list.scrollHeight;
    var done = function () { waiting = false; send.disabled = false; dots.remove(); input.focus(); };
    return fetch('/api/agent/chat', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: agentMessages(), lang: convLang || (window.PSI18n && PSI18n.lang()) || 'he', page: location.pathname }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, body: j }; }); })
      .then(function (r) {
        done();
        if (r.ok && r.body.ok) {
          var lg = convLang || (window.PSI18n && PSI18n.lang()) || 'he';
          var follow = (r.body.suggestions || []).map(function (q) { return { label: q, ask: q }; });
          localize({ from: 'bot', text: r.body.text, noText: true, actions: r.body.actions || [] }, lg).then(function (m) { m.actions = (m.actions || []).concat(follow); say(m); });
          return true;
        }
        if (r.status === 429) { localize({ from: 'bot', text: r.body.message || 'נשלחו הרבה הודעות. נסו שוב בעוד כמה דקות.', actions: [KB.CONTACT] }, convLang).then(function (m) { say(m); }); return true; }
        return false;
      })
      .catch(function () { done(); return false; });
  }

  function ask(text, fromQuick, opts) {
    text = String(text || '').trim();
    if (!text || waiting) return;
    opts = opts || {};
    var det = opts.lang || (window.PSI18n && PSI18n.detect(opts.shown || text));
    if (det) convLang = det;
    say({ from: 'me', text: opts.shown || text });
    if (agentOn) {
      askAgent(text).then(function (handled) { if (!handled) answerWithKB(text, fromQuick); });
      return;
    }
    answerWithKB(text, fromQuick);
  }

  function answerWithKB(text, fromQuick) {
    var lg0 = convLang || (window.PSI18n && PSI18n.lang()) || 'he';
    // מונחי מילון בשפת השיחה: משווים מול השמות המתורגמים של המונחים, ולא רק מול העברית
    var glossFor = function () {
      if (lg0 === 'he' || !window.PSI18n) return Promise.resolve(glossary);
      return Promise.all((glossary || []).map(function (g) { return PSI18n.translateTo(g.title, lg0); })).then(function (titles) {
        return (glossary || []).map(function (g, i) { return { title: titles[i], what: g.what, why: g.why, _src: g }; }).concat(glossary || []);
      });
    };
    ensureData().then(function () { return Promise.all([PS.me(), glossFor()]); }).then(function (res) {
      var me = res[0];
      var r = KB.match(text, res[1]);
      if (r.type === 'glossary' && r.entry._src) r.entry = r.entry._src;
      var reply;
      if (r.type === 'glossary') {
        fails = 0;
        var e = r.entry;
        reply = { from: 'bot', compose: { title: e.title, what: e.what, why: e.why }, text: '', actions: [{ label: 'כל המילון', href: KB.URL.glossary }, { label: 'העלאת תלוש', href: KB.URL.upload }] };
      } else if (r.type === 'kb') {
        fails = 0;
        var it = r.intent;
        var t = it.answer;
        var actions = (it.actions || []).slice();
        if (it.price && me && me.priceLabel) t += '\nמחיר: ' + me.priceLabel + '.';
        if (it.contact) { var c = contactLines(); if (c.text) t += '\n' + c.text; actions = c.acts; }
        if (it.id === 'hello') actions = KB.QUICK.map(function (q) { return { label: q.label, say: q.say }; });
        reply = { from: 'bot', text: t, actions: actions };
      } else {
        fails++;
        var more = fails >= 2;
        reply = {
          from: 'bot',
          text: more ? 'נראה שלא הצלחתי לעזור. הכי טוב לפנות לשירות לקוחות, ונחזור אליכם.' : 'לא בטוח שהבנתי. אפשר לנסות לנסח אחרת, לבחור נושא או לכתוב שם של מונח בתלוש.',
          actions: more ? [KB.CONTACT] : KB.QUICK.map(function (q) { return { label: q.label, say: q.say }; }),
        };
      }
      var lg = convLang || (window.PSI18n && PSI18n.lang()) || 'he';
      var done = function (m) { say(m, fromQuick ? 250 : 450); };
      if (reply.compose) { // תשובת מילון: כל חלק מתורגם בנפרד
        var cp = reply.compose;
        Promise.all([loc(cp.title, lg), loc('מה זה?', lg), loc(cp.what, lg), loc('למה זה בתלוש?', lg), loc(cp.why, lg)]).then(function (x) {
          reply.text = x[0] + '\n' + x[1] + ' ' + x[2] + '\n' + x[3] + ' ' + x[4]; reply.noText = true;
          localize(reply, lg).then(done);
        });
      } else localize(reply, lg).then(done);
    });
  }

  function welcome() {
    say({
      from: 'bot',
      text: 'שלום! אני העוזר של "תלוש בעברית". אפשר לשאול אותי איך משתמשים באתר, מה זה סעיף בתלוש, או לפנות לשירות לקוחות.',
      actions: KB.QUICK.map(function (q) { return { label: q.label, say: q.say }; }),
    });
  }

  /* ---------- פתיחה וסגירה ---------- */
  function open() {
    if (opened) return;
    opened = true;
    panel.hidden = false; hint.hidden = true;
    fab.setAttribute('aria-expanded', 'true');
    if (!list.children.length) {
      if (log.length) log.forEach(render); else welcome();
    }
    ensureData();
    fetch('/api/agent/status').then(function (r) { return r.json(); }).then(function (j) {
      agentOn = !!j.enabled;
      document.getElementById('chat-ai-note').hidden = !agentOn;
    }).catch(function () {});
    setTimeout(function () { input.focus(); }, 50);
  }
  function close() {
    if (!opened) return;
    opened = false;
    panel.hidden = true;
    fab.setAttribute('aria-expanded', 'false');
    fab.focus();
  }
  fab.addEventListener('click', function () { if (opened) close(); else open(); });
  closeBtn.addEventListener('click', close);
  panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var v = input.value;
    input.value = '';
    ask(v, false);
  });

  /* רמז עדין אחרי כמה שניות, פעם אחת בסשן */
  if (!ss.get('ps-chat-hint') && !log.length) {
    setTimeout(function () {
      if (opened) return;
      hint.hidden = false;
      ss.set('ps-chat-hint', '1');
      setTimeout(function () { hint.hidden = true; }, 7000);
    }, 9000);
  }
})();
