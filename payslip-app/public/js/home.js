/* חיות בדף הבית: מספרים עולים, כניסה עדינה בגלילה וגלריית צילומי מסך */
(function () {
  'use strict';
  var root = document.documentElement;
  var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches || root.getAttribute('data-a11y-motion') === 'off';

  /* גלריה */
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.g-tab'));
  function selectTab(t) {
    tabs.forEach(function (o) {
      var on = o === t;
      o.setAttribute('aria-selected', String(on));
      o.tabIndex = on ? 0 : -1;
      document.getElementById(o.getAttribute('aria-controls')).hidden = !on;
    });
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { selectTab(t); });
    t.addEventListener('keydown', function (e) {
      var d = e.key === 'ArrowLeft' ? 1 : e.key === 'ArrowRight' ? -1 : 0;
      if (!d) return;
      var n = tabs[(i + d + tabs.length) % tabs.length];
      n.focus(); selectTab(n);
    });
  });
  if (tabs.length) selectTab(tabs[0]);

  if (calm || !('IntersectionObserver' in window)) return;

  /* כניסה עדינה: התוכן תמיד גלוי, רק זז קלות */
  root.classList.add('rv-ready');
  var seen = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('in'); seen.unobserve(e.target); }
    });
  }, { rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('.section h2, .section .card, .stat-pill, .g-frame, .player').forEach(function (el) {
    el.classList.add('reveal');
    seen.observe(el);
  });

  /* מספרים עולים */
  var counter = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      counter.unobserve(e.target);
      var to = Number(e.target.dataset.to), t0 = performance.now(), D = 1200;
      (function step(now) {
        var p = Math.min(1, (now - t0) / D);
        e.target.textContent = String(Math.round(to * (1 - Math.pow(1 - p, 3))));
        if (p < 1) requestAnimationFrame(step);
      })(t0);
    });
  }, { threshold: 0.6 });
  document.querySelectorAll('.count').forEach(function (el) { counter.observe(el); });
})();
