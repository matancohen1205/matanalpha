/* דף מנוי: מחיר, רכישה, הפעלה אחרי תשלום וניהול מנוי */
(function () {
  'use strict';
  var h = PS.h;
  var $ = function (id) { return document.getElementById(id); };
  var qs = new URLSearchParams(location.search);

  function status(msg, isErr) {
    var box = $('pricing-status');
    box.textContent = msg;
    box.className = 'status-line' + (isErr ? ' err' : '');
    box.hidden = !msg;
  }

  function render(m) {
    $('price-label').textContent = m.priceLabel || '';
    var box = $('pro-actions');
    box.replaceChildren();
    if (m.pro) {
      box.append(h('p', { class: 'muted', text: 'המנוי שלכם פעיל.' }));
      box.append(h('a', { class: 'btn', href: '/compare.html', text: 'להשוואת תלושים' }));
      if (m.portal) {
        box.append(document.createTextNode(' '), h('button', { class: 'btn btn-ghost', type: 'button', text: 'ניהול מנוי וביטול',
          onclick: function () { PS.post('/api/billing/portal').then(function (r) { if (r.ok) location.href = r.body.url; else status(r.body.message || 'לא ניתן לפתוח את ניהול המנוי.', true); }); } }));
      }
      box.append(document.createTextNode(' '), h('button', { class: 'btn btn-ghost', type: 'button', text: 'ניתוק מהמכשיר',
        onclick: function () { PS.post('/api/billing/logout').then(function () { PS.me(true).then(render); }); } }));
      return;
    }
    if (!m.configured) {
      box.append(h('p', { class: 'muted', text: 'התשלומים עדיין לא הופעלו באתר, ולכן אי אפשר להצטרף כרגע.' }));
    } else {
      box.append(h('button', { class: 'btn', type: 'button', id: 'buy', text: 'הצטרפות ל-Pro', onclick: function () {
        $('buy').disabled = true;
        PS.post('/api/billing/checkout').then(function (r) {
          if (r.ok && r.body.url) location.href = r.body.url;
          else { status(r.body.message || 'לא הצלחנו לפתוח את דף התשלום.', true); $('buy').disabled = false; }
        });
      } }));
    }
    if (m.devUnlock) {
      box.append(document.createTextNode(' '), h('button', { class: 'btn btn-ghost', type: 'button', text: 'הפעלה לבדיקה (פיתוח בלבד)',
        onclick: function () { PS.post('/api/billing/dev-activate').then(function () { PS.me(true).then(render); }); } }));
    }
  }

  var sid = qs.get('session_id');
  var done = Promise.resolve();
  if (sid) {
    status('מאמתים את התשלום…');
    done = PS.post('/api/billing/activate', { session_id: sid }).then(function (r) {
      history.replaceState(null, '', '/pricing.html');
      if (r.ok) status('התשלום התקבל, והמנוי פעיל. תודה!');
      else status(r.body.message || 'לא הצלחנו לאמת את התשלום. אם חויבתם, פנו אלינו.', true);
    });
  } else if (qs.get('canceled')) {
    status('התשלום בוטל ולא בוצע חיוב.', true);
  }
  done.then(function () { return PS.me(true); }).then(function (m) {
    render(m);
    var b = document.getElementById('pro-badge');
    if (b) b.hidden = !m.pro;
  });
})();
