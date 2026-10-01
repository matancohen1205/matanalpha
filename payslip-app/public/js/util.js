/* כלים משותפים לדפי הכלים: בניית DOM בטוחה, פורמט כסף, סטטוס מנוי */
(function () {
  'use strict';
  var nf = new Intl.NumberFormat('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var NS = 'http://www.w3.org/2000/svg';

  function h(tag, props, children) {
    var n = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        if (k === 'class') n.className = props[k];
        else if (k === 'text') n.textContent = props[k];
        else if (k === 'style') n.style.cssText = props[k];
        else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), props[k]);
        else n.setAttribute(k, props[k]);
      });
    }
    (children || []).forEach(function (c) { if (c) n.append(c); });
    return n;
  }
  function svg(tag, attrs, children) {
    var n = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    (children || []).forEach(function (c) { if (c) n.append(c); });
    return n;
  }
  function money(n) { return n === null || n === undefined || isNaN(n) ? '—' : nf.format(n) + ' ₪'; }
  function num(v) {
    var n = Number(String(v).replace(/,/g, '').trim());
    return isFinite(n) ? n : NaN;
  }
  function store(kind) {
    var s = kind === 'local' ? 'localStorage' : 'sessionStorage';
    return {
      get: function (k) { try { return window[s].getItem(k); } catch (e) { return null; } },
      set: function (k, v) { try { window[s].setItem(k, v); } catch (e) {} },
    };
  }

  var mePromise = null;
  function me(force) {
    if (!mePromise || force) {
      mePromise = fetch('/api/billing/me', { credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .catch(function () { return { pro: false, configured: false }; })
        .then(function (m) {
          var b = document.getElementById('pro-badge');
          if (b) b.hidden = !m.pro;
          return m;
        });
    }
    return mePromise;
  }
  function post(url, body) {
    return fetch(url, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, body: j }; }); });
  }

  window.PS = { h: h, svg: svg, money: money, num: num, store: store, me: me, post: post };

  me();
})();
