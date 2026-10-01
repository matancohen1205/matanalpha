/* פופ-אפ המלצה על מנוי Pro: מופיע אחרי שהמשתמש קיבל ערך (ניתוח תלוש / שימוש במחשבון), פעם אחת בסשן */
(function () {
  'use strict';
  var KEY = 'ps-promo-until';
  var SHOWN = 'ps-promo-shown';
  var h = PS.h;
  var opened = false;

  function suppressed() {
    if (location.pathname.indexOf('pricing') >= 0 || location.hash === '#pricing') return true;
    try {
      if (sessionStorage.getItem(SHOWN)) return true;
      var until = Number(localStorage.getItem(KEY) || 0);
      if (until > Date.now()) return true;
    } catch (e) {}
    return false;
  }
  function snooze(days) {
    try { localStorage.setItem(KEY, String(Date.now() + days * 864e5)); } catch (e) {}
  }

  function open(m) {
    if (opened) return;
    opened = true;
    try { sessionStorage.setItem(SHOWN, '1'); } catch (e) {}
    var previous = document.activeElement;

    var close = function (days) {
      snooze(days);
      overlay.remove();
      document.removeEventListener('keydown', onKey, true);
      document.body.classList.remove('modal-open');
      if (previous && previous.focus) previous.focus();
    };

    var cta = h('a', { class: 'btn', href: '/pricing.html', text: 'לפרטי מנוי Pro', onclick: function () { close(7); } });
    var later = h('button', { class: 'btn btn-ghost', type: 'button', text: 'לא עכשיו', onclick: function () { close(7); } });
    var never = h('button', { class: 'link-btn', type: 'button', text: 'לא להציג שוב', onclick: function () { close(60); } });
    var x = h('button', { class: 'icon-btn promo-x', type: 'button', 'aria-label': 'סגירה', text: '✕', onclick: function () { close(7); } });

    var dialog = h('div', { class: 'promo', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'promo-title', 'aria-describedby': 'promo-desc' }, [
      x,
      h('span', { class: 'pro-tag', text: 'Pro' }),
      h('h2', { id: 'promo-title', text: 'רוצים לראות איך השכר שלכם משתנה לאורך זמן?' }),
      h('p', { id: 'promo-desc', class: 'muted', text: 'ניתחתם תלוש אחד. עם Pro אפשר להשוות עד 12 חודשים ולגלות שינויים שקל לפספס.' }),
      h('ul', { class: 'promo-list' }, [
        h('li', { text: 'גרף מגמות וטבלת שינויים בין חודשים' }),
        h('li', { text: 'התראה על סעיף שנעלם או על קפיצה במס' }),
        h('li', { text: 'ייצוא ההשוואה לקובץ CSV' }),
      ]),
      h('p', { class: 'promo-price', text: (m && m.priceLabel) || '' }),
      h('div', { class: 'promo-actions' }, [cta, later]),
      h('div', { class: 'promo-foot' }, [never, h('span', { class: 'muted small', text: 'ביטול בכל עת. התלושים שלכם לא נשמרים.' })]),
    ]);
    var overlay = h('div', { class: 'promo-overlay', dir: 'rtl', lang: 'he' }, [dialog]);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(7); });

    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); close(7); return; }
      if (e.key !== 'Tab') return;
      var f = dialog.querySelectorAll('a[href], button');
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKey, true);
    document.body.append(overlay);
    document.body.classList.add('modal-open');
    cta.focus();
  }

  function maybeShow() {
    if (opened || suppressed()) return;
    PS.me().then(function (m) {
      if (m.pro) return;
      setTimeout(function () { if (!suppressed()) open(m); }, 1200);
    });
  }
  document.addEventListener('ps:value', maybeShow);
})();
