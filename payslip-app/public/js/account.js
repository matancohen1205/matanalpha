/* עמוד החשבון: הרשמה/התחברות עם הצפנה בדפדפן, כספת, איפוס, והגדרות */
(function () {
  'use strict';
  var h = PS.h, V = VaultCrypto, A = PSAccount;
  var $ = function (id) { return document.getElementById(id); };
  var qs = new URLSearchParams(location.search);
  var state = { email: null, vaultKey: null, data: null, version: 0, mailAvailable: false };

  var VIEWS = ['v-guest', 'v-recovery', 'v-locked', 'v-home'];
  function show(id) { VIEWS.forEach(function (v) { $(v).hidden = v !== id; }); }
  function status(msg, err) { var b = $('acc-status'); b.textContent = msg || ''; b.className = 'status-line' + (err ? ' err' : ''); b.hidden = !msg; }
  function err(id, msg) { var e = $(id); e.textContent = msg || ''; e.hidden = !msg; }
  function busy(btn, on, label) { btn.disabled = on; if (label) btn.dataset.label = btn.dataset.label || btn.textContent, btn.textContent = on ? label : btn.dataset.label; }
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  /* ---------- טאבים ---------- */
  function guestView(v) {
    ['login', 'register', 'forgot', 'reset'].forEach(function (n) { $('f-' + n).hidden = n !== v; });
    $('t-login').setAttribute('aria-selected', String(v === 'login'));
    $('t-register').setAttribute('aria-selected', String(v === 'register'));
    document.querySelector('#v-guest .tabs').hidden = v === 'forgot' || v === 'reset';
  }
  $('t-login').addEventListener('click', function () { guestView('login'); });
  $('t-register').addEventListener('click', function () { guestView('register'); });
  $('l-forgot').addEventListener('click', function () { guestView('forgot'); });
  $('f-back').addEventListener('click', function () { guestView('login'); });

  function passHint() {
    var p = $('r-pass').value;
    $('r-hint').textContent = !p ? '' : p.length < 10 ? 'עוד ' + (10 - p.length) + ' תווים לפחות' : /^(.)\1+$/.test(p) ? 'סיסמה חלשה מדי' : 'אורך תקין. סיסמה ארוכה (ביטוי של כמה מילים) היא הבחירה הטובה ביותר.';
  }
  $('r-pass').addEventListener('input', passHint);
  function goodPassword(p) { return typeof p === 'string' && p.length >= 10 && !/^(.)\1+$/.test(p); }

  /* ---------- הרשמה ---------- */
  $('f-register').addEventListener('submit', async function (e) {
    e.preventDefault();
    err('r-err', '');
    var email = $('r-email').value.trim(), pass = $('r-pass').value;
    if (!EMAIL.test(email)) return err('r-err', 'נא להזין כתובת אימייל תקינה.');
    if (!goodPassword(pass)) return err('r-err', 'הסיסמה צריכה להכיל לפחות 10 תווים.');
    if (pass !== $('r-pass2').value) return err('r-err', 'הסיסמאות אינן זהות.');
    if (!$('r-consent').checked) return err('r-err', 'יש לאשר את מדיניות הפרטיות ותנאי השימוש.');
    var btn = $('r-go'); busy(btn, true, 'מצפינים בדפדפן…');
    try {
      var m = await V.createAccountMaterial(pass, email);
      var r = await A.api('POST', '/api/account/register', { email: email, authKey: m.authKey, wrappedPw: m.wrappedPw, wrappedRec: m.wrappedRec });
      if (!r.ok) { err('r-err', r.body.message || 'ההרשמה נכשלה.'); return; }
      A.setKey(m.vaultKey);
      state.vaultKey = m.vaultKey; state.email = email;
      $('rk-text').textContent = m.recoveryKey;
      show('v-recovery');
      status(r.body.mailSent ? 'נשלח אליכם מייל לאימות הכתובת.' : '');
    } catch (x) { err('r-err', 'אירעה שגיאה בהצפנה. נסו דפדפן עדכני.'); }
    finally { busy(btn, false); }
  });

  $('rk-ok').addEventListener('change', function () { $('rk-next').disabled = !$('rk-ok').checked; });
  $('rk-copy').addEventListener('click', function () {
    (navigator.clipboard ? navigator.clipboard.writeText($('rk-text').textContent) : Promise.reject()).then(
      function () { status('מפתח השחזור הועתק. הדביקו אותו במקום בטוח.'); },
      function () { status('ההעתקה נחסמה. סמנו את המפתח והעתיקו ידנית.', true); });
  });
  $('rk-print').addEventListener('click', function () { window.print(); });
  $('rk-next').addEventListener('click', async function () {
    try {
      var r = await A.api('PUT', '/api/account/vault', { version: 0, blob: await V.encryptJson(state.vaultKey, { v: 1, snapshots: [], rights: null }) });
      if (!r.ok && r.status !== 409) throw new Error('save');
    } catch (x) { status('לא הצלחנו ליצור את הכספת. נסו שוב.', true); return; }
    status('החשבון נוצר.');
    enterHome();
  });

  /* ---------- התחברות ---------- */
  async function doLogin(email, pass) {
    var d = await V.deriveFromPassword(pass, email);
    var r = await A.api('POST', '/api/account/login', { email: email, authKey: d.authKey });
    if (!r.ok) return r;
    A.setKey(await V.unwrapWithKey(d.wrapKey, r.body.wrappedPw));
    return r;
  }
  $('f-login').addEventListener('submit', async function (e) {
    e.preventDefault();
    err('l-err', '');
    var email = $('l-email').value.trim(), pass = $('l-pass').value;
    if (!EMAIL.test(email) || !pass) return err('l-err', 'נא להזין אימייל וסיסמה.');
    var btn = $('l-go'); busy(btn, true, 'מתחברים…');
    try {
      var r = await doLogin(email, pass);
      if (!r.ok) { err('l-err', r.body.message || 'ההתחברות נכשלה.'); return; }
      A.me(true);
      if (r.body.pro) PS.me(true);
      await bootstrap();
    } catch (x) { err('l-err', 'אירעה שגיאה. נסו שוב.'); }
    finally { busy(btn, false); }
  });

  $('f-unlock').addEventListener('submit', async function (e) {
    e.preventDefault();
    err('u-err', '');
    var btn = e.target.querySelector('button[type=submit]');
    busy(btn, true, 'פותחים…');
    try {
      var r = await doLogin(state.email, $('u-pass').value);
      if (!r.ok) { err('u-err', 'הסיסמה שגויה.'); return; }
      $('u-pass').value = '';
      enterHome();
    } catch (x) { err('u-err', 'אירעה שגיאה. נסו שוב.'); }
    finally { busy(btn, false); }
  });

  function logout() {
    A.api('POST', '/api/account/logout', {}).then(function () { A.clearKey(); A.me(true); state.data = null; show('v-guest'); guestView('login'); status('התנתקתם.'); });
  }
  $('h-logout').addEventListener('click', logout);
  $('u-logout').addEventListener('click', logout);

  /* ---------- שכחתי סיסמה ואיפוס ---------- */
  $('f-forgot').addEventListener('submit', async function (e) {
    e.preventDefault();
    var email = $('f-email').value.trim();
    if (!EMAIL.test(email)) { $('f-msg').textContent = 'נא להזין כתובת אימייל תקינה.'; return; }
    var r = await A.api('POST', '/api/account/forgot', { email: email });
    $('f-msg').textContent = r.body.message || 'שגיאה.';
  });

  var resetToken = qs.get('reset'), resetInfo = null;
  $('f-reset').addEventListener('submit', async function (e) {
    e.preventDefault();
    err('x-err', '');
    var pass = $('x-pass').value;
    if (!goodPassword(pass)) return err('x-err', 'הסיסמה החדשה צריכה להכיל לפחות 10 תווים.');
    try {
      var vk = await V.unwrapWithRecovery($('x-key').value, resetInfo.wrappedRec);
      var rw = await V.rewrapForNewPassword(pass, resetInfo.email, vk);
      var r = await A.api('POST', '/api/account/reset', { token: resetToken, authKey: rw.authKey, wrappedPw: rw.wrappedPw });
      if (!r.ok) return err('x-err', r.body.message || 'האיפוס נכשל.');
      history.replaceState(null, '', '/account.html');
      guestView('login');
      status('הסיסמה אופסה והנתונים נשמרו. אפשר להתחבר עם הסיסמה החדשה.');
    } catch (x) { err('x-err', 'מפתח השחזור שגוי.'); }
  });

  /* ---------- דף הבית של החשבון ---------- */
  function fmtDate(iso) { try { return new Date(iso).toLocaleDateString('he-IL'); } catch (e) { return ''; } }

  function renderHistory() {
    var list = $('h-list'), snaps = state.data.snapshots.slice().sort(function (a, b) { return String(a.period).split('/').reverse().join('').localeCompare(String(b.period).split('/').reverse().join('')); });
    list.replaceChildren();
    $('h-empty').hidden = snaps.length > 0;
    $('max-snap').textContent = A.MAX_SNAPSHOTS;
    snaps.forEach(function (s) {
      var gross = (s.items.find(function (i) { return i.id === 'gross'; }) || {}).amount;
      var net = (s.items.find(function (i) { return i.id === 'net'; }) || {}).amount;
      var cb = h('input', { type: 'checkbox', 'data-id': s.id, 'aria-label': 'בחירת ' + s.label + ' להשוואה' });
      cb.addEventListener('change', updateCompareBtn);
      list.append(h('li', {}, [cb, h('strong', { text: s.label }), h('span', { class: 'meta', text: 'ברוטו ' + PS.money(gross) + ' · נטו ' + PS.money(net) + ' · נשמר ' + fmtDate(s.savedAt) }),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'מחיקה', 'aria-label': 'מחיקת ' + s.label, onclick: function () { removeSnapshot(s.id); } })]));
    });
    updateCompareBtn();
  }
  function updateCompareBtn() { $('h-compare').disabled = document.querySelectorAll('#h-list input:checked').length < 2; }

  async function removeSnapshot(id) {
    try {
      state.data = await A.updateVault(function (d) { d.snapshots = d.snapshots.filter(function (s) { return s.id !== id; }); });
      renderHistory();
    } catch (x) { $('h-note').textContent = 'המחיקה נכשלה. נסו לרענן.'; }
  }

  $('h-compare').addEventListener('click', function () {
    var ids = Array.prototype.map.call(document.querySelectorAll('#h-list input:checked'), function (c) { return c.dataset.id; });
    var chosen = state.data.snapshots.filter(function (s) { return ids.indexOf(s.id) >= 0; });
    try { sessionStorage.setItem('ps-compare-preload', JSON.stringify(chosen.map(function (s) { return { label: s.label, items: s.items }; }))); } catch (e) {}
    location.href = '/compare.html';
  });

  $('h-export').addEventListener('click', function () {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json' }));
    a.download = 'tlush-vault-export.json';
    document.body.append(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    $('h-note').textContent = 'הקובץ מכיל את הנתונים שלכם בטקסט גלוי. שמרו אותו בזהירות.';
  });

  function renderSub(me) {
    var box = document.querySelector('#s-sub-text'); var actions = box.nextElementSibling;
    actions.replaceChildren();
    if (me.subscriptionLinked) {
      box.textContent = 'המנוי מקושר לחשבון. בכל התחברות Pro יופעל אוטומטית, גם במכשיר חדש.';
      actions.append(h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'ניתוק המנוי מהחשבון', onclick: function () { A.api('POST', '/api/account/unlink-subscription', {}).then(function () { refreshMe(); }); } }));
    } else {
      box.textContent = 'אם יש לכם מנוי Pro פעיל במכשיר הזה, אפשר לקשר אותו לחשבון כדי לשחזר אותו בקלות בכל מכשיר.';
      actions.append(h('button', { class: 'btn btn-sm', type: 'button', text: 'קישור המנוי לחשבון', onclick: function () {
        A.api('POST', '/api/account/link-subscription', {}).then(function (r) { if (r.ok) refreshMe(); else status(r.body.message || 'הקישור נכשל.', true); });
      } }));
    }
  }

  async function refreshMe() {
    var me = await A.me(true);
    $('h-email').textContent = me.email;
    var v = $('h-verified'); v.replaceChildren();
    if (me.verified) v.textContent = 'האימייל אומת ✓';
    else {
      v.append(document.createTextNode('האימייל עוד לא אומת. '));
      if (me.mailAvailable) v.append(h('button', { class: 'link-btn', type: 'button', text: 'שליחת מייל אימות שוב', onclick: function () { A.api('POST', '/api/account/resend-verification', {}).then(function (r) { status(r.body.message || 'נשלח.'); }); } }));
    }
    renderSub(me);
  }

  async function enterHome() {
    try {
      var cur = await A.loadVault();
      state.data = cur.data; state.version = cur.version;
    } catch (x) {
      if (String(x.message) === 'LOCKED') { show('v-locked'); return; }
      status('לא הצלחנו לפתוח את הכספת. אם החלפתם סיסמה במכשיר אחר, התחברו מחדש.', true);
      show('v-locked'); return;
    }
    show('v-home');
    renderHistory();
    refreshMe();
  }

  $('f-change').addEventListener('submit', async function (e) {
    e.preventDefault();
    var msg = $('c-msg'); msg.textContent = '';
    var oldP = $('c-old').value, newP = $('c-new').value;
    if (!goodPassword(newP)) { msg.textContent = 'הסיסמה החדשה צריכה להכיל לפחות 10 תווים.'; return; }
    try {
      var old = await V.deriveFromPassword(oldP, state.email);
      var rw = await V.rewrapForNewPassword(newP, state.email, A.getKey());
      var r = await A.api('POST', '/api/account/change-password', { oldAuthKey: old.authKey, authKey: rw.authKey, wrappedPw: rw.wrappedPw });
      msg.textContent = r.ok ? 'הסיסמה שונתה. מכשירים אחרים נותקו.' : (r.body.message || 'השינוי נכשל.');
      if (r.ok) { $('c-old').value = ''; $('c-new').value = ''; }
    } catch (x) { msg.textContent = 'אירעה שגיאה.'; }
  });

  $('f-delete').addEventListener('submit', async function (e) {
    e.preventDefault();
    var msg = $('d-msg'); msg.textContent = '';
    try {
      var d = await V.deriveFromPassword($('d-pass').value, state.email);
      var r = await A.api('POST', '/api/account/delete', { authKey: d.authKey });
      if (!r.ok) { msg.textContent = r.body.message || 'המחיקה נכשלה.'; return; }
      A.clearKey(); A.me(true); state.data = null;
      show('v-guest'); guestView('register'); status('החשבון וכל הנתונים נמחקו.');
    } catch (x) { msg.textContent = 'אירעה שגיאה.'; }
  });

  /* ---------- אתחול ---------- */
  async function bootstrap() {
    var me = await A.me(true);
    state.mailAvailable = !!me.mailAvailable;
    if (!me.loggedIn) { show('v-guest'); guestView('login'); return; }
    state.email = me.email;
    if (!A.getKey()) { show('v-locked'); return; }
    enterHome();
  }

  (async function init() {
    if (qs.get('verify')) {
      var r = await A.api('POST', '/api/account/verify', { token: qs.get('verify') });
      history.replaceState(null, '', '/account.html');
      status(r.ok ? 'האימייל אומת. תודה!' : (r.body.message || 'האימות נכשל.'), !r.ok);
    }
    if (resetToken) {
      var info = await A.api('POST', '/api/account/reset-info', { token: resetToken });
      if (info.ok) { resetInfo = info.body; show('v-guest'); guestView('reset'); return; }
      status(info.body.message || 'הקישור אינו תקף.', true);
    }
    bootstrap();
  })();
})();
