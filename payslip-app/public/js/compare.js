/* השוואת תלושים בין חודשים (Pro). החישוב עצמו מתבצע בשרת. */
(function () {
  'use strict';
  var h = PS.h, svg = PS.svg, money = PS.money;
  var $ = function (id) { return document.getElementById(id); };
  var slips = [];
  var MAX = 12;
  var lastResult = null;
  var busy = false;

  function err(msg) { $('cmp-error').textContent = msg || ''; $('cmp-error').hidden = !msg; }

  /* ---------- טאבים ---------- */
  document.querySelectorAll('#cmp-tab-file, #cmp-tab-text').forEach(function (t) {
    t.addEventListener('click', function () {
      document.querySelectorAll('#cmp-tab-file, #cmp-tab-text').forEach(function (o) { o.setAttribute('aria-selected', String(o === t)); });
      $('cmp-file').hidden = t.dataset.mode !== 'file';
      $('cmp-text').hidden = t.dataset.mode !== 'text';
    });
  });

  /* ---------- הוספת תלוש ---------- */
  function addAnalysis(a, fallbackLabel) {
    if (slips.length >= MAX) { err('אפשר להשוות עד ' + MAX + ' תלושים.'); return; }
    var label = (a.summary && a.summary.period) || fallbackLabel || ('תלוש ' + (slips.length + 1));
    slips.push({ label: label, analysis: a });
    renderList();
  }
  function analyzeFile(file) {
    var fd = new FormData();
    fd.append('payslip', file);
    return fetch('/api/analyze', { method: 'POST', body: fd }).then(function (r) { return r.json().then(function (b) { if (!r.ok) throw new Error(b.message || 'שגיאה'); return b; }); });
  }
  function analyzeText(text) {
    return PS.post('/api/analyze-text', { text: text }).then(function (r) { if (!r.ok) throw new Error(r.body.message || 'שגיאה'); return r.body; });
  }

  function guard(fn) {
    if (busy) return;
    busy = true; err('');
    Promise.resolve().then(fn).catch(function (e) { err(e.message || 'שגיאה בעיבוד.'); }).then(function () { busy = false; });
  }

  $('cmp-input').addEventListener('change', function (e) {
    var files = Array.prototype.slice.call(e.target.files);
    e.target.value = '';
    guard(function () {
      return files.reduce(function (p, f) {
        return p.then(function () { return analyzeFile(f).then(function (a) { addAnalysis(a, f.name.slice(0, 20)); }); });
      }, Promise.resolve());
    });
  });
  $('cmp-add-text').addEventListener('click', function () {
    var t = $('cmp-paste').value;
    if (t.trim().length < 10) { err('הדביקו טקסט של תלוש.'); return; }
    guard(function () { return analyzeText(t).then(function (a) { addAnalysis(a); $('cmp-paste').value = ''; }); });
  });

  function demoText(period, base, extra, travel, taxRate) {
    var gross = base + extra + travel;
    var tax = Math.round(gross * taxRate);
    var ni = 540, health = 470, pension = Math.round(gross * 0.06);
    var net = gross - tax - ni - health - pension;
    var f = function (n) { return n.toLocaleString('en-US', { minimumFractionDigits: 2 }); };
    return ['תלוש שכר לחודש ' + period, 'שכר יסוד ' + f(base)]
      .concat(extra ? ['בונוס ' + f(extra)] : [])
      .concat(travel ? ['החזר נסיעות ' + f(travel)] : [])
      .concat(['סה"כ ברוטו ' + f(gross), 'מס הכנסה ' + f(tax), 'ביטוח לאומי ' + f(ni), 'מס בריאות ' + f(health), 'פנסיה עובד ' + f(pension), 'שכר נטו ' + f(net), 'נקודות זיכוי 2.25']).join('\n');
  }
  $('cmp-demo').addEventListener('click', function () {
    guard(function () {
      var texts = [demoText('06/2025', 14000, 0, 396, 0.1), demoText('07/2025', 14000, 2500, 396, 0.17), demoText('08/2025', 14500, 0, 0, 0.11)];
      return texts.reduce(function (p, t) { return p.then(function () { return analyzeText(t).then(function (a) { addAnalysis(a); }); }); }, Promise.resolve());
    });
  });

  function renderList() {
    var ul = $('cmp-list');
    ul.replaceChildren();
    slips.forEach(function (s, i) {
      var input = h('input', { type: 'text', value: s.label, maxlength: '40', 'aria-label': 'שם התלוש ' + (i + 1) });
      input.addEventListener('input', function () { s.label = input.value; });
      var sm = s.analysis.summary || {};
      ul.append(h('li', {}, [
        input,
        h('span', { class: 'meta', text: 'ברוטו ' + money(sm.gross) + ' · נטו ' + money(sm.net) + ' · ' + s.analysis.items.length + ' סעיפים' }),
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'הסרה', 'aria-label': 'הסרת תלוש ' + (i + 1), onclick: function () { slips.splice(i, 1); renderList(); } }),
      ]));
    });
    $('cmp-run').disabled = slips.length < 2;
  }

  /* ---------- הרצת השוואה ---------- */
  function paywall(devUnlock, configured) {
    var box = $('cmp-paywall');
    box.replaceChildren();
    box.append(h('h3', { text: 'ההשוואה זמינה במנוי Pro' }), h('p', { text: 'התלושים שהוספתם נשארים כאן. אחרי הצטרפות תוכלו להפעיל את ההשוואה על אותם תלושים.' }));
    box.append(h('a', { class: 'btn', href: '/pricing.html', text: 'לפרטי המנוי' }));
    if (devUnlock) {
      box.append(document.createTextNode(' '), h('button', { class: 'btn btn-ghost', type: 'button', text: 'פתיחה לבדיקה (פיתוח בלבד)',
        onclick: function () { PS.post('/api/billing/dev-activate').then(function () { PS.me(true).then(function () { box.hidden = true; run(); }); }); } }));
    }
    box.hidden = false;
  }

  function run() {
    if (slips.length < 2) return;
    $('cmp-paywall').hidden = true;
    err('');
    PS.me().then(function (m) {
      if (!m.pro) return paywall(m.devUnlock, m.configured);
      var payload = { slips: slips.map(function (s) {
        return { label: s.label, items: s.analysis.items.filter(function (i) { return i.amount !== null; }).map(function (i) { return { id: i.id, title: i.title, type: i.type, amount: i.amount }; }) };
      }) };
      return PS.post('/api/compare', payload).then(function (r) {
        if (r.status === 402) { PS.me(true); return paywall(m.devUnlock, m.configured); }
        if (!r.ok) throw new Error(r.body.message || 'שגיאה בהשוואה.');
        lastResult = r.body;
        renderResults(r.body);
      });
    }).catch(function (e) { err(e.message); });
  }
  $('cmp-run').addEventListener('click', run);

  /* ---------- תצוגה ---------- */
  var SERIES_COLORS = { gross: 'var(--c-ni)', net: 'var(--c-net)', income_tax: 'var(--c-tax)', pension_employee: 'var(--c-pension)', national_insurance: 'var(--c-health)', health_tax: 'var(--c-other)' };

  function renderResults(r) {
    $('cmp-results').hidden = false;
    var f = $('cmp-findings');
    f.replaceChildren();
    if (!r.findings.length) f.append(h('div', { class: 'insight ok' }, [h('h3', { text: 'לא נמצאו שינויים חריגים' }), h('p', { text: 'הסעיפים המרכזיים יציבים בין התלושים.' })]));
    r.findings.forEach(function (x) { f.append(h('div', { class: 'insight ' + x.level }, [h('h3', { text: x.title }), h('p', { text: x.text })])); });
    chart(r);
    table(r);
    $('res-h').focus();
    $('cmp-results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function chart(r) {
    var box = $('cmp-chart');
    box.replaceChildren();
    var ids = Object.keys(r.series).filter(function (id) { return ['gross', 'net', 'income_tax', 'pension_employee'].indexOf(id) >= 0; });
    if (!ids.length) { box.append(h('p', { class: 'empty', text: 'אין מספיק נתונים לגרף.' })); return; }
    var n = r.labels.length, W = 640, H = 320, L = 60, R = 96, T = 16, B = 40;
    var max = 0;
    ids.forEach(function (id) { r.series[id].values.forEach(function (v) { if (v !== null) max = Math.max(max, v); }); });
    max = Math.ceil(max / 1000) * 1000 || 1000;
    var x = function (i) { return n === 1 ? (W - L - R) / 2 + L : L + (i / (n - 1)) * (W - L - R); };
    var y = function (v) { return H - B - (v / max) * (H - B - T); };
    var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart-svg', role: 'img', 'aria-label': 'גרף מגמות בין התלושים', direction: 'ltr' });
    [0, 0.25, 0.5, 0.75, 1].forEach(function (fr) {
      var yy = y(max * fr);
      s.append(svg('line', { x1: L, x2: W - R, y1: yy, y2: yy, class: 'grid' }));
      var t = svg('text', { x: L - 6, y: yy + 4, 'text-anchor': 'end' });
      t.textContent = Math.round((max * fr) / 100) / 10 + 'K';
      s.append(t);
    });
    r.labels.forEach(function (lb, i) {
      var t = svg('text', { x: x(i), y: H - 16, 'text-anchor': 'middle' });
      t.textContent = lb.length > 10 ? lb.slice(0, 10) + '…' : lb;
      s.append(t);
    });
    var endLabels = [];
    ids.forEach(function (id) {
      var vals = r.series[id].values, d = '', started = false, lastI = -1;
      vals.forEach(function (v, i) {
        if (v === null) { started = false; return; }
        d += (started ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1) + ' ';
        started = true; lastI = i;
      });
      var color = SERIES_COLORS[id];
      s.append(svg('path', { d: d, fill: 'none', stroke: color, 'stroke-width': 3, 'stroke-linejoin': 'round' }));
      vals.forEach(function (v, i) { if (v !== null) s.append(svg('circle', { cx: x(i), cy: y(v), r: 4, fill: color })); });
      if (lastI >= 0) endLabels.push({ x: x(lastI) + 8, y: y(vals[lastI]) + 4, text: r.series[id].label, color: color });
    });
    // מניעת חפיפה בין תוויות בקצה הקווים
    endLabels.sort(function (a, b) { return a.y - b.y; });
    endLabels.forEach(function (l, i) { if (i && l.y - endLabels[i - 1].y < 14) l.y = endLabels[i - 1].y + 14; });
    endLabels.forEach(function (l) {
      var t = svg('text', { x: l.x, y: l.y, 'text-anchor': 'start' });
      t.textContent = l.text;
      t.style.fill = l.color;
      t.style.fontWeight = '700';
      s.append(t);
    });
    box.append(s);
  }

  function pctText(p) { return p === null ? '' : (p > 0 ? '+' : '') + p + '%'; }

  function table(r) {
    var t = $('cmp-table');
    t.replaceChildren();
    var head = h('tr', {}, [h('th', { text: 'סעיף' })].concat(r.labels.map(function (l) { return h('th', { class: 'num', text: l }); })).concat([h('th', { class: 'num', text: 'שינוי' })]));
    t.append(h('thead', {}, [head]));
    var tb = h('tbody');
    r.table.forEach(function (row) {
      var up = row.change > 0;
      var cls = row.change === 0 || row.change === null ? '' : (['deduction'].indexOf(row.type) >= 0 ? (up ? 'down' : 'up') : (up ? 'up' : 'down'));
      tb.append(h('tr', {}, [h('td', { text: row.title })]
        .concat(row.values.map(function (v) { return h('td', { class: 'num', text: v === null ? '—' : (row.id === 'tax_credits' ? String(v) : money(v)) }); }))
        .concat([h('td', { class: 'num ' + cls, text: row.change === null ? '' : (row.id === 'tax_credits' ? String(row.change) : money(row.change)) + (row.changePct !== null ? ' (' + pctText(row.changePct) + ')' : '') })])));
    });
    t.append(tb);
  }

  $('cmp-csv').addEventListener('click', function () {
    if (!lastResult) return;
    var esc = function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; };
    var rows = [['סעיף'].concat(lastResult.labels, ['שינוי'])];
    lastResult.table.forEach(function (r) { rows.push([r.title].concat(r.values.map(function (v) { return v === null ? '' : v; }), [r.change === null ? '' : r.change])); });
    var csv = '﻿' + rows.map(function (r) { return r.map(esc).join(','); }).join('\r\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'payslip-comparison.csv';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });

  renderList();
})();
