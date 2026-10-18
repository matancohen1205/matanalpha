'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');
const NO_INDEX = new Set(['account', 'admin']); // דפים פרטיים שלא נכנסים ל-sitemap

/** מחזיר את שמות דפי ה-HTML בתיקיית public (ללא הסיומת). */
function listHtmlPages() {
  return fs.readdirSync(PUBLIC_DIR).filter((f) => f.endsWith('.html')).map((f) => f.slice(0, -5));
}

/** יוצר פונקציית שליחה של דף HTML עם הזרקת כתובת האתר (canonical ו-Open Graph); תוכן הדף נשמר במטמון. */
function createPageSender(siteOrigin) {
  const cache = {};
  return function sendPage(res, file, urlPath) {
    cache[file] = cache[file] || fs.readFileSync(path.join(PUBLIC_DIR, file), 'utf8');
    res.setHeader('Cache-Control', 'no-cache');
    res.type('html').send(cache[file].split('%ORIGIN%').join(siteOrigin).split('%PATH%').join(urlPath));
  };
}

/** בונה את תוכן robots.txt (חוסם API ודפי חשבון, ומפנה ל-sitemap כשהכתובת ידועה). */
function buildRobots(siteOrigin) {
  const lines = ['User-agent: *', 'Allow: /', 'Disallow: /api/', 'Disallow: /account.html', 'Disallow: /login.html', 'Disallow: /signup.html'];
  if (siteOrigin) lines.push(`Sitemap: ${siteOrigin}/sitemap.xml`);
  return lines.join('\n') + '\n';
}

/** בונה את ה-sitemap.xml מרשימת הדפים הציבוריים. */
function buildSitemap(siteOrigin, pages) {
  const urls = ['/'].concat(pages.filter((n) => n !== 'index' && !NO_INDEX.has(n)).map((n) => `/${n}.html`));
  const entries = urls.map((u) => `  <url><loc>${siteOrigin}${u}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

/** מחבר דפי HTML (עם ו-בלי סיומת), נתיבי login/signup, robots, sitemap, וקבצים סטטיים. */
function createPagesRouter(siteOrigin) {
  const router = express.Router();
  const sendPage = createPageSender(siteOrigin);
  const pages = listHtmlPages();

  router.get('/', (req, res) => sendPage(res, 'index.html', '/'));
  for (const name of pages) router.get([`/${name}.html`, `/${name}`], (req, res) => sendPage(res, `${name}.html`, `/${name}.html`));
  router.get(['/login', '/login.html'], (req, res) => sendPage(res, 'account.html', '/login.html'));
  router.get(['/signup', '/signup.html'], (req, res) => sendPage(res, 'account.html', '/signup.html'));
  router.get('/robots.txt', (req, res) => res.type('text').send(buildRobots(siteOrigin)));
  router.get('/sitemap.xml', (req, res) => res.type('application/xml').send(buildSitemap(siteOrigin, pages)));

  router.use(express.static(PUBLIC_DIR, {
    extensions: ['html'],
    maxAge: '1h',
    setHeaders(res, file) { if (file.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache'); },
  }));
  return router;
}

module.exports = { createPagesRouter, buildRobots, buildSitemap };
