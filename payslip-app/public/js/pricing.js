/* דף מנוי: מחיר, רכישה, הפעלה אחרי תשלום וניהול מנוי */
(function () {
  'use strict';
  var h = PS.h;
  var $ = function (id) { return document.getElementById(id); };
  var qs = new URLSearchParams(location.search);
  var state = { plan: null };

  function status(msg, isErr) {
    var box = $('pricing-status');
    box.textContent = msg;
    box.className = 'status-line' + (isErr ? ' err' : '');
    box.hidden = !msg;
  }

  function render(m) {
    var plans = m.plans || [{ id: 'monthly', label: m.priceLabel }];
    var toggle = $('plan-toggle');
    toggle.replaceChildren();
    toggle.hidden = plans.length < 2;
    if (!state.plan || !plans.some(function (p) { return p.id === state.plan; })) state.plan = plans[0].id;
    plans.forEach(function (p) {
      var b = h('button', { type: 'button', class: 'plan-opt', role: 'radio', 'aria-checked': String(p.id === state.plan), text: p.id === 'yearly' ? 'שנתי' : 'חודשי',
        onclick: function () { state.plan = p.id; render(m); } });
      toggle.append(b);
    });
    $('price-label').textContent = (plans.find(function (p) { return p.id === state.plan; }) || plans[0]).label || '';
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
      box.append(h('button', { class: 'btn', type: 'button', id: 'buy', text: state.plan === 'yearly' ? 'הצטרפות ל-Pro שנתי' : 'הצטרפות ל-Pro', onclick: function () {
        $('buy').disabled = true;
        PS.post('/api/billing/checkout', { plan: state.plan }).then(function (r) {
          if (r.ok && r.body.url) location.href = r.body.url;
          else { status(r.body.message || 'לא הצלחנו לפתוח את דף התשלום.', true); $('buy').disabled = false; }
        });
      } }));
    }
    box.append(recoverBox());
    if (m.devUnlock) {
      box.append(document.createTextNode(' '), h('button', { class: 'btn btn-ghost', type: 'button', text: 'הפעלה לבדיקה (פיתוח בלבד)',
        onclick: function () { PS.post('/api/billing/dev-activate').then(function () { PS.me(true).then(render); }); } }));
    }
  }

  function recoverBox() {
    var det = h('details', { class: 'faq recover' }, [h('summary', { text: 'כבר מנוי? שחזור גישה באימייל' })]);
    var email = h('input', { type: 'text', inputmode: 'email', id: 'rec-email', placeholder: 'האימייל שבו שילמתם', 'aria-label': 'אימייל לשחזור', maxlength: '120', autocomplete: 'email' });
    var btn = h('button', { class: 'btn btn-sm', type: 'button', text: 'שליחת קישור שחזור' });
    var msg = h('p', { class: 'muted small', role: 'status' });
    btn.addEventListener('click', function () {
      msg.textContent = '';
      btn.disabled = true;
      PS.post('/api/billing/recover', { email: email.value }).then(function (r) {
        msg.textContent = r.body.message || (r.ok ? 'נשלח.' : 'שגיאה.');
        btn.disabled = false;
      });
    });
    det.append(h('div', { class: 'recover-row' }, [email, btn]), msg);
    return det;
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
  } else if (qs.get('recover')) {
    status('מאמתים את קישור השחזור…');
    var tok = qs.get('recover');
    done = PS.post('/api/billing/recover/confirm', { token: tok }).then(function (r) {
      history.replaceState(null, '', '/pricing.html');
      if (r.ok) status('הגישה למנוי שוחזרה במכשיר הזה. ברוכים השבים!');
      else status(r.body.message || 'לא הצלחנו לשחזר את הגישה.', true);
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
