'use strict';
// בונה public/i18n/{en,ru,ar}.json מ-i18n/dictionary.txt. פורמט שורה: עברית ||| EN ||| RU ||| AR
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'i18n', 'dictionary.txt'), 'utf8');
const langs = ['en', 'ru', 'ar'];
const out = Object.fromEntries(langs.map((l) => [l, { d: {}, p: [] }]));
const norm = (s) => s.replace(/\s+/g, ' ').trim();

let n = 0;
src.split('\n').forEach((line, i) => {
  if (!line.trim() || line.startsWith('#')) return;
  const parts = line.split('|||').map(norm);
  if (parts.length !== 4 || parts.some((p) => !p)) throw new Error(`dictionary.txt שורה ${i + 1}: נדרשות 4 עמודות`);
  const he = parts[0];
  langs.forEach((l, k) => {
    if (/\{\d\}/.test(he)) out[l].p.push([he, parts[k + 1]]);
    else out[l].d[he] = parts[k + 1];
  });
  n++;
});
fs.mkdirSync(path.join(__dirname, '..', 'public', 'i18n'), { recursive: true });
for (const l of langs) fs.writeFileSync(path.join(__dirname, '..', 'public', 'i18n', `${l}.json`), JSON.stringify(out[l]));
console.log(`i18n: ${n} רשומות × ${langs.length} שפות`);
