/* בדיקת נקודות זיכוי */
(function () {
  'use strict';
  var h = PS.h, T = TaxCore;
  var $ = function (id) { return document.getElementById(id); };
  var thisYear = T.TAX_DATA.year;
  var kids = [];

  function genderVal() { return document.querySelector('input[name="gender"]:checked').value; }

  function renderKids() {
    var box = $('kids');
    box.replaceChildren();
    kids.forEach(function (y, i) {
      var input = h('input', { type: 'number', min: String(thisYear - 25), max: String(thisYear), step: '1', value: String(y), 'aria-label': 'שנת לידה של ילד ' + (i + 1) });
      input.addEventListener('input', function () { kids[i] = Number(input.value) || thisYear; update(); });
      box.append(h('div', { class: 'kid-row' }, [
        h('span', { text: 'ילד/ה ' + (i + 1) }), input,
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'הסרה', 'aria-label': 'הסרת ילד ' + (i + 1),
          onclick: function () { kids.splice(i, 1); renderKids(); update(); } }),
      ]));
    });
  }

  /* ---------- תאריך סיום לימודים: הקלדה dd/mm/yyyy ---------- */
  function parseDmy(t) {
    var m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/.exec(t);
    if (!m) return null;
    var d = +m[1], mo = +m[2], y = +m[3], dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return y + '-' + (mo < 10 ? '0' : '') + mo + '-' + (d < 10 ? '0' : '') + d;
  }
  function formatDigits(raw) {
    var dg = raw.replace(/\D/g, '').slice(0, 8);
    return dg.length > 4 ? dg.slice(0, 2) + '/' + dg.slice(2, 4) + '/' + dg.slice(4) : dg.length > 2 ? dg.slice(0, 2) + '/' + dg.slice(2) : dg;
  }
  function maskDate(el) {
    var clean = el.value.replace(/[^\d\/.-]/g, '').slice(0, 10);
    var parts = clean.split(/[\/.-]/);
    el.value = (parts.length >= 3 || (parts.length === 2 && parts[1].length <= 2)) ? clean : formatDigits(clean);
  }
  ['degree-end', 'discharge-date'].forEach(function (id) { $(id).addEventListener('input', function () { maskDate($(id)); }); });
  function fmt(iso) { return iso.split('-').reverse().join('/'); }

  /** קורא שדה תאריך, מציג הודעת מצב לפי תקופת זכאות, ומחזיר ISO תקין או '' */
  function dateState(inputId, msgId, months, enabled, hints) {
    var msg = $(msgId);
    msg.className = 'muted';
    if (!enabled) { msg.textContent = ''; return ''; }
    var t = $(inputId).value.trim();
    if (!t) { msg.textContent = hints.empty || ''; return ''; }
    var iso = parseDmy(t);
    if (!iso) { msg.textContent = /^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4}$/.test(t) ? 'תאריך לא קיים. הזינו יום/חודש/שנה, למשל 30/06/2025.' : 'הזינו תאריך מלא בפורמט יום/חודש/שנה, למשל 30/06/2025.'; return ''; }
    var w = T.periodWindow(iso, months);
    if (w.status === 'future') msg.textContent = 'הזכאות מתחילה ב-' + fmt(w.start) + ' (עד ' + fmt(w.end) + '). עדיין לא נספרות נקודות.';
    else if (w.status === 'active') { msg.textContent = '✓ אתם בתקופת הזכאות: ' + fmt(w.start) + ' עד ' + fmt(w.end) + '.'; msg.className = 'ok-text'; }
    else msg.textContent = 'תקופת הזכאות הסתיימה ב-' + fmt(w.end) + '. ' + hints.expired;
    return iso;
  }
  function degreeState() {
    var has = $('degree').value !== 'none';
    $('degree-date-field').hidden = !has;
    return dateState('degree-end', 'degree-msg', 12, has, { empty: 'הזינו את תאריך סיום הלימודים כדי לבדוק אם אתם בתקופת הזכאות.', expired: 'לא נספרות נקודות על התואר.' });
  }

  function update() {
    var degreeEnd = degreeState();
    var dischargeDate = dateState('discharge-date', 'discharge-msg', 36, true, { empty: '', expired: 'לא נספרות נקודות על השחרור.' });
    var prof = {
      gender: genderVal(), children: kids.slice(), singleParent: $('single').checked,
      degree: $('degree').value, degreeEnd: degreeEnd,
      dischargeDate: dischargeDate, taxYear: thisYear,
    };
    var r = T.estimateCredits(prof);
    var out = $('credit-out');
    out.replaceChildren();
    out.append(h('div', { class: 'big-result' }, [
      h('span', { class: 'label', text: 'נקודות זיכוי שמגיעות לכם (הערכה, שנת ' + r.year + ')' }),
      h('span', { class: 'value', text: String(r.total) }),
      h('span', { class: 'muted', text: 'שווי חודשי בערך ' + PS.money(T.pointsValue(r.total)) }),
    ]));
    var list = h('ul', { class: 'break-list' });
    r.rows.forEach(function (row) {
      list.append(h('li', {}, [h('span', { text: row.label }), h('span', { class: 'amt', text: String(row.points) })]));
      if (row.note) list.lastChild.setAttribute('title', row.note);
    });
    out.append(list);

    var slip = PS.num($('payslip-points').value);
    if (isFinite(slip) && $('payslip-points').value !== '') {
      var diff = Math.round((r.total - slip) * 100) / 100;
      var box;
      if (Math.abs(diff) < 0.01) {
        box = h('div', { class: 'insight ok' }, [h('h3', { text: 'הנקודות בתלוש תואמות להערכה' }), h('p', { text: 'לפי הנתונים שהזנתם, אין פער.' })]);
      } else if (diff > 0) {
        box = h('div', { class: 'insight warn' }, [
          h('h3', { text: 'ייתכן שחסרות לכם ' + diff + ' נקודות בתלוש' }),
          h('p', { text: 'זה בערך ' + PS.money(T.pointsValue(diff)) + ' בחודש, כלומר כ-' + PS.money(T.pointsValue(diff) * 12) + ' בשנה. מלאו טופס 101 אצל המעסיק, ובמידת הצורך הגישו בקשה להחזר מס לשנים קודמות.' }),
        ]);
      } else {
        box = h('div', { class: 'insight warn' }, [
          h('h3', { text: 'בתלוש רשומות ' + Math.abs(diff) + ' נקודות יותר מההערכה' }),
          h('p', { text: 'ייתכן שיש לכם זכאות נוספת שלא הזנתם (למשל עולה חדש או נכות), או שהוזנו נקודות שאינן מגיעות. כדאי לבדוק כדי למנוע חוב מס בסוף השנה.' }),
        ]);
      }
      out.append(box);
    } else {
      out.append(h('p', { class: 'muted', text: 'הזינו את מספר הנקודות שבתלוש כדי לראות אם יש פער.' }));
    }
  }

  var s = PS.store('session').get('ps-credits');
  if (s) {
    $('payslip-points').value = s;
    $('from-slip').textContent = 'הערך נלקח מהתלוש האחרון שסרקתם בדפדפן זה.';
  }
  $('add-kid').addEventListener('click', function () { kids.push(thisYear - 3); renderKids(); update(); });
  document.querySelectorAll('#credit-form input, #credit-form select').forEach(function (el) {
    el.addEventListener('input', update);
    el.addEventListener('change', update);
  });
  $('credit-form').addEventListener('submit', function (e) { e.preventDefault(); });
  update();
})();
