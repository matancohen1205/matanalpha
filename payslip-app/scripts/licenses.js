'use strict';
// מפיק את public/licenses.html מרשימת החבילות של פרודקשן ורישיונותיהן. הרצה: node scripts/licenses.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const dirs = execSync('npm ls --omit=dev --all --parseable', { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 })
  .split('\n').map((s) => s.trim()).filter((d) => d && d !== root);

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const seen = new Map();
for (const d of dirs) {
  let pj;
  try { pj = JSON.parse(fs.readFileSync(path.join(d, 'package.json'), 'utf8')); } catch { continue; }
  if (!pj.name) continue;
  let lic = pj.license || (Array.isArray(pj.licenses) ? pj.licenses.map((l) => l.type).join(' OR ') : '') || '';
  if (typeof lic === 'object') lic = lic.type || '';
  const key = `${pj.name}@${pj.version}`;
  if (!seen.has(key)) seen.set(key, { name: pj.name, version: pj.version, license: lic || 'לא צוין', home: (typeof pj.homepage === 'string' && /^https?:/.test(pj.homepage)) ? pj.homepage : `https://www.npmjs.com/package/${pj.name}` });
}
const rows = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
const counts = {};
rows.forEach((r) => { counts[r.license] = (counts[r.license] || 0) + 1; });
const summary = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([l, n]) => `${esc(l)} (${n})`).join(', ');
const risky = rows.filter((r) => /GPL|AGPL|SSPL|BUSL|UNLICENSED|לא צוין/i.test(r.license) && !/LGPL/i.test(r.license));

const tpl = fs.readFileSync(path.join(root, 'public', 'contact.html'), 'utf8');
const head = tpl.slice(0, tpl.indexOf('<main'));
const tail = tpl.slice(tpl.indexOf('</main>') + 7).replace('<script src="/js/contact.js"></script>', '');
const body = `<main id="main" class="container tool">
    <h1>רישיונות ותוכן צד שלישי</h1>
    <p class="lead muted">האתר בנוי על תוכנות קוד פתוח. להלן החבילות שרצות בפועל בשרת (נוצר אוטומטית מקובצי החבילות), וההצהרה על גופנים ואייקונים.</p>

    <section class="card">
      <h2>גופנים ואייקונים</h2>
      <ul class="prose-list">
        <li><strong>גופנים:</strong> האתר אינו טוען קבצי גופן ואינו פונה לשירות גופנים חיצוני. הטקסט מוצג בגופני המערכת של המכשיר (למשל Segoe UI, Arial), ולכן אין רישיון גופן שיש לרכוש או לייחס.</li>
        <li><strong>אייקונים ואיורים:</strong> הלוגו, סמלי הממשק והאיורים באתר הם גרפיקת SVG שנוצרה עבור האתר ואינה לקוחה מספריית אייקונים או מאגר תמונות חיצוני.</li>
        <li><strong>תמונות מסך ודוגמאות:</strong> הצגות התלוש והתוצאות באתר מבוססות על נתוני דוגמה פיקטיביים.</li>
      </ul>
    </section>

    <section class="card gap-top">
      <h2>חבילות קוד פתוח בשרת (${rows.length})</h2>
      <p class="muted"><span>סיכום רישיונות:</span> <span dir="ltr" data-no-i18n>${summary}</span></p>
      ${risky.length ? `<p class="alert" data-no-i18n>שימו לב: חבילות עם רישיון שדורש בדיקה: ${risky.map((r) => esc(r.name)).join(', ')}.</p>` : ''}
      <div class="table-wrap"><table>
        <thead><tr><th>חבילה</th><th>גרסה</th><th>רישיון</th></tr></thead>
        <tbody>
${rows.map((r) => `          <tr><td dir="ltr"><a href="${esc(r.home)}" rel="noopener noreferrer" target="_blank">${esc(r.name)}</a></td><td dir="ltr">${esc(r.version)}</td><td dir="ltr">${esc(r.license)}</td></tr>`).join('\n')}
        </tbody>
      </table></div>
      <p class="muted small">נתוני השפה של זיהוי הטקסט (Tesseract) מופצים ברישיון Apache-2.0. הקוד של האתר עצמו שייך למפעיל האתר. טקסט הרישיון המלא של כל חבילה נמצא בחבילה עצמה ובעמוד שלה ב-npm.</p>
    </section>
  </main>
`;
let out = head.replace(/<title>.*?<\/title>/s, '<title>רישיונות | תלוש בעברית</title>').replace(/<meta name="description"[^>]*>/, '<meta name="description" content="רישיונות קוד פתוח, גופנים ואייקונים באתר תלוש בעברית.">') + body + tail;
fs.writeFileSync(path.join(root, 'public', 'licenses.html'), out);
console.log(`licenses.html: ${rows.length} packages; risky: ${risky.map((r) => r.name).join(',') || 'none'}`);
