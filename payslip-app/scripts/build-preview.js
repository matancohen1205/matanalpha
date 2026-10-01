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

const LEGAL = ['privacy', 'terms', 'accessibility'];
const TOOLS = ['calculator', 'credits', 'compare', 'pricing', 'whatsapp'];
const VIEWS_ALL = LEGAL.concat(TOOLS);
const legal = LEGAL.map((n) => {
  const art = between(pub(n + '.html'), '<article class="prose">', '</article>');
  return `<section class="container legal-view" id="view-${n}" hidden>
      <p><a href="#" class="back-link">← חזרה לדף הראשי</a></p>${art}</section>`;
}).join('\n');
const tools = TOOLS.map((n) => {
  const main = between(pub(n + '.html'), '<main id="main" class="container tool">', '</main>')
    .replace('<main id="main" class="container tool">', '<div class="tool">')
    .replace(/<\/main>$/, '</div>');
  return `<section class="container tool-view" id="view-${n}" hidden>${main}</section>`;
}).join('\n');

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
  var C = (function () { var module = { exports: {} }; ${src('compare.js')}\n return module.exports; })();
  var proOn = false, waLinked = false, waLinking = false, waPolls = 0;
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
    if (url === '/api/whatsapp/status') { waPolls += waLinking ? 1 : 0; return json(200, { configured: true, pro: proOn, linked: waLinked || waPolls >= 2, phone: '•••••••567' }); }
    if (url === '/api/whatsapp/link') { if (!proOn) return json(402, { message: 'החיבור זמין למנויי Pro.' }); waLinking = true; return json(200, { url: '#whatsapp', expiresInMinutes: 30 }); }
    if (url === '/api/whatsapp/unlink') { waLinked = false; waLinking = false; waPolls = -99; return json(200, { linked: false }); }
    if (url === '/api/billing/me') return json(200, { pro: proOn, configured: false, devUnlock: true, priceLabel: '19.90 ₪ לחודש' });
    if (url === '/api/billing/dev-activate') { proOn = true; return json(200, { pro: true }); }
    if (url === '/api/billing/logout') { proOn = false; return json(200, { pro: false }); }
    if (url === '/api/billing/checkout' || url === '/api/billing/portal' || url === '/api/billing/activate') return json(503, { error: 'PREVIEW', message: 'התשלום אינו פעיל בתצוגה המקדימה.' });
    if (url === '/api/compare') {
      if (!proOn) return json(402, { error: 'PRO_REQUIRED' });
      try { return json(200, Object.assign({ ok: true }, C.compareSlips(JSON.parse(opts.body)))); } catch (e) { return json(400, { message: 'נדרשים לפחות שני תלושים תקינים.' }); }
    }
    if (url === '/api/analyze') {
      return json(422, { error: 'PREVIEW', message: 'בתצוגה המקדימה אין שרת סריקה, ולכן לא נשלח ולא נקרא שום קובץ. הדביקו טקסט בלשונית "הדבקת טקסט" או לחצו "נסו עם תלוש לדוגמה". בגרסה האמיתית הקובץ נסרק בשרת.' });
    }
    return realFetch ? realFetch(url, opts) : json(404, {});
  };

  /* ניווט בין הדף הראשי לדפים המשפטיים באמצעות #עוגן */
  var VIEWS = ${JSON.stringify(VIEWS_ALL)};
  var home = document.getElementById('home-view');
  function route() {
    var id = (location.hash || '').replace('#', '');
    var isLegal = VIEWS.indexOf(id) >= 0;
    home.hidden = isLegal;
    VIEWS.forEach(function (v) { document.getElementById('view-' + v).hidden = v !== id; });
    if (id === 'whatsapp' && window.PS_WA_REFRESH) window.PS_WA_REFRESH();
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
<main class="container-wrap">${legal}
${tools}</main>
${footer}`;
VIEWS_ALL.forEach((n) => { body = body.split(`href="/${n}.html"`).join(`href="#${n}"`); });
body = patch(body, 'href="/#', 'href="#');
const mark = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(root, 'public', 'logo-mark.svg')).toString('base64');
body = body.split('src="/logo-mark.svg"').join(`src="${mark}"`);
body = patch(body, 'href="/"', 'href="#"');
body = patch(body, ' target="_blank" rel="noopener"', '');
body = patch(body, '<main id="main">', '<div id="main">').replace('</main>\n</div>', '</div>\n</div>');
body = body.replace(/<a class="nav-link" href="#">[^<]*<\/a>/, (m) => m);

const css =
  pub('css/style.css') +
  `
.preview-note{margin-top:1rem;padding:.7rem 1rem;border-radius:12px;border:1px dashed var(--primary);background:color-mix(in srgb,var(--primary) 8%,transparent);font-size:.93rem}
.back-link{font-weight:700}
.legal-view,.tool-view{padding-block:1.5rem}
.container-wrap{display:block}
.tool-view .tool{padding-block:.5rem}
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
<script>${pub('js/tax-core.js')}</script>
<script>${pub('js/util.js')}</script>
<script>${commonJs}</script>
<script>${pub('js/promo.js').split("href: '/pricing.html'").join("href: '#pricing'")}</script>
<script>${appJs}</script>
<script>${pub('js/calc.js')}</script>
<script>${pub('js/credits.js')}</script>
<script>${pub('js/compare.js').split("href: '/pricing.html'").join("href: '#pricing'")}</script>
<script>${pub('js/wa.js').split("window.open(r.body.url, '_blank', 'noopener');").join('').split("href: '/pricing.html'").join("href: '#pricing'")}</script>
<script>${pub('js/pricing.js').split("href: '/compare.html'").join("href: '#compare'")}</script>
<script>document.querySelectorAll('#year').forEach(function(e){e.textContent=new Date().getFullYear();});</script>
`;
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'preview.html'), out);
console.log('dist/preview.html', Math.round(out.length / 1024) + 'KB');
