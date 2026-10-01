/* לוגיקת הדף הראשי: העלאה, ניתוח, תצוגה אינטראקטיבית */
(function () {
  'use strict';

  var MAX_BYTES = 8 * 1024 * 1024;
  var TYPE_LABEL = {
    earning: 'תשלום',
    deduction: 'ניכוי',
    employer: 'הפרשת מעסיק',
    summary: 'סיכום',
    info: 'מידע ויתרות',
  };
  var DEMO_TEXT = [
    'תלוש שכר לחודש 08/2025',
    'שכר יסוד 12,000.00',
    'שעות נוספות 125% 640.00',
    'שעות נוספות 150% 410.00',
    'החזר נסיעות 396.00',
    'בונוס רבעוני 1,500.00',
    'שווי ארוחות 180.00',
    'סה"כ ברוטו 15,126.00',
    'מס הכנסה 1,480.00',
    'ביטוח לאומי 540.00',
    'מס בריאות 470.00',
    'פנסיה עובד 907.56',
    'קרן השתלמות 378.00',
    'סה"כ ניכויים 3,895.56',
    'שכר נטו 11,230.44',
    'פנסיה מעסיק 983.00',
    'פיצויים 907.00',
    'נקודות זיכוי 2.25',
    'יתרת חופשה 8.5',
    'יתרת מחלה 21',
    'דמי חבר 120.00',
  ].join('\n');

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    tabs: document.querySelectorAll('[role="tab"]'),
    panels: { file: $('panel-file'), text: $('panel-text') },
    drop: $('dropzone'),
    input: $('file-input'),
    chipBox: $('file-chip-box'),
    text: $('paste-text'),
    consent: $('consent'),
    analyze: $('analyze-btn'),
    demo: $('demo-btn'),
    error: $('error-box'),
    loader: $('loader'),
    uploadCard: $('upload-card'),
    results: $('results'),
  };

  var state = { file: null, mode: 'file', data: null, filter: 'all', query: '', open: {} };

  /* ---------- עזרים ---------- */
  function h(tag, props, children) {
    var n = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        if (k === 'class') n.className = props[k];
        else if (k === 'text') n.textContent = props[k];
        else if (k === 'style') n.style.cssText = props[k]; // CSSOM: מותר תחת CSP ללא unsafe-inline
        else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), props[k]);
        else n.setAttribute(k, props[k]);
      });
    }
    (children || []).forEach(function (c) {
      if (c) n.append(c);
    });
    return n;
  }
  var nf = new Intl.NumberFormat('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function money(n) {
    return n === null || n === undefined || isNaN(n) ? '—' : nf.format(n) + ' ₪';
  }
  function fmtAmount(item) {
    if (item.amount === null || item.amount === undefined) return '—';
    return item.type === 'info' ? String(item.amount) : money(item.amount);
  }
  function showError(msg) {
    el.error.textContent = msg;
    el.error.hidden = !msg;
  }
  function icon(path) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('class', 'chev');
    s.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', path);
    s.appendChild(p);
    return s;
  }

  /* ---------- טאבים ---------- */
  function setMode(mode) {
    state.mode = mode;
    el.tabs.forEach(function (t) {
      t.setAttribute('aria-selected', String(t.dataset.mode === mode));
      t.tabIndex = t.dataset.mode === mode ? 0 : -1;
    });
    el.panels.file.hidden = mode !== 'file';
    el.panels.text.hidden = mode !== 'text';
    refreshButton();
  }
  el.tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { setMode(t.dataset.mode); });
    t.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        var next = el.tabs[(i + 1) % el.tabs.length];
        next.focus();
        setMode(next.dataset.mode);
      }
    });
  });

  /* ---------- קובץ ---------- */
  function setFile(f) {
    showError('');
    if (!f) { state.file = null; renderChip(); refreshButton(); return; }
    if (!/^(application\/pdf|image\/(jpeg|png|webp))$/.test(f.type)) {
      showError('סוג הקובץ אינו נתמך. אפשר להעלות PDF, JPG, PNG או WEBP.');
      return;
    }
    if (f.size > MAX_BYTES) {
      showError('הקובץ גדול מדי (עד 8MB).');
      return;
    }
    state.file = f;
    renderChip();
    refreshButton();
  }
  function renderChip() {
    el.chipBox.replaceChildren();
    if (!state.file) return;
    var kb = Math.max(1, Math.round(state.file.size / 1024));
    el.chipBox.append(
      h('div', { class: 'file-chip' }, [
        h('span', { text: '📄 ' + state.file.name + ' (' + kb + ' KB)' }),
        h('button', {
          type: 'button', class: 'btn btn-ghost btn-sm', text: 'הסרה', 'aria-label': 'הסרת הקובץ',
          onclick: function () { el.input.value = ''; setFile(null); },
        }),
      ])
    );
  }
  el.drop.addEventListener('click', function () { el.input.click(); });
  el.drop.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.input.click(); }
  });
  el.input.addEventListener('change', function () { setFile(el.input.files[0]); });
  ['dragenter', 'dragover'].forEach(function (ev) {
    el.drop.addEventListener(ev, function (e) { e.preventDefault(); el.drop.classList.add('drag'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    el.drop.addEventListener(ev, function (e) { e.preventDefault(); el.drop.classList.remove('drag'); });
  });
  el.drop.addEventListener('drop', function (e) { setFile(e.dataTransfer.files[0]); });

  function refreshButton() {
    var ready = state.mode === 'file' ? !!state.file : el.text.value.trim().length >= 10;
    el.analyze.disabled = !(ready && el.consent.checked);
  }
  el.consent.addEventListener('change', refreshButton);
  el.text.addEventListener('input', refreshButton);

  /* ---------- שליחה לניתוח ---------- */
  var stepTimer;
  function startLoader(withOcr) {
    var labels = withOcr
      ? ['מעלה את הקובץ בהצפנה', 'סורק את התלוש (OCR)', 'מזהה סעיפים וסכומים', 'מכין הסברים']
      : ['מעלה את הקובץ בהצפנה', 'קורא את הטקסט', 'מזהה סעיפים וסכומים', 'מכין הסברים'];
    var list = $('steps');
    list.replaceChildren.apply(list, labels.map(function (t) { return h('li', { text: t }); }));
    var i = 0;
    function tick() {
      Array.prototype.forEach.call(list.children, function (li, idx) {
        li.className = idx < i ? 'done' : idx === i ? 'active' : '';
        li.textContent = (idx < i ? '✓ ' : idx === i ? '… ' : '') + labels[idx];
      });
      if (i < labels.length - 1) i++;
    }
    tick();
    clearInterval(stepTimer);
    stepTimer = setInterval(tick, 2200);
    el.loader.hidden = false;
    el.uploadCard.hidden = true;
  }
  function stopLoader() {
    clearInterval(stepTimer);
    el.loader.hidden = true;
  }

  async function run(request, withOcr) {
    showError('');
    startLoader(withOcr);
    try {
      var res = await request();
      var body = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(body.message || 'שגיאה בעיבוד הקובץ.');
      state.data = body;
      state.data.items.forEach(function (it) { it.origAmount = it.amount; });
      state.filter = 'all';
      state.query = '';
      state.open = {};
      stopLoader();
      renderResults();
      el.results.hidden = false;
      el.results.scrollIntoView({ behavior: 'smooth', block: 'start' });
      $('results-title').focus();
    } catch (err) {
      stopLoader();
      el.uploadCard.hidden = false;
      showError(err.message || 'שגיאה בעיבוד הקובץ.');
    }
  }

  el.analyze.addEventListener('click', function () {
    if (state.mode === 'file') {
      var fd = new FormData();
      fd.append('payslip', state.file);
      var isPdf = state.file.type === 'application/pdf';
      run(function () { return fetch('/api/analyze', { method: 'POST', body: fd }); }, !isPdf);
    } else {
      var text = el.text.value;
      run(function () {
        return fetch('/api/analyze-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: text }),
        });
      }, false);
    }
  });

  el.demo.addEventListener('click', function () {
    run(function () {
      return fetch('/api/analyze-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: DEMO_TEXT }),
      });
    }, false);
  });

  /* ---------- חישוב סיכומים (מגיב לעריכות) ---------- */
  function amountOf(id) {
    var it = state.data.items.find(function (i) { return i.id === id && i.amount !== null; });
    return it ? it.amount : null;
  }
  function sumType(type) {
    return state.data.items
      .filter(function (i) { return i.type === type && i.amount !== null; })
      .reduce(function (s, i) { return s + Math.abs(i.amount); }, 0);
  }
  function computeSummary() {
    var gross = amountOf('gross');
    var net = amountOf('net');
    if (gross === null) gross = sumType('earning') || null;
    var ded = amountOf('total_deductions');
    if (ded === null) ded = gross !== null && net !== null ? gross - net : sumType('deduction') || null;
    return { gross: gross, net: net, ded: ded, pct: gross && ded !== null ? (ded / gross) * 100 : null };
  }

  /* ---------- תצוגת תוצאות ---------- */
  function renderResults() {
    var d = state.data;
    var root = $('results-body');
    root.replaceChildren();

    var s = computeSummary();
    var period = d.summary.period ? ' · ' + d.summary.period : '';
    $('results-title').textContent = 'התלוש שלכם, מוסבר' + period;

    root.append(
      h('div', { class: 'stat-grid', id: 'stats' }, [
        stat('ברוטו', money(s.gross), ''),
        stat('סה"כ ניכויים', money(s.ded), 'ded'),
        stat('נטו (מה שקיבלתם)', money(s.net), 'net'),
        stat('אחוז ניכוי מהברוטו', s.pct === null ? '—' : s.pct.toFixed(1) + '%', ''),
      ])
    );

    var left = h('aside', { class: 'card chart-card', id: 'chart-card', 'aria-label': 'חלוקת הברוטו' });
    var right = h('div', { id: 'right-col' });
    root.append(h('div', { class: 'results-grid' }, [left, right]));

    renderChart(left);

    if (d.insights && d.insights.length) {
      right.append(
        h('div', { class: 'insights', role: 'list' },
          d.insights.map(function (i) {
            return h('div', { class: 'insight ' + i.level, role: 'listitem' }, [
              h('h3', { text: i.title }),
              h('p', { text: i.text }),
            ]);
          }))
      );
    }

    right.append(renderToolbar());
    right.append(h('div', { class: 'items', id: 'items', role: 'list' }));
    renderItems();

    if (d.unknown && d.unknown.length) right.append(renderUnknown());

    right.append(
      h('p', { class: 'disclaimer', text: 'ההסברים כלליים ונועדו להבנה בלבד ואינם ייעוץ משפטי, מיסויי או פנסיוני. זיהוי הסכומים אוטומטי וייתכנו טעויות, ניתן ללחוץ על סעיף ולתקן את הסכום. בכל ספק פנו למחלקת השכר או ליועץ מוסמך.' })
    );
    right.append(
      h('div', { class: 'form-actions no-print' }, [
        h('button', { class: 'btn', type: 'button', text: '🖨️ הדפסה / שמירה כ-PDF', onclick: function () { window.print(); } }),
        h('button', {
          class: 'btn btn-ghost', type: 'button', text: '🗑️ מחיקת הנתונים והתחלה מחדש', onclick: resetAll,
        }),
      ])
    );
  }

  function stat(label, value, cls) {
    return h('div', { class: 'stat ' + cls }, [
      h('div', { class: 'label', text: label }),
      h('div', { class: 'value', text: value }),
    ]);
  }

  function renderToolbar() {
    var filters = [
      ['all', 'הכל'], ['earning', 'תשלומים'], ['deduction', 'ניכויים'],
      ['employer', 'הפרשות מעסיק'], ['info', 'מידע'], ['summary', 'סיכומים'],
    ];
    var chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'סינון סעיפים' },
      filters.map(function (f) {
        return h('button', {
          class: 'chip', type: 'button', text: f[1], 'data-f': f[0],
          'aria-pressed': String(state.filter === f[0]),
          onclick: function () {
            state.filter = f[0];
            chips.querySelectorAll('.chip').forEach(function (c) {
              c.setAttribute('aria-pressed', String(c.dataset.f === state.filter));
            });
            renderItems();
          },
        });
      }));
    var search = h('input', {
      class: 'search', type: 'search', placeholder: 'חיפוש סעיף…', 'aria-label': 'חיפוש סעיף בתלוש',
    });
    search.addEventListener('input', function () { state.query = search.value.trim(); renderItems(); });
    return h('div', { class: 'toolbar no-print' }, [search, chips]);
  }

  function renderItems() {
    var box = $('items');
    var q = state.query;
    var list = state.data.items.filter(function (i) {
      if (state.filter !== 'all' && i.type !== state.filter) return false;
      if (q && (i.title + ' ' + i.what + ' ' + i.line).indexOf(q) === -1) return false;
      return true;
    });
    box.replaceChildren();
    if (!list.length) {
      box.append(h('p', { class: 'empty', text: 'לא נמצאו סעיפים. נסו סינון או חיפוש אחר.' }));
      return;
    }
    list.forEach(function (it) { box.append(renderItem(it)); });
  }

  function renderItem(it) {
    var open = !!state.open[it.key];
    var panelId = 'p-' + it.key;
    var head = h('button', {
      class: 'item-head', type: 'button', 'aria-expanded': String(open), 'aria-controls': panelId,
    }, [
      h('span', { class: 'badge ' + it.type, text: TYPE_LABEL[it.type] }),
      h('span', { class: 'item-title', text: it.title }),
      h('span', { class: 'item-amount', text: fmtAmount(it) }),
      icon('M6 9l6 6 6-6'),
    ]);
    var body = h('div', { class: 'item-body', id: panelId, role: 'region', 'aria-label': it.title }, [
      h('div', { class: 'explain' }, [h('h4', { text: 'מה זה?' }), h('p', { text: it.what })]),
      h('div', { class: 'explain' }, [h('h4', { text: 'למה זה בתלוש שלכם?' }), h('p', { text: it.why })]),
      amountEditor(it),
      h('div', { class: 'source-line', text: 'השורה שנקראה: ' + it.line }),
    ]);
    body.hidden = !open;
    var wrap = h('div', { class: 'item' + (open ? ' open' : ''), role: 'listitem', 'data-id': it.id, 'data-key': it.key }, [head, body]);
    head.addEventListener('click', function () {
      var isOpen = !body.hidden;
      body.hidden = isOpen;
      state.open[it.key] = !isOpen;
      wrap.classList.toggle('open', !isOpen);
      head.setAttribute('aria-expanded', String(!isOpen));
    });
    return wrap;
  }

  function amountEditor(it) {
    var input = h('input', {
      type: 'text', inputmode: 'decimal', value: it.amount === null ? '' : String(it.amount),
      'aria-label': 'תיקון סכום עבור ' + it.title,
    });
    var apply = h('button', {
      class: 'btn btn-ghost btn-sm', type: 'button', text: 'עדכון סכום',
      onclick: function () {
        var raw = input.value.replace(/,/g, '').trim();
        var n = raw === '' ? null : Number(raw);
        if (n !== null && !isFinite(n)) return;
        it.amount = n;
        refreshAfterEdit();
      },
    });
    return h('div', { class: 'amount-edit no-print' }, [
      h('label', { text: 'הסכום לא נקרא נכון? תקנו:' }), input, apply,
    ]);
  }

  function refreshAfterEdit() {
    var s = computeSummary();
    var stats = $('stats');
    var vals = stats.querySelectorAll('.value');
    vals[0].textContent = money(s.gross);
    vals[1].textContent = money(s.ded);
    vals[2].textContent = money(s.net);
    vals[3].textContent = s.pct === null ? '—' : s.pct.toFixed(1) + '%';
    renderChart($('chart-card'));
    // מרעננים רק את הכותרות כדי לא לאבד פתיחה של פריטים
    state.data.items.forEach(function (it) {
      var row = document.querySelector('.item[data-key="' + it.key + '"] .item-amount');
      if (row) row.textContent = fmtAmount(it);
    });
  }

  function renderUnknown() {
    var wrap = h('div', { class: 'card unknown-box no-print', style: 'margin-top:1.2rem' });
    wrap.append(h('h3', { text: 'שורות עם סכומים שלא זוהו' }));
    wrap.append(h('p', { class: 'muted', text: 'לא הצלחנו להתאים את השורות האלה לסעיף מוכר. אפשר לסווג אותן ידנית כדי שייכנסו לחישוב.' }));
    var ul = h('ul', { style: 'list-style:none;padding:0;display:grid;gap:.5rem' });
    state.data.unknown.forEach(function (u, idx) {
      var li = h('li', { style: 'display:flex;gap:.5rem;flex-wrap:wrap;align-items:center' }, [
        h('span', { style: 'flex:1;min-width:200px', text: u.line }),
      ]);
      [['earning', 'תשלום'], ['deduction', 'ניכוי']].forEach(function (t) {
        li.append(h('button', {
          class: 'btn btn-ghost btn-sm', type: 'button', text: 'סמן כ' + t[1],
          onclick: function () {
            state.data.items.push({
              key: 'manual-' + idx, id: 'manual', type: t[0], title: u.line.replace(/[\d.,\s]+/g, ' ').trim().slice(0, 40) || 'סעיף ידני',
              what: 'סעיף שלא זוהה אוטומטית, סווג על ידכם ידנית.',
              why: 'סעיף זה אינו במילון שלנו. פנו למחלקת השכר אם אינכם בטוחים מה הוא כולל.',
              amount: u.amount, origAmount: u.amount, line: u.line,
            });
            li.remove();
            refreshAll();
          },
        }));
      });
      ul.append(li);
    });
    wrap.append(ul);
    return wrap;
  }

  function refreshAll() {
    renderResults();
  }

  /* ---------- תרשים טבעת ---------- */
  var SEGMENTS = [
    { id: 'net', label: 'נטו', color: 'var(--c-net)' },
    { id: 'income_tax', label: 'מס הכנסה', color: 'var(--c-tax)' },
    { id: 'national_insurance', label: 'ביטוח לאומי', color: 'var(--c-ni)' },
    { id: 'health_tax', label: 'מס בריאות', color: 'var(--c-health)' },
    { id: 'pension_employee', label: 'פנסיה (עובד)', color: 'var(--c-pension)' },
    { id: 'other', label: 'ניכויים אחרים', color: 'var(--c-other)' },
  ];

  function renderChart(box) {
    var s = computeSummary();
    box.replaceChildren();
    box.append(h('h3', { text: 'לאן הלך הברוטו?' }));
    var vals = {};
    var named = 0;
    SEGMENTS.forEach(function (sg) {
      if (sg.id === 'other') return;
      var v = amountOf(sg.id);
      vals[sg.id] = v && v > 0 ? v : 0;
      if (sg.id !== 'net') named += vals[sg.id];
    });
    if (s.ded !== null && s.ded > named) vals.other = s.ded - named;
    else vals.other = 0;
    var total = SEGMENTS.reduce(function (a, sg) { return a + (vals[sg.id] || 0); }, 0);
    if (!total) {
      box.append(h('p', { class: 'empty', text: 'אין מספיק נתונים לתרשים.' }));
      return;
    }

    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 200 200');
    svg.setAttribute('class', 'donut');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'תרשים חלוקת הברוטו לנטו, מסים והפרשות');
    var R = 80, C = 2 * Math.PI * R, offset = 0;
    var legend = h('ul', { class: 'legend' });

    function highlight(id, on) {
      svg.classList.toggle('dim', on);
      svg.querySelectorAll('.seg').forEach(function (c) { c.classList.toggle('hl', on && c.dataset.id === id); });
      document.querySelectorAll('.item').forEach(function (n) {
        n.classList.toggle('hl', on && id !== 'other' && n.dataset.id === id);
      });
    }

    SEGMENTS.forEach(function (sg) {
      var v = vals[sg.id];
      if (!v) return;
      var len = (v / total) * C;
      var c = document.createElementNS(NS, 'circle');
      c.setAttribute('class', 'seg');
      c.setAttribute('data-id', sg.id);
      c.setAttribute('cx', '100'); c.setAttribute('cy', '100'); c.setAttribute('r', String(R));
      c.setAttribute('stroke', sg.color);
      c.setAttribute('stroke-dasharray', Math.max(0, len - 1.5) + ' ' + (C - Math.max(0, len - 1.5)));
      c.setAttribute('stroke-dashoffset', String(-offset));
      c.setAttribute('transform', 'rotate(-90 100 100)');
      offset += len;
      svg.append(c);

      var li = h('li', { tabindex: '0' }, [
        h('span', { class: 'dot', style: 'background:' + sg.color }),
        h('span', { text: sg.label + ' (' + Math.round((v / total) * 100) + '%)' }),
        h('span', { class: 'amt', text: money(v) }),
      ]);
      var on = function () { highlight(sg.id, true); };
      var off = function () { highlight(sg.id, false); };
      [li, c].forEach(function (n) {
        n.addEventListener('mouseenter', on); n.addEventListener('mouseleave', off);
      });
      li.addEventListener('focus', on); li.addEventListener('blur', off);
      var go = function () {
        var target = document.querySelector('.item[data-id="' + (sg.id === 'other' ? 'other_deduction' : sg.id) + '"] .item-head');
        if (target) { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); if (target.getAttribute('aria-expanded') === 'false') target.click(); }
      };
      li.addEventListener('click', go);
      li.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
      c.addEventListener('click', go);
      legend.append(li);
    });

    var t1 = document.createElementNS(NS, 'text');
    t1.setAttribute('x', '100'); t1.setAttribute('y', '96'); t1.setAttribute('font-size', '12');
    t1.textContent = 'ברוטו';
    var t2 = document.createElementNS(NS, 'text');
    t2.setAttribute('x', '100'); t2.setAttribute('y', '118'); t2.setAttribute('font-size', '17'); t2.setAttribute('font-weight', '800');
    t2.textContent = nf.format(Math.round(total)).replace('.00', '');
    svg.append(t1, t2);

    box.append(svg, legend);
  }

  function resetAll() {
    state = { file: null, mode: 'file', data: null, filter: 'all', query: '', open: {} };
    el.input.value = '';
    el.text.value = '';
    el.consent.checked = false;
    renderChip();
    setMode('file');
    $('results-body').replaceChildren();
    el.results.hidden = true;
    el.uploadCard.hidden = false;
    document.getElementById('upload').scrollIntoView({ behavior: 'smooth' });
  }

  /* ---------- מילון מונחים ---------- */
  var gl = { all: [], filter: 'all', q: '' };
  function renderGlossary() {
    var box = $('glossary-list');
    box.replaceChildren();
    var list = gl.all.filter(function (g) {
      if (gl.filter !== 'all' && g.type !== gl.filter) return false;
      return !gl.q || (g.title + g.what).indexOf(gl.q) !== -1;
    });
    if (!list.length) { box.append(h('p', { class: 'empty', text: 'לא נמצא מונח.' })); return; }
    list.forEach(function (g) {
      box.append(
        h('details', { class: 'faq' }, [
          h('summary', {}, [h('span', { class: 'badge ' + g.type, text: TYPE_LABEL[g.type] }), document.createTextNode(' ' + g.title)]),
          h('p', {}, [h('strong', { text: 'מה זה? ' }), document.createTextNode(g.what)]),
          h('p', {}, [h('strong', { text: 'למה זה בתלוש? ' }), document.createTextNode(g.why)]),
        ])
      );
    });
  }
  fetch('/api/glossary').then(function (r) { return r.json(); }).then(function (data) {
    gl.all = data;
    var chips = $('glossary-chips');
    [['all', 'הכל'], ['earning', 'תשלומים'], ['deduction', 'ניכויים'], ['employer', 'הפרשות מעסיק'], ['info', 'מידע'], ['summary', 'סיכומים']]
      .forEach(function (f) {
        chips.append(h('button', {
          class: 'chip', type: 'button', text: f[1], 'data-f': f[0], 'aria-pressed': String(f[0] === 'all'),
          onclick: function () {
            gl.filter = f[0];
            chips.querySelectorAll('.chip').forEach(function (c) { c.setAttribute('aria-pressed', String(c.dataset.f === gl.filter)); });
            renderGlossary();
          },
        }));
      });
    $('glossary-search').addEventListener('input', function (e) { gl.q = e.target.value.trim(); renderGlossary(); });
    renderGlossary();
  }).catch(function () {
    $('glossary-list').append(h('p', { class: 'empty', text: 'לא ניתן לטעון את המילון כרגע.' }));
  });

  setMode('file');
})();
