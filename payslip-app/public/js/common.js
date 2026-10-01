/* מצב כהה/בהיר + תפריט נגישות. משותף לכל הדפים */
(function () {
  'use strict';
  var root = document.documentElement;
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} },
  };

  /* ---------- ערכת נושא ---------- */
  var themeBtn = document.getElementById('theme-toggle');
  function setTheme(t) {
    root.setAttribute('data-theme', t);
    store.set('ps-theme', t);
    if (themeBtn) {
      themeBtn.setAttribute('aria-pressed', String(t === 'dark'));
      themeBtn.setAttribute('aria-label', t === 'dark' ? 'מעבר למצב בהיר' : 'מעבר למצב כהה');
    }
  }
  if (themeBtn) {
    setTheme(root.getAttribute('data-theme') || 'light');
    themeBtn.addEventListener('click', function () {
      setTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });
  }

  document.querySelectorAll('.nav-link').forEach(function (a) {
    var path = location.pathname.replace(/\/index\.html$/, '/');
    var href = a.getAttribute('href');
    if (href === path || (href !== '/' && path === href.replace('.html', ''))) a.setAttribute('aria-current', 'page');
  });

  /* ---------- נגישות ---------- */
  var state = {};
  try { state = JSON.parse(store.get('ps-a11y') || '{}') || {}; } catch (e) { state = {}; }
  var SCALES = [1, 1.125, 1.25, 1.5];

  function apply() {
    root.style.setProperty('--fs-scale', state.scale || 1);
    ['contrast', 'links', 'font', 'spacing', 'motion', 'cursor', 'gray', 'headings'].forEach(function (k) {
      if (state[k]) root.setAttribute('data-a11y-' + k, state[k]);
      else root.removeAttribute('data-a11y-' + k);
    });
    store.set('ps-a11y', JSON.stringify(state));
    panel.querySelectorAll('[data-a11y]').forEach(function (b) {
      var k = b.getAttribute('data-a11y');
      b.setAttribute('aria-pressed', String(!!state[k] && state[k] === b.getAttribute('data-value')));
    });
    var lvl = panel.querySelector('#a11y-size-level');
    lvl.textContent = Math.round((state.scale || 1) * 100) + '%';
  }

  var OPTIONS = [
    { k: 'contrast', v: 'high', ico: '◐', t: 'ניגודיות גבוהה' },
    { k: 'gray', v: 'on', ico: '◑', t: 'גווני אפור' },
    { k: 'links', v: 'on', ico: '🔗', t: 'הדגשת קישורים' },
    { k: 'headings', v: 'on', ico: 'H', t: 'הדגשת כותרות' },
    { k: 'font', v: 'readable', ico: 'Aa', t: 'גופן קריא' },
    { k: 'spacing', v: 'on', ico: '↕', t: 'ריווח טקסט' },
    { k: 'motion', v: 'off', ico: '⏸', t: 'עצירת אנימציות' },
    { k: 'cursor', v: 'big', ico: '⬉', t: 'סמן גדול' },
  ];

  var fab = document.createElement('button');
  fab.className = 'a11y-fab';
  fab.type = 'button';
  fab.id = 'a11y-fab';
  fab.setAttribute('aria-label', 'פתיחת תפריט נגישות');
  fab.setAttribute('aria-expanded', 'false');
  fab.setAttribute('aria-controls', 'a11y-panel');
  fab.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="4.2" r="2.2"/><path d="M5 8.2c0-.7.6-1.2 1.2-1.1l5.8.9 5.8-.9c.7-.1 1.2.4 1.2 1.1 0 .6-.4 1.1-1 1.2L14 10.4v3.1l2.2 6.2c.2.7-.1 1.4-.8 1.6-.6.2-1.3-.1-1.5-.8L12 15.9l-1.9 4.6c-.2.6-.9 1-1.5.8-.7-.2-1-.9-.8-1.6L10 13.5v-3.1l-4-1c-.6-.1-1-.6-1-1.2z"/></svg>';

  var panel = document.createElement('div');
  panel.className = 'a11y-panel';
  panel.id = 'a11y-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'תפריט נגישות');
  panel.hidden = true;

  var head = document.createElement('header');
  var h = document.createElement('h2');
  h.textContent = 'נגישות';
  var close = document.createElement('button');
  close.className = 'icon-btn';
  close.type = 'button';
  close.setAttribute('aria-label', 'סגירת תפריט נגישות');
  close.textContent = '✕';
  head.append(h, close);

  var sizeRow = document.createElement('div');
  sizeRow.className = 'a11y-grid';
  sizeRow.style.marginBottom = '0.5rem';
  function mkBtn(label, cls) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = cls || 'a11y-opt';
    b.textContent = label;
    return b;
  }
  var minus = mkBtn('א− הקטנת טקסט');
  var plus = mkBtn('א+ הגדלת טקסט');
  sizeRow.append(minus, plus);
  var lvlWrap = document.createElement('p');
  lvlWrap.className = 'muted';
  lvlWrap.style.margin = '0 0 0.6rem';
  lvlWrap.innerHTML = 'גודל טקסט: <strong id="a11y-size-level">100%</strong>';

  var grid = document.createElement('div');
  grid.className = 'a11y-grid';
  OPTIONS.forEach(function (o) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'a11y-opt';
    b.setAttribute('data-a11y', o.k);
    b.setAttribute('data-value', o.v);
    b.setAttribute('aria-pressed', 'false');
    var i = document.createElement('span');
    i.className = 'ico';
    i.setAttribute('aria-hidden', 'true');
    i.textContent = o.ico;
    var t = document.createElement('span');
    t.textContent = o.t;
    b.append(i, t);
    b.addEventListener('click', function () {
      if (state[o.k] === o.v) delete state[o.k]; else state[o.k] = o.v;
      apply();
    });
    grid.appendChild(b);
  });

  var foot = document.createElement('footer');
  var reset = mkBtn('איפוס הגדרות', 'btn btn-ghost btn-sm');
  var statement = document.createElement('a');
  statement.href = '/accessibility.html';
  statement.className = 'btn btn-ghost btn-sm';
  statement.textContent = 'הצהרת נגישות';
  foot.append(reset, statement);

  panel.append(head, sizeRow, lvlWrap, grid, foot);
  panel.setAttribute('dir', 'rtl');
  panel.setAttribute('lang', 'he');
  fab.setAttribute('dir', 'rtl');
  document.body.append(fab, panel);

  function step(dir) {
    var i = SCALES.indexOf(state.scale || 1);
    if (i < 0) i = 0;
    i = Math.max(0, Math.min(SCALES.length - 1, i + dir));
    if (SCALES[i] === 1) delete state.scale; else state.scale = SCALES[i];
    apply();
  }
  minus.addEventListener('click', function () { step(-1); });
  plus.addEventListener('click', function () { step(1); });
  reset.addEventListener('click', function () { state = {}; store.del('ps-a11y'); apply(); });

  function toggle(open) {
    panel.hidden = !open;
    fab.setAttribute('aria-expanded', String(open));
    if (open) close.focus(); else fab.focus();
  }
  fab.addEventListener('click', function () { toggle(panel.hidden); });
  close.addEventListener('click', function () { toggle(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !panel.hidden) toggle(false);
  });

  apply();
})();
