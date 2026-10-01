/* עמוד יצירת קשר: ולידציה, שליחה, ודרכי קשר מהשרת */
(function () {
  'use strict';
  var h = PS.h;
  var $ = function (id) { return document.getElementById(id); };
  var form = $('contact-form');
  var t0 = Date.now();

  var topic = new URLSearchParams(location.search).get('topic');
  if (topic && $('c-topic').querySelector('option[value="' + topic + '"]')) $('c-topic').value = topic;

  $('open-chat').addEventListener('click', function () { var f = $('chat-fab'); if (f) f.click(); });

  fetch('/api/site-config').then(function (r) { return r.json(); }).then(function (c) {
    var ul = $('contact-ways');
    if (c.supportEmail) ul.append(h('li', {}, [document.createTextNode('אימייל: '), h('span', { class: 'ltr-num', text: c.supportEmail })]));
    if (c.supportWhatsapp) ul.append(h('li', {}, [h('a', { href: 'https://wa.me/' + c.supportWhatsapp, target: '_blank', rel: 'noopener', text: 'וואטסאפ שירות לקוחות' })]));
    if (c.supportHours) ul.append(h('li', { text: 'שעות מענה: ' + c.supportHours }));
  }).catch(function () {});

  function setErr(id, msg) { $('e-' + id).textContent = msg || ''; var f = $('c-' + id); if (f) f.setAttribute('aria-invalid', msg ? 'true' : 'false'); }
  ['name', 'email', 'phone', 'message'].forEach(function (k) { $('c-' + k).addEventListener('input', function () { setErr(k, ''); }); });

  function validate() {
    var bad = null, ok = true;
    function fail(k, msg) { setErr(k, msg); if (!bad) bad = $(k === 'consent' ? 'c-consent' : 'c-' + k); ok = false; }
    if ($('c-name').value.trim().length < 2) fail('name', 'נא להזין שם'); else setErr('name');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test($('c-email').value.trim())) fail('email', 'נא להזין כתובת אימייל תקינה'); else setErr('email');
    var ph = $('c-phone').value.trim();
    if (ph && !/^[0-9+\-\s()]{7,20}$/.test(ph)) fail('phone', 'מספר הטלפון אינו תקין'); else setErr('phone');
    if ($('c-message').value.trim().length < 10) fail('message', 'נא לכתוב לפחות כמה מילים'); else setErr('message');
    if (!$('c-consent').checked) fail('consent', 'יש לאשר את מדיניות הפרטיות'); else $('e-consent').textContent = '';
    if (bad) bad.focus();
    return ok;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    $('c-error').hidden = true;
    if (!validate()) return;
    var btn = $('c-send');
    btn.disabled = true;
    PS.post('/api/contact', {
      topic: $('c-topic').value, name: $('c-name').value, email: $('c-email').value, phone: $('c-phone').value,
      message: $('c-message').value, consent: $('c-consent').checked, website: $('c-website').value, elapsedMs: Date.now() - t0,
    }).then(function (r) {
      if (r.ok) {
        form.hidden = true;
        var done = $('c-done');
        done.replaceChildren(h('strong', { text: 'הפנייה התקבלה, תודה! ' }), document.createTextNode('מספר הפנייה שלכם: '), h('span', { class: 'ltr-num', text: r.body.ticket }), document.createTextNode('. נחזור אליכם לכתובת ' + $('c-email').value.trim() + ' בהקדם האפשרי.'));
        done.hidden = false;
        done.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (r.body.errors) Object.keys(r.body.errors).forEach(function (k) { setErr(k, r.body.errors[k]); if (k === 'consent') $('e-consent').textContent = r.body.errors[k]; });
      $('c-error').textContent = r.body.message || 'לא הצלחנו לשלוח. נסו שוב.';
      $('c-error').hidden = false;
      btn.disabled = false;
    }).catch(function () {
      $('c-error').textContent = 'אירעה שגיאת רשת. נסו שוב.';
      $('c-error').hidden = false;
      btn.disabled = false;
    });
  });
})();
