/* תרגום ממשק: עברית היא ברירת המחדל. שפות נוספות נטענות מ-/i18n/<lang>.json ומוחלות על ה-DOM.
   מחרוזת שאין לה תרגום נשארת בעברית (נסיגה בטוחה). החלפת שפה טוענת את הדף מחדש. */
(function () {
  'use strict';
  var LANGS = { he: { name: 'עברית', dir: 'rtl' }, en: { name: 'English', dir: 'ltr' }, ru: { name: 'Русский', dir: 'ltr' }, ar: { name: 'العربية', dir: 'rtl' } };
  var KEY = 'ps-lang';
  var lang = 'he';
  try { var s = localStorage.getItem(KEY); if (LANGS[s]) lang = s; } catch (e) { /* ללא אחסון */ }
  var ATTRS = ['placeholder', 'aria-label', 'title', 'alt', 'content'];
  var cur = { dict: {}, pats: [] };
  var stores = {};

  function norm(s) { return s.replace(/\s+/g, ' ').trim(); }
  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function tr(text, st) {
    st = st || cur;
    var dict = st.dict, pats = st.pats;
    var t = norm(text);
    if (!t) return null;
    if (Object.prototype.hasOwnProperty.call(dict, t)) return dict[t];
    // הפשטת מספרים: "מס {n}%" מתאים לכל מספר, והמספרים מוחזרים לפי הסדר
    var nums = [];
    var abs = t.replace(/\d+(?:[.,]\d+)*/g, function (m) { nums.push(m); return '{n}'; });
    if (nums.length && Object.prototype.hasOwnProperty.call(dict, abs)) {
      var k = 0;
      return dict[abs].replace(/\{n\}/g, function () { return nums[k++] || ''; });
    }
    // "שם סעיף 1,234.00": מתרגמים את השם ומשאירים את המספר
    var tm = /^(.*\S)\s+(\d[\d,.]*)$/.exec(t);
    if (tm) { var head = tr(tm[1], st); if (head != null) return head + ' ' + tm[2]; }
    for (var i = 0; i < pats.length; i++) {
      var m = pats[i].re.exec(t);
      if (m) {
        return pats[i].to.replace(/\{(\d)\}/g, function (_, k) {
          var v = m[+k + 1];
          var inner = tr(v, st);
          return inner == null ? v : inner;
        });
      }
    }
    return null;
  }

  function keepSpace(orig, translated) {
    var lead = /^\s/.test(orig) ? ' ' : '', trail = /\s$/.test(orig) ? ' ' : '';
    return (lead + translated + trail).replace(/\u2423/g, ' ').replace(/^ {2,}/, ' ').replace(/ {2,}$/, ' ');
  }

  function doText(node) {
    var p = node.parentNode;
    if (!p || /^(SCRIPT|STYLE|NOSCRIPT|CODE|PRE|TEXTAREA)$/.test(p.nodeName) || p.closest('[data-no-i18n]')) return;
    var r = tr(node.nodeValue);
    if (r != null) node.nodeValue = keepSpace(node.nodeValue, r);
  }
  function doEl(el) {
    if (el.nodeType !== 1 || el.closest('[data-no-i18n]')) return;
    ATTRS.forEach(function (a) {
      if (!el.hasAttribute(a)) return;
      if (a === 'content' && !(el.nodeName === 'META' && /^(description|og:description|og:title)$/.test(el.getAttribute('name') || el.getAttribute('property') || ''))) return;
      var r = tr(el.getAttribute(a));
      if (r != null) el.setAttribute(a, r);
    });
  }
  function walk(root) {
    if (root.nodeType === 3) return doText(root);
    if (root.nodeType !== 1) return;
    doEl(root);
    var w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    var n;
    while ((n = w.nextNode())) { if (n.nodeType === 3) doText(n); else doEl(n); }
  }

  function switcher() {
    var host = document.querySelector('.header-inner');
    if (!host || document.getElementById('lang-select')) return;
    var sel = document.createElement('select');
    sel.id = 'lang-select';
    sel.className = 'lang-select';
    sel.setAttribute('aria-label', 'Language / שפה');
    sel.setAttribute('data-no-i18n', '');
    Object.keys(LANGS).forEach(function (k) {
      var o = document.createElement('option');
      o.value = k; o.textContent = LANGS[k].name; o.lang = k;
      if (k === lang) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () {
      try { localStorage.setItem(KEY, sel.value); } catch (e) { /* ignore */ }
      location.reload();
    });
    var theme = document.getElementById('theme-toggle');
    host.insertBefore(sel, theme || null);
  }

  var LEGAL_NOTE = {
    en: 'This legal page is available in Hebrew only. The Hebrew text is the binding version.',
    ru: 'Эта юридическая страница доступна только на иврите. Обязательной является версия на иврите.',
    ar: 'هذه الصفحة القانونية متاحة بالعبرية فقط. النص العبري هو النسخة الملزمة.'
  };
  function legalNote() {
    var art = document.querySelector('article.prose');
    if (!art || !LEGAL_NOTE[lang] || !/^\/(privacy|terms|accessibility)(\.html)?$/.test(location.pathname)) return;
    var n = document.createElement('p');
    n.className = 'draft-note';
    n.setAttribute('data-no-i18n', '');
    n.lang = lang; n.dir = LANGS[lang].dir;
    n.textContent = LEGAL_NOTE[lang];
    art.insertBefore(n, art.firstChild);
  }

  function apply() {
    var de = document.documentElement;
    de.lang = lang; de.dir = LANGS[lang].dir;
    if (lang === 'he') return;
    legalNote();
    walk(document.documentElement);
    if (document.title) { var t = tr(document.title); if (t != null) document.title = t; }
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        if (m.type === 'characterData') doText(m.target);
        else if (m.type === 'attributes') doEl(m.target);
        else m.addedNodes.forEach(walk);
      });
    }).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }


  function compile(j) {
    return {
      dict: j.d || {},
      pats: (j.p || []).map(function (p) {
        var re = '^' + esc(norm(p[0])).replace(/\\\{\d\\\}|\{\d\}/g, '(.+?)') + '$';
        return { re: new RegExp(re), to: p[1] };
      }),
    };
  }
  /** טוען מילון של שפה כלשהי (עם מטמון), גם אם אינה שפת האתר. עברית: אין מה לטעון. */
  function loadStore(l) {
    if (!LANGS[l] || l === 'he') return Promise.resolve(null);
    if (!stores[l]) {
      stores[l] = fetch('/i18n/' + l + '.json', { credentials: 'omit' }).then(function (r) { return r.json(); }).then(compile).catch(function () { delete stores[l]; return null; });
    }
    return stores[l];
  }
  /** זיהוי שפת טקסט לפי הכתב: עברית, ערבית, קירילית, לטינית. null אם אין אותיות. */
  function detect(text) {
    var c = { he: 0, ar: 0, ru: 0, en: 0 };
    String(text || '').replace(/[\u0590-\u05ff]/g, function () { c.he++; return ''; })
      .replace(/[\u0600-\u06ff]/g, function () { c.ar++; return ''; })
      .replace(/[\u0400-\u04ff]/g, function () { c.ru++; return ''; })
      .replace(/[A-Za-z]/g, function () { c.en++; return ''; });
    var best = null, n = 0;
    Object.keys(c).forEach(function (k) { if (c[k] > n) { n = c[k]; best = k; } });
    return best;
  }
  /** מתרגם טקסט עברי מהאתר לשפה נתונה (ללא תרגום: הטקסט המקורי) */
  function translateTo(text, l) {
    return loadStore(l).then(function (st) {
      if (!st) return text;
      var r = tr(text, st);
      return r == null ? text : r;
    });
  }
  window.PSI18n = {
    lang: function () { return lang; },
    dir: function (l) { return (LANGS[l] || LANGS.he).dir; },
    t: function (s) { var r = tr(s); return r == null ? s : r; },
    detect: detect,
    translateTo: translateTo,
  };

  function boot() {
    switcher();
    if (lang === 'he') return apply();
    loadStore(lang).then(function (st) { if (st) cur = st; apply(); });
  }

  // כיוון מיידי למניעת קפיצת פריסה
  document.documentElement.lang = lang;
  document.documentElement.dir = LANGS[lang].dir;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
