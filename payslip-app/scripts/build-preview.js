'use strict';
/**
 * בונה קובץ HTML יחיד (dist/preview.html) לתצוגה מקדימה סטטית:
 * מנוע הניתוח רץ בדפדפן, ובלי שרת (אין OCR/PDF). מיועד לבחינת העיצוב והחוויה בלבד.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pub = (f) => fs.readFileSync(path.join(root, 'public', f), 'utf8');
const src = (f) => fs.readFileSync(path.join(root, 'src', f), 'utf8');

function between(html, open, close) {
  const a = html.indexOf(open);
  const b = html.indexOf(close, a);
  if (a < 0 || b < 0) throw new Error('marker not found: ' + open);
  return html.slice(a, b + close.length);
}
function patch(text, from, to) {
  if (!text.includes(from)) throw new Error('patch target missing: ' + from.slice(0, 40));
  return text.split(from).join(to);
}

const index = pub('index.html');
const header = between(index, '<header class="site-header">', '</header>');
const footer = between(index, '<footer class="site-footer">', '</footer>');
const homeMain = between(index, '<main id="main">', '</main>');

const legal = ['privacy', 'terms', 'accessibility']
  .map((n) => {
    const art = between(pub(n + '.html'), '<article class="prose">', '</article>');
    return `<section class="container legal-view" id="view-${n}" hidden>
      <p><a href="#" class="back-link">← חזרה לדף הראשי</a></p>${art}</section>`;
  })
  .join('\n');

let appJs = pub('js/app.js');
appJs = patch(
  appJs,
  "h('button', { class: 'btn', type: 'button', text: '🖨️ הדפסה / שמירה כ-PDF', onclick: function () { window.print(); } }),",
  ''
);
let commonJs = patch(pub('js/common.js'), '/accessibility.html', '#accessibility');

const shim = `
(function () {
  var G = (function () { var module = { exports: {} }; ${src('glossary.js')}\n return module.exports; })();
  var A = (function () { var module = { exports: {} }; var require = function () { return G; }; ${src('analyzer.js')}\n return module.exports; })();
  var realFetch = window.fetch ? window.fetch.bind(window) : null;
  function json(status, body) {
    return Promise.resolve(new Response(JSON.stringify(body), { status: status, headers: { 'Content-Type': 'application/json' } }));
  }
  window.fetch = function (url, opts) {
    if (url === '/api/glossary') {
      return json(200, G.GLOSSARY.map(function (g) { return { id: g.id, type: g.type, title: g.title, what: g.what, why: g.why }; }));
    }
    if (url === '/api/analyze-text') {
      var text = '';
      try { text = JSON.parse(opts.body).text || ''; } catch (e) {}
      return json(200, Object.assign({ ok: true, source: 'text' }, A.analyzePayslip(text)));
    }
    if (url === '/api/analyze') {
      return json(422, { error: 'PREVIEW', message: 'בתצוגה המקדימה אין שרת סריקה, ולכן לא נשלח ולא נקרא שום קובץ. הדביקו טקסט בלשונית "הדבקת טקסט" או לחצו "נסו עם תלוש לדוגמה". בגרסה האמיתית הקובץ נסרק בשרת.' });
    }
    return realFetch ? realFetch(url, opts) : json(404, {});
  };

  /* ניווט בין הדף הראשי לדפים המשפטיים באמצעות #עוגן */
  var VIEWS = ['privacy', 'terms', 'accessibility'];
  var home = document.getElementById('home-view');
  function route() {
    var id = (location.hash || '').replace('#', '');
    var isLegal = VIEWS.indexOf(id) >= 0;
    home.hidden = isLegal;
    VIEWS.forEach(function (v) { document.getElementById('view-' + v).hidden = v !== id; });
    var target = isLegal ? document.getElementById('view-' + id) : id ? document.getElementById(id) : null;
    if (target) target.scrollIntoView(); else window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  document.addEventListener('DOMContentLoaded', route);
})();
`;

let body = `${header}
<div id="home-view">
  <aside class="preview-note container" role="note"><strong>תצוגה מקדימה.</strong> הסריקה האמיתית (OCR ו-PDF) רצה בשרת ולכן לא זמינה כאן. אפשר ללחוץ "נסו עם תלוש לדוגמה" או להדביק טקסט. הכול נשאר בדפדפן שלכם.</aside>
  ${homeMain}
</div>
<main class="container">${legal}</main>
${footer}`;
body = patch(body, 'href="/privacy.html"', 'href="#privacy"');
body = patch(body, 'href="/terms.html"', 'href="#terms"');
body = patch(body, 'href="/accessibility.html"', 'href="#accessibility"');
body = patch(body, 'href="/#', 'href="#');
body = patch(body, 'href="/"', 'href="#"');
body = patch(body, ' target="_blank" rel="noopener"', '');
body = patch(body, '<main id="main">', '<div id="main">').replace('</main>\n</div>', '</div>\n</div>');

const css =
  pub('css/style.css') +
  `
.preview-note{margin-top:1rem;padding:.7rem 1rem;border-radius:12px;border:1px dashed var(--primary);background:color-mix(in srgb,var(--primary) 8%,transparent);font-size:.93rem}
.back-link{font-weight:700}
.legal-view{padding-block:1.5rem}
`;

const out = `<title>תלוש בעברית</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;800&display=swap">
<style>
${css}
</style>
<div dir="rtl" lang="he" id="app-root">
<a class="skip-link" href="#main">דלגו לתוכן הראשי</a>
${body}
</div>
<script>${pub('js/theme-init.js')}</script>
<script>${shim}</script>
<script>${commonJs}</script>
<script>${appJs}</script>
<script>document.querySelectorAll('#year').forEach(function(e){e.textContent=new Date().getFullYear();});</script>
`;
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'preview.html'), out);
console.log('dist/preview.html', Math.round(out.length / 1024) + 'KB');
