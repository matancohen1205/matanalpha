/* מחשבון נטו-ברוטו */
(function () {
  'use strict';
  var h = PS.h, svg = PS.svg, money = PS.money, T = TaxCore;
  var $ = function (id) { return document.getElementById(id); };
  var mode = 'g2n';
  var els = { amount: $('amount'), slider: $('slider'), points: $('points'), pension: $('pension'), study: $('study'), out: $('calc-out') };

  $('data-year').textContent = T.TAX_DATA.year;
  var saved = PS.store('session').get('ps-credits');
  if (saved && isFinite(Number(saved))) els.points.value = saved;

  function params() {
    return {
      creditPoints: PS.num(els.points.value) || 0,
      pensionPct: PS.num(els.pension.value) || 0,
      studyFundPct: PS.num(els.study.value) || 0,
    };
  }
  function compute() {
    var v = PS.num(els.amount.value);
    if (!isFinite(v) || v < 0) return null;
    var p = params();
    return mode === 'g2n' ? T.grossToNet(Object.assign({ gross: v }, p)) : T.netToGross(Object.assign({ net: v }, p));
  }

  var COLORS = { net: 'var(--c-net)', tax: 'var(--c-tax)', ni: 'var(--c-ni)', health: 'var(--c-health)', pension: 'var(--c-pension)', study: 'var(--c-other)' };

  function render() {
    var r = compute();
    els.out.replaceChildren();
    if (!r) {
      els.out.append(h('p', { class: 'empty', text: 'הזינו סכום תקין כדי לראות תוצאה.' }));
      return;
    }
    var main = mode === 'g2n'
      ? { label: 'שכר נטו משוער', value: r.net }
      : { label: 'שכר ברוטו משוער', value: r.gross };
    els.out.append(h('div', { class: 'big-result' }, [
      h('span', { class: 'label', text: main.label }),
      h('span', { class: 'value', text: money(main.value) }),
      h('span', { class: 'muted', text: 'ניכוי כולל ' + r.effectiveRate + '% מהברוטו · מס שולי ' + Math.round(r.marginalRate * 100) + '%' }),
    ]));

    var parts = [
      ['net', 'נטו', r.net], ['tax', 'מס הכנסה', r.incomeTax], ['ni', 'ביטוח לאומי', r.nationalInsurance],
      ['health', 'מס בריאות', r.healthTax], ['pension', 'פנסיה (עובד)', r.pension], ['study', 'קרן השתלמות (עובד)', r.studyFund],
    ].filter(function (p) { return p[2] > 0; });
    var bar = h('div', { class: 'stack-bar', role: 'img', 'aria-label': 'חלוקת הברוטו' });
    parts.forEach(function (p) {
      var s = h('span', { title: p[1] });
      s.style.width = (p[2] / r.gross) * 100 + '%';
      s.style.background = COLORS[p[0]];
      bar.append(s);
    });
    var list = h('ul', { class: 'break-list' });
    list.append(row('gross-row', 'ברוטו', r.gross, 'var(--text)'));
    parts.forEach(function (p) { list.append(row(p[0], p[1], p[2], COLORS[p[0]])); });
    els.out.append(bar, list);

    // כיצד נבנה המס
    var det = h('details', { class: 'faq' }, [h('summary', { text: 'איך חושב מס ההכנסה?' })]);
    var tbl = h('table', {}, [h('thead', {}, [h('tr', {}, [h('th', { text: 'מדרגה' }), h('th', { class: 'num', text: 'הכנסה במדרגה' }), h('th', { class: 'num', text: 'מס' })])])]);
    var tb = h('tbody');
    r.brackets.forEach(function (b) {
      tb.append(h('tr', {}, [h('td', { text: Math.round(b.rate * 100) + '%' }), h('td', { class: 'num', text: money(b.amount) }), h('td', { class: 'num', text: money(b.tax) })]));
    });
    tb.append(h('tr', {}, [h('td', { text: 'מס לפני זיכויים' }), h('td'), h('td', { class: 'num', text: money(r.incomeTaxBeforeCredits) })]));
    tb.append(h('tr', {}, [h('td', { text: 'זיכוי נקודות (' + r.credits.points + ')' }), h('td'), h('td', { class: 'num', text: '−' + money(r.credits.pointsValue) })]));
    if (r.credits.pension > 0) tb.append(h('tr', {}, [h('td', { text: 'זיכוי על פנסיה' }), h('td'), h('td', { class: 'num', text: '−' + money(r.credits.pension) })]));
    tb.append(h('tr', {}, [h('td', { text: 'מס הכנסה לתשלום' }), h('td'), h('td', { class: 'num', text: money(r.incomeTax) })]));
    tbl.append(tb);
    det.append(h('div', { class: 'table-wrap' }, [tbl]));
    els.out.append(det);

    var emp = r.employer;
    els.out.append(h('details', { class: 'faq' }, [
      h('summary', { text: 'מה המעסיק מוסיף מעבר לשכר?' }),
      h('p', { text: 'בנוסף לברוטו המעסיק מפריש לטובתכם בערך: פנסיה ' + money(emp.pension) + ', פיצויים ' + money(emp.severance) + (emp.studyFund ? ', קרן השתלמות ' + money(emp.studyFund) : '') + '. סכומים אלה אינם יורדים מהשכר שלכם.' }),
    ]));
  }
  function row(key, label, amt, color) {
    return h('li', {}, [h('span', { class: 'dot', style: 'background:' + color }), h('span', { text: label }), h('span', { class: 'amt', text: money(amt) })]);
  }

  /* גרף: נטו כנגד ברוטו, עם נקודת המשתמש */
  function renderCurve() {
    var box = $('curve');
    box.replaceChildren();
    var W = 640, H = 300, L = 56, R = 16, Tp = 16, B = 36;
    var maxG = 60000, maxN = 0, pts = [];
    var p = params();
    for (var g = 0; g <= maxG; g += 1000) {
      var n = T.grossToNet(Object.assign({ gross: g }, p)).net;
      pts.push([g, n]);
      maxN = Math.max(maxN, n);
    }
    var x = function (g) { return L + (g / maxG) * (W - L - R); };
    var y = function (n) { return H - B - (n / maxN) * (H - B - Tp); };
    var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart-svg', role: 'img', 'aria-label': 'גרף נטו כפונקציה של ברוטו', direction: 'ltr' });
    [0, 0.25, 0.5, 0.75, 1].forEach(function (f) {
      var yy = y(maxN * f);
      s.append(svg('line', { x1: L, x2: W - R, y1: yy, y2: yy, class: 'grid' }));
      var t = svg('text', { x: L - 6, y: yy + 4, 'text-anchor': 'end' });
      t.textContent = Math.round((maxN * f) / 1000) + 'K';
      s.append(t);
    });
    [0, 20000, 40000, 60000].forEach(function (gv) {
      var t = svg('text', { x: x(gv), y: H - 14, 'text-anchor': 'middle' });
      t.textContent = gv / 1000 + 'K';
      s.append(t);
    });
    var d = pts.map(function (q, i) { return (i ? 'L' : 'M') + x(q[0]).toFixed(1) + ' ' + y(q[1]).toFixed(1); }).join(' ');
    s.append(svg('path', { d: d, fill: 'none', stroke: 'var(--c-net)', 'stroke-width': 3, 'stroke-linejoin': 'round' }));
    var diag = svg('line', { x1: x(0), y1: y(0), x2: x(maxN), y2: y(maxN), stroke: 'var(--muted)', 'stroke-dasharray': '4 4', 'stroke-width': 1 });
    s.append(diag);
    var r = compute();
    if (r && r.gross <= maxG) {
      s.append(svg('circle', { cx: x(r.gross), cy: y(r.net), r: 6, fill: 'var(--primary)', stroke: 'var(--surface)', 'stroke-width': 2 }));
    }
    box.append(s);
    // כמה נשאר מ-1,000 ש"ח נוספים
    if (r) {
      var more = T.grossToNet(Object.assign({ gross: r.gross + 1000 }, p)).net - r.net;
      $('curve-note').textContent = 'מכל 1,000 ₪ ברוטו נוספים אצלכם בנטו נשארים בערך ' + Math.round(more) + ' ₪. הקו המקווקו הוא המצב ההיפותטי שבו אין ניכויים כלל.';
    }
  }

  function update() {
    render();
    renderCurve();
  }

  /* אירועים */
  ['points', 'pension', 'study'].forEach(function (id) { els[id].addEventListener('input', update); });
  els.amount.addEventListener('input', function () {
    var v = PS.num(els.amount.value);
    if (isFinite(v)) els.slider.value = Math.min(60000, Math.max(5000, v));
    update();
  });
  els.slider.addEventListener('input', function () {
    els.amount.value = els.slider.value;
    update();
  });
  document.querySelectorAll('#calc-form [role="tab"]').forEach(function (t) {
    t.addEventListener('click', function () {
      mode = t.dataset.mode;
      document.querySelectorAll('#calc-form [role="tab"]').forEach(function (o) { o.setAttribute('aria-selected', String(o === t)); });
      $('amount-label').textContent = mode === 'g2n' ? 'שכר ברוטו חודשי (₪)' : 'שכר נטו חודשי (₪)';
      els.amount.value = mode === 'g2n' ? '15000' : '11000';
      els.slider.value = els.amount.value;
      update();
    });
  });
  $('calc-form').addEventListener('submit', function (e) { e.preventDefault(); });
  update();
})();
