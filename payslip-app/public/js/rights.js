/* עמוד זכויות ותזכורות */
(function () {
  'use strict';
  var h = PS.h, R = RightsCore;
  var $ = function (id) { return document.getElementById(id); };
  var saved = PS.store('local');
  var current = null, catalog = [];

  var today = new Date().toISOString().slice(0, 10);
  $('r-start').max = today;
  $('r-start').min = String(Number(today.slice(0, 4)) - 60) + today.slice(4);
  var LOCALES = { he: 'he-IL', en: 'en-GB', ru: 'ru-RU', ar: 'ar' };
  // מציגים את התאריך בנוסח מילולי כדי שהמשתמש יראה איך הוא פוענח (סדר יום/חודש משתנה בין מכשירים)
  function echoDate(v) {
    var el = $('r-echo');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) { el.textContent = ''; return; }
    var lang = (window.PSI18n && PSI18n.lang()) || 'he';
    var d = new Date(v + 'T12:00:00');
    if (isNaN(d)) { el.textContent = ''; return; }
    var label = window.PSI18n ? PSI18n.t('התאריך שהוזן') : 'התאריך שהוזן';
    el.textContent = label + ': ' + d.toLocaleDateString(LOCALES[lang] || 'he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  var prev = saved.get('ps-rights-start');
  if (prev && /^\d{4}-\d{2}-\d{2}$/.test(prev)) { $('r-start').value = prev; $('r-start-text').value = prev.split('-').reverse().join('/'); }
  $('r-rate').value = saved.get('ps-rights-rate') || R.RIGHTS_DATA.recuperationRate;

  /* ---------- הזנת תאריך: שדה טקסט dd/mm/yyyy (עובד בכל מכשיר ודפדפן) + לוח שנה אופציונלי ---------- */
  var txt = $('r-start-text'), nat = $('r-start');
  function isoToText(v) { return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split('-').reverse().join('/') : ''; }
  function parseText(t) {
    var m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/.exec(t);
    if (!m) return null;
    var d = +m[1], mo = +m[2], y = +m[3], dt = new Date(Date.UTC(y, mo - 1, d));
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? y + '-' + pad(mo) + '-' + pad(d) : null;
  }
  function formatDigits(raw) {
    var dg = raw.replace(/\D/g, '').slice(0, 8);
    return dg.length > 4 ? dg.slice(0, 2) + '/' + dg.slice(2, 4) + '/' + dg.slice(4) : dg.length > 2 ? dg.slice(0, 2) + '/' + dg.slice(2) : dg;
  }
  function syncFromText() {
    var v = txt.value;
    if (!/^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4}$/.test(v)) { nat.value = ''; render(); return; }
    var iso = parseText(v);
    if (!iso) { nat.value = ''; render(); $('r-err').textContent = 'תאריך לא תקין. הזינו יום/חודש/שנה, למשל 15/03/2019.'; return; }
    nat.value = iso; // ערך מחוץ לטווח min/max מתקבל כאן, והחישוב מציג הודעת שגיאה מתאימה
    render();
  }
  txt.addEventListener('input', function () {
    // ספרות בלבד: מוסיפים לוכסנים אוטומטית. מפרידים שהוקלדו ידנית (למשל 1/1/2099) נשמרים כמות שהם.
    var clean = txt.value.replace(/[^\d\/.-]/g, '').slice(0, 10);
    var parts = clean.split(/[\/.-]/);
    var userStyle = parts.length >= 3 || (parts.length === 2 && parts[1].length <= 2);
    txt.value = userStyle ? clean : formatDigits(clean);
    syncFromText();
  });
  nat.addEventListener('change', function () { txt.value = isoToText(nat.value); render(); });
  $('r-pick').addEventListener('click', function () {
    try { if (nat.showPicker) { nat.showPicker(); return; } } catch (e) { /* ממשיכים לחלופה */ }
    nat.setAttribute('aria-hidden', 'false'); nat.tabIndex = 0; nat.focus();
  });

  function stat(label, value, sub) {
    return h('div', { class: 'r-stat' }, [h('span', { class: 'label', text: label }), h('b', { text: value }), sub ? h('small', { class: 'muted', text: sub }) : null]);
  }
  function money(n) { return PS.money(n).replace('.00', ''); }

  function render() {
    var start = $('r-start').value;
    echoDate(start);
    var week = Number(document.querySelector('input[name="week"]:checked').value);
    var out = $('r-out');
    out.replaceChildren();
    $('r-err').textContent = '';
    if (!start) { out.append(h('p', { class: 'empty', text: 'הזינו תאריך התחלה כדי לראות את הזכויות שלכם.' })); $('r-remind').hidden = true; return; }
    var r = R.compute({ start: start, daysPerWeek: week, today: today, recuperationRate: PS.num($('r-rate').value) });
    if (r.error) { $('r-err').textContent = r.error; $('r-remind').hidden = true; return; }
    current = r;
    saved.set('ps-rights-start', start);
    saved.set('ps-rights-rate', $('r-rate').value);

    out.append(
      h('div', { class: 'big-result' }, [
        h('span', { class: 'label', text: 'אתם בשנת העבודה ה-' + r.yearNo }),
        h('span', { class: 'value', text: r.completedYears + ' שנים' }),
        h('span', { class: 'muted', text: 'ותק: ' + Math.floor(r.monthsOfService / 12) + ' שנים ו-' + (r.monthsOfService % 12) + ' חודשים · יום השנה הבא: ' + r.anniversary.split('-').reverse().join('/') }),
      ]),
      h('div', { class: 'r-grid' }, [
        stat('חופשה שנתית', r.vacation.perYear + ' ימים', 'נצברו עד היום כ-' + r.vacation.accruedThisYear + ' · בשנה הבאה ' + r.vacation.nextYearPerYear),
        stat('דמי הבראה', r.recuperation.days + ' ימים', 'כ-' + money(r.recuperation.amount) + (r.recuperation.firstYearProRata ? ' · בשנה הראשונה באופן יחסי' : '')),
        stat('ימי מחלה צבורים', r.sick.accrued + ' ימים', 'עד ' + r.sick.max + ' · 1.5 ימים לחודש'),
      ]),
      h('p', { class: 'muted small', text: 'נתוני החוק המשמשים לחישוב: שנת ' + r.dataYear + '.' })
    );

    catalog = R.reminderCatalog(r, today);
    var list = $('r-list');
    list.replaceChildren();
    catalog.forEach(function (x) {
      var cb = h('input', { type: 'checkbox', id: 'rem-' + x.id, checked: 'checked', 'data-id': x.id });
      list.append(h('li', {}, [
        h('label', { for: 'rem-' + x.id }, [cb, h('span', {}, [h('b', { text: x.title }), h('small', { class: 'muted', text: x.desc + ' (מתחיל ב-' + x.start.toISOString().slice(0, 10).split('-').reverse().join('/') + ')' })])]),
      ]));
    });
    $('r-remind').hidden = false;
  }

  function selectedIcs() {
    var ids = Array.prototype.map.call(document.querySelectorAll('#r-list input:checked'), function (c) { return c.dataset.id; });
    var chosen = catalog.filter(function (x) { return ids.indexOf(x.id) >= 0; });
    return chosen.length ? R.toIcs(chosen, 'tlush') : null;
  }

  $('r-ics').addEventListener('click', function () {
    var ics = selectedIcs();
    if (!ics) { $('r-note').textContent = 'בחרו לפחות תזכורת אחת.'; return; }
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    a.download = 'tlush-reminders.ics';
    document.body.append(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    $('r-note').textContent = 'הקובץ הורד. פתחו אותו כדי להוסיף את התזכורות ליומן.';
  });
  $('r-copy').addEventListener('click', function () {
    var ics = selectedIcs();
    if (!ics) { $('r-note').textContent = 'בחרו לפחות תזכורת אחת.'; return; }
    (navigator.clipboard ? navigator.clipboard.writeText(ics) : Promise.reject()).then(
      function () { $('r-note').textContent = 'הועתק. אפשר להדביק לקובץ עם סיומת .ics.'; },
      function () { $('r-note').textContent = 'ההעתקה נחסמה בדפדפן. השתמשו בהורדת הקובץ.'; }
    );
  });
  $('rights-form').addEventListener('submit', function (e) { e.preventDefault(); });
  $('r-rate').addEventListener('input', render);
  document.querySelectorAll('input[name="week"]').forEach(function (r) { r.addEventListener('change', render); });
  render();
})();
