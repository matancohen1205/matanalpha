/* תרגום ממשק: עברית היא ברירת המחדל. שפות נוספות נטענות מ-/i18n/<lang>.json ומוחלות על ה-DOM.
   מחרוזת שאין לה תרגום נשארת בעברית (נסיגה בטוחה). החלפת שפה טוענת את הדף מחדש. */
(function () {
  'use strict';
  var LANGS = { he: { name: 'עברית', dir: 'rtl' }, en: { name: 'English', dir: 'ltr' }, ru: { name: 'Русский', dir: 'ltr' }, ar: { name: 'العربية', dir: 'rtl' } };
  var KEY = 'ps-lang';
  var lang = 'he';
  try { var s = localStorage.getItem(KEY); if (LANGS[s]) lang = s; } catch (e) { /* ללא אחסון */ }
  var ATTRS = ['placeholder', 'aria-label', 'title', 'alt', 'content'];
  var dict = {}, pats = [];

  function norm(s) { return s.replace(/\s+/g, ' ').trim(); }
  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function tr(text) {
    var t = norm(text);
    if (!t) return null;
    if (Object.prototype.hasOwnProperty.call(dict, t)) return dict[t];
    for (var i = 0; i < pats.length; i++) {
      var m = pats[i].re.exec(t);
      if (m) {
        return pats[i].to.replace(/\{(\d)\}/g, function (_, k) {
          var v = m[+k + 1];
          var inner = tr(v);
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

  function apply() {
    var de = document.documentElement;
    de.lang = lang; de.dir = LANGS[lang].dir;
    if (lang === 'he') return;
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

  window.PSI18n = { lang: function () { return lang; }, t: function (s) { var r = tr(s); return r == null ? s : r; } };

  function boot() {
    switcher();
    if (lang === 'he') return apply();
    fetch('/i18n/' + lang + '.json', { credentials: 'omit' }).then(function (r) { return r.json(); }).then(function (j) {
      dict = j.d || {};
      pats = (j.p || []).map(function (p) {
        var re = '^' + esc(norm(p[0])).replace(/\\\{\d\\\}|\{\d\}/g, '(.+?)') + '$';
        return { re: new RegExp(re), to: p[1] };
      });
      apply();
    }).catch(function () { apply(); });
  }

  // כיוון מיידי למניעת קפיצת פריסה
  document.documentElement.lang = lang;
  document.documentElement.dir = LANGS[lang].dir;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
