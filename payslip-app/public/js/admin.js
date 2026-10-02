/* ממשק ניהול פניות (בעל האתר בלבד). כל הטקסט מוצג כ-textContent ולכן תוכן פנייה לא יכול להריץ קוד. */
(function () {
  'use strict';
  var h = PS.h;
  var $ = function (id) { return document.getElementById(id); };
  var state = { filter: 'new', tickets: [], topics: {} };

  function status(msg, err) { var b = $('ad-status'); b.textContent = msg || ''; b.className = 'status-line' + (err ? ' err' : ''); b.hidden = !msg; }
  function api(method, url, body) {
    return fetch(url, { method: method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, body: j }; }); });
  }
  function show(login) { $('ad-login').hidden = !login; $('ad-main').hidden = login; }

  function render() {
    var list = $('ad-list');
    list.replaceChildren();
    var n = { new: 0, closed: 0 };
    state.tickets.forEach(function (t) { n[t.status === 'closed' ? 'closed' : 'new']++; });
    $('ad-n-new').textContent = '(' + n.new + ')';
    $('ad-n-closed').textContent = '(' + n.closed + ')';
    document.querySelectorAll('.chip[data-f]').forEach(function (c) { c.setAttribute('aria-pressed', String(c.dataset.f === state.filter)); });
    var shown = state.tickets.filter(function (t) { return state.filter === 'all' || (state.filter === 'closed') === (t.status === 'closed'); });
    $('ad-empty').hidden = shown.length > 0;
    shown.forEach(function (t) {
      var closed = t.status === 'closed';
      var when = new Date(t.createdAt).toLocaleString('he-IL');
      list.append(h('li', { class: 'ad-ticket' + (closed ? ' done' : '') }, [
        h('div', { class: 'ad-head' }, [
          h('strong', { text: 'T-' + String(t.id).padStart(4, '0') }),
          h('span', { class: 'badge info', text: state.topics[t.topic] || t.topic || '' }),
          h('span', { class: 'muted small', text: when }),
        ]),
        h('div', { class: 'ad-who' }, [
          h('span', { text: t.name || '' }),
          /^[\w.+-]+@[\w.-]+\.\w{2,}$/.test(t.email || '') ? h('a', { href: 'mailto:' + t.email, text: t.email, dir: 'ltr' }) : h('span', { dir: 'ltr', text: t.email || '' }),
          t.phone ? h('span', { dir: 'ltr', text: t.phone }) : null,
        ]),
        h('p', { class: 'ad-msg', text: t.message || '' }),
        h('div', { class: 'form-actions' }, [
          h('button', { class: 'btn btn-sm' + (closed ? ' btn-ghost' : ''), type: 'button', text: closed ? 'החזרה לחדשות' : 'סימון כטופל', onclick: function () { setStatus(t.id, closed ? 'new' : 'closed'); } }),
        ]),
      ]));
    });
  }

  function load() {
    return api('GET', '/api/admin/tickets').then(function (r) {
      if (r.status === 401) { show(true); return; }
      if (!r.ok) { status('לא ניתן לטעון פניות.', true); return; }
      status('');
      state.tickets = r.body.tickets || [];
      show(false);
      render();
    });
  }
  function setStatus(id, st) {
    api('POST', '/api/admin/tickets/' + id + '/status', { status: st }).then(function (r) {
      if (!r.ok) { status('העדכון נכשל.', true); return; }
      state.tickets.forEach(function (t) { if (t.id === id) t.status = st; });
      render();
    });
  }

  $('ad-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('ad-err'); err.hidden = true;
    api('POST', '/api/admin/login', { password: $('ad-pass').value }).then(function (r) {
      if (!r.ok) { err.textContent = r.body.message || 'הכניסה נכשלה.'; err.hidden = false; return; }
      $('ad-pass').value = '';
      load();
    });
  });
  $('ad-logout').addEventListener('click', function () { api('POST', '/api/admin/logout', {}).then(function () { state.tickets = []; show(true); }); });
  $('ad-refresh').addEventListener('click', load);
  document.querySelectorAll('.chip[data-f]').forEach(function (c) { c.addEventListener('click', function () { state.filter = c.dataset.f; render(); }); });

  api('GET', '/api/admin/me').then(function (r) {
    if (r.status === 404) { status('אזור הניהול אינו מופעל.', true); show(true); $('ad-login').hidden = true; return; }
    fetch('/api/site-config').then(function (x) { return x.json(); }).then(function (c) { state.topics = c.topics || {}; }).catch(function () {}).then(function () {
      if (r.body.loggedIn) load(); else show(true);
    });
  });
})();
