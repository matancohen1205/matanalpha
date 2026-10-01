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
const TOOLS = ['calculator', 'credits', 'compare', 'pricing', 'whatsapp', 'about', 'contact', 'rights'];
const VIEWS_ALL = LEGAL.concat(TOOLS);
const ACCOUNT_VIEWS = ['login', 'signup'];
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

const accountMain = between(pub('account.html'), '<main id="main" class="container tool">', '</main>')
  .replace('<main id="main" class="container tool">', '<div class="tool">')
  .replace(/<\/main>$/, '</div>')
  .split('id="r-err"').join('id="ra-err"');
const accountView = `<section class="container tool-view" id="view-account" hidden>${accountMain}</section>`;

let appJs = pub('js/app.js');
appJs = patch(
  appJs,
  "h('button', { class: 'btn', type: 'button', text: '🖨️ הדפסה / שמירה כ-PDF', onclick: function () { window.print(); } }),",
  ''
);
let commonJs = patch(pub('js/common.js'), '/accessibility.html', '#accessibility');

const I18N = {};
for (const l of ['en', 'ru', 'ar']) I18N[l] = JSON.parse(fs.readFileSync(path.join(root, 'public', 'i18n', `${l}.json`), 'utf8'));
const shim = `
(function () {
  var I18N = ${JSON.stringify(I18N)};
  var G = (function () { var module = { exports: {} }; ${src('glossary.js')}\n return module.exports; })();
  var A = (function () { var module = { exports: {} }; var require = function () { return G; }; ${src('analyzer.js')}\n return module.exports; })();
  var C = (function () { var module = { exports: {} }; ${src('compare.js')}\n return module.exports; })();
  var acct = { users: {}, current: null, vaults: {} };
  function accountApi(url, o) {
    var b = {}; try { b = o.body ? JSON.parse(o.body) : {}; } catch (e) {}
    var m = (o.method || 'GET').toUpperCase(), ep = url.slice('/api/account/'.length);
    var u = acct.current && acct.users[acct.current];
    if (ep === 'me') return json(200, u ? { loggedIn: true, email: u.email, verified: false, subscriptionLinked: false, mailAvailable: true } : { loggedIn: false, mailAvailable: true });
    if (ep === 'register') {
      var em = String(b.email || '').toLowerCase();
      if (acct.users[em]) return json(409, { message: 'כבר קיים חשבון בכתובת הזו. אפשר להתחבר או לאפס סיסמה.' });
      acct.users[em] = { email: em, authKey: b.authKey, wrappedPw: b.wrappedPw, wrappedRec: b.wrappedRec };
      acct.current = em; return json(200, { ok: true, verified: false, mailSent: false });
    }
    if (ep === 'login') {
      var lu = acct.users[String(b.email || '').toLowerCase()];
      if (!lu || lu.authKey !== b.authKey) return json(401, { message: 'האימייל או הסיסמה שגויים.' });
      acct.current = lu.email; return json(200, { ok: true, wrappedPw: lu.wrappedPw, pro: false });
    }
    if (ep === 'logout') { acct.current = null; return json(200, { ok: true }); }
    if (ep === 'forgot') return json(200, { ok: true, message: 'בתצוגה המקדימה לא נשלח מייל. בגרסה האמיתית נשלח קישור לאיפוס (בתוקף 30 דקות).' });
    if (!u) return json(401, { message: 'יש להתחבר.' });
    if (ep === 'vault' && m === 'GET') { var v = acct.vaults[u.email]; return json(200, v ? { version: v.version, blob: v.blob } : { version: 0, blob: null }); }
    if (ep === 'vault' && m === 'PUT') {
      var cur = acct.vaults[u.email] || { version: 0 };
      if (cur.version !== b.version) return json(409, { message: 'הכספת עודכנה במכשיר אחר.' });
      acct.vaults[u.email] = { version: cur.version + 1, blob: b.blob }; return json(200, { ok: true, version: cur.version + 1 });
    }
    if (ep === 'delete') { delete acct.users[u.email]; acct.current = null; return json(200, { ok: true }); }
    return json(200, { ok: true });
  }
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
    if (typeof url === 'string' && url.indexOf('/i18n/') === 0) {
      var lg = url.slice(6, 8);
      return json(200, I18N[lg] || { d: {}, p: [] });
    }
    if (typeof url === 'string' && url.indexOf('/api/account/') === 0) return accountApi(url, opts || {});
    if (url === '/api/site-config') return json(200, { supportEmail: '', supportWhatsapp: '', supportHours: '', topics: {} });
    if (url === '/api/contact') return json(200, { ok: true, ticket: 'T-DEMO' });
    if (url === '/api/billing/me') return json(200, { pro: proOn, configured: false, devUnlock: true, priceLabel: '19.90 ₪ לחודש', priceLabelYearly: '199 ₪ לשנה', plans: [{ id: 'monthly', label: '19.90 ₪ לחודש' }, { id: 'yearly', label: '199 ₪ לשנה' }] });
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
  var VIEWS = ${JSON.stringify(VIEWS_ALL.concat(['account']))};
  var home = document.getElementById('home-view');
  function route() {
    var id = (location.hash || '').replace('#', '').split('?')[0];
    var vid = (id === 'login' || id === 'signup') ? 'account' : id;
    var isLegal = VIEWS.indexOf(vid) >= 0;
    home.hidden = isLegal;
    VIEWS.forEach(function (v) { document.getElementById('view-' + v).hidden = v !== vid; });
    if ((id === 'login' || id === 'signup') && window.PS_ACCOUNT_ROUTE) window.PS_ACCOUNT_ROUTE(id);
    if (id === 'whatsapp' && window.PS_WA_REFRESH) window.PS_WA_REFRESH();
    var target = isLegal ? document.getElementById('view-' + vid) : id ? document.getElementById(id) : null;
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
${tools}
${accountView}</main>
${footer}`;
VIEWS_ALL.forEach((n) => { body = body.split(`href="/${n}.html"`).join(`href="#${n}"`); });
body = body.split('href="/account.html"').join('href="#login"');
body = patch(body, 'href="/#', 'href="#');
const mark = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(root, 'public', 'logo-mark.svg')).toString('base64');
body = body.split('src="/logo-mark.svg"').join(`src="${mark}"`);
for (const n of ['explain', 'calc', 'credits', 'compare']) {
  const uri = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(root, 'public', 'img', `shot-${n}.jpg`)).toString('base64');
  body = body.split(`src="/img/shot-${n}.jpg"`).join(`src="${uri}"`);
}
body = patch(body, 'href="/"', 'href="#"');
body = patch(body, ' target="_blank" rel="noopener"', '');
body = patch(body, '<main id="main">', '<div id="main">').replace('</main>\n</div>', '</div>\n</div>');
body = body.replace(/<a class="nav-link" href="#">[^<]*<\/a>/, (m) => m);

const css =
  pub('css/style.css') + pub('css/home.css') +
  `
.preview-note{margin-top:1rem;padding:.7rem 1rem;border-radius:12px;border:1px dashed var(--primary);background:color-mix(in srgb,var(--primary) 8%,transparent);font-size:.93rem}
.back-link{font-weight:700}
#account-link{display:none}
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
<script>${pub('js/i18n.js').split('de.lang = lang; de.dir = LANGS[lang].dir;').join("de.lang = lang; de.dir = LANGS[lang].dir; var ar = document.getElementById('app-root'); if (ar) { ar.lang = lang; ar.dir = LANGS[lang].dir; }")}</script>
<script>${shim}</script>
<script>${pub('js/tax-core.js')}</script>
<script>${pub('js/util.js')}</script>
<script>${commonJs}</script>
<script>${(() => {
  let kb = pub('js/chat-kb.js');
  for (const n of VIEWS_ALL) kb = kb.split(`'/${n}.html'`).join(`'#${n}'`);
  kb = kb.split("'/#upload'").join("'#upload'").split("'/#glossary'").join("'#glossary'").split("home: '/'").join("home: '#'");
  return kb;
})()}</script>
<script>${pub('js/chatbot.js').split("if (location.pathname === '/') close();").join('close();')}</script>

<script>${pub('js/promo.js').split("href: '/pricing.html'").join("href: '#pricing'")}</script>
<script>${appJs}</script>
<script>${pub('js/explainer.js')}</script>
<script>${pub('js/home.js')}</script>
<script>${pub('js/calc.js')}</script>
<script>${pub('js/rights-core.js')}</script>
<script>${pub('js/rights.js')}</script>
<script>${pub('js/credits.js')}</script>
<script>${pub('js/vault-crypto.js')}</script>
<script>${pub('js/account-client.js')}</script>
<script>${(() => {
  let a = pub('js/account.js').split('r-err').join('ra-err');
  a = a.split("/\\/(signup|login)(\\.html)?$/.exec(location.pathname)").join("/^#(signup|login)/.exec(location.hash)");
  a = a.split("if (!m || document.getElementById('v-guest').hidden) return;").join("if (!m || document.getElementById('v-guest').hidden || document.getElementById('view-account').hidden) return;");
  a = a.split("url: '/login.html'").join("url: '#login'").split("url: '/signup.html'").join("url: '#signup'");
  a = a.split("if (location.pathname !== m.url && !qs.get('reset')) history.replaceState(null, '', m.url);").join("if (location.hash !== m.url) history.replaceState(null, '', m.url);");
  a = a.split("location.href = '/compare.html'").join("location.hash = '#compare'");
  a = a.split("history.replaceState(null, '', '/login.html')").join("history.replaceState(null, '', '#login')");
  a = a.split("history.replaceState(null, '', location.pathname)").join("history.replaceState(null, '', '#login')");
  return a + "\nwindow.PS_ACCOUNT_ROUTE = function (id) { if (!document.getElementById('v-guest').hidden) { var t = document.getElementById(id === 'signup' ? 't-register' : 't-login'); if (t) t.click(); } };";
})()}</script>

<script>${pub('js/compare.js').split("href: '/pricing.html'").join("href: '#pricing'")}</script>
<script>${pub('js/wa.js').split("window.open(r.body.url, '_blank', 'noopener');").join('').split("href: '/pricing.html'").join("href: '#pricing'")}</script>
<script>${pub('js/contact.js').split("'/api/contact'").join("'/api/contact'")}</script>
<script>${pub('js/pricing.js').split("href: '/compare.html'").join("href: '#compare'")}</script>
<script>document.querySelectorAll('#year').forEach(function(e){e.textContent=new Date().getFullYear();});</script>
`;
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'preview.html'), out);
console.log('dist/preview.html', Math.round(out.length / 1024) + 'KB');
