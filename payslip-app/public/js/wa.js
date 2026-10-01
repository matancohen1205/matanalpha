/* עמוד חיבור הוואטסאפ */
(function () {
  'use strict';
  var h = PS.h;
  var box = document.getElementById('wa-state');
  var poll = null;

  function msg(text, cls) { return h('p', { class: cls || 'muted', text: text }); }
  function stopPoll() { if (poll) { clearInterval(poll); poll = null; } }

  function render(s) {
    box.replaceChildren();
    if (!s.pro) {
      box.append(msg('התראות בוואטסאפ זמינות למנויי Pro.'), h('a', { class: 'btn', href: '/pricing.html', text: 'לפרטי המנוי' }));
      return;
    }
    if (!s.configured) {
      box.append(msg('שירות הוואטסאפ עדיין לא הופעל באתר. נעדכן כשיהיה זמין.'));
      return;
    }
    if (s.linked) {
      stopPoll();
      box.append(
        h('div', { class: 'status-line' }, [h('strong', { text: 'מחובר ✅ ' }), h('span', { class: 'ltr-num', text: s.phone })]),
        msg('שלחו לבוט תמונה או PDF של התלוש בוואטסאפ. כדי להפסיק, שלחו לבוט "הפסק" או לחצו כאן.'),
        h('div', { class: 'form-actions' }, [h('button', { class: 'btn btn-ghost', type: 'button', text: 'ניתוק ומחיקת הנתונים',
          onclick: function () { PS.post('/api/whatsapp/unlink').then(refresh); } })])
      );
      return;
    }
    var consent = h('input', { type: 'checkbox', id: 'wa-consent' });
    var go = h('button', { class: 'btn', type: 'button', text: 'חיבור וואטסאפ', disabled: 'disabled' });
    var err = h('div', { class: 'alert', role: 'alert', hidden: 'hidden' });
    consent.addEventListener('change', function () { if (consent.checked) go.removeAttribute('disabled'); else go.setAttribute('disabled', 'disabled'); });
    go.addEventListener('click', function () {
      err.hidden = true;
      PS.post('/api/whatsapp/link', { consent: consent.checked }).then(function (r) {
        if (!r.ok) { err.textContent = r.body.message || 'לא הצלחנו ליצור קישור.'; err.hidden = false; return; }
        window.open(r.body.url, '_blank', 'noopener');
        box.replaceChildren(
          msg('נפתח צ׳אט וואטסאפ עם הודעת חיבור מוכנה. שלחו אותה, והעמוד יתעדכן אוטומטית. הקישור תקף ' + r.body.expiresInMinutes + ' דקות.'),
          h('a', { class: 'btn btn-ghost', href: r.body.url, target: '_blank', rel: 'noopener', text: 'לא נפתח? לחצו כאן' })
        );
        stopPoll();
        var tries = 0;
        poll = setInterval(function () {
          if (++tries > 200) return stopPoll();
          fetch('/api/whatsapp/status', { credentials: 'same-origin' }).then(function (x) { return x.json(); }).then(function (st) { if (st.linked) render(st); });
        }, 3000);
      });
    });
    box.append(
      h('label', { class: 'check', for: 'wa-consent' }, [consent, h('span', {}, [
        document.createTextNode('אני מאשר/ת לקבל הודעות וואטסאפ משירות "תלוש בעברית" (סיכומי תלוש, התראות ותזכורת חודשית), ומסכים/ה ל'),
        h('a', { href: '/privacy.html', text: 'מדיניות הפרטיות' }), document.createTextNode('. אפשר להפסיק בכל עת.')])]),
      h('div', { class: 'form-actions' }, [go]), err
    );
  }

  function refresh() {
    return fetch('/api/whatsapp/status', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(render)
      .catch(function () { box.replaceChildren(msg('לא ניתן לטעון את הסטטוס כרגע.')); });
  }
  window.PS_WA_REFRESH = refresh;
  refresh();
})();
