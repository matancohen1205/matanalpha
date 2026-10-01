'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const pub = path.join(__dirname, '..', 'public');

test('מילון התרגום: אותם משתנים {n} בכל השפות ואין ערכים ריקים', () => {
  const dirI = path.join(__dirname, '..', 'i18n');
  const rows = fs.readdirSync(dirI).filter((f) => f.endsWith('.txt')).map((f) => fs.readFileSync(path.join(dirI, f), 'utf8')).join('\n')
    .split('\n').filter((l) => l.trim() && !l.startsWith('#'));
  assert.ok(rows.length > 100);
  const seen = new Set();
  for (const r of rows) {
    const cols = r.split('|||').map((c) => c.trim());
    assert.strictEqual(cols.length, 4, r);
    assert.ok(!seen.has(cols[0]), `כפילות: ${cols[0]}`);
    seen.add(cols[0]);
    const vars = (s) => (s.match(/\{[\dn]\}/g) || []).sort().join();
    for (const c of cols.slice(1)) assert.strictEqual(vars(c), vars(cols[0]), r);
  }
});

test('קבצי השפה נבנים ונגישים, וכל הדפים טוענים את i18n.js', () => {
  require('child_process').execFileSync('node', [path.join(__dirname, '..', 'scripts', 'build-i18n.js')]);
  for (const l of ['en', 'ru', 'ar']) {
    const j = JSON.parse(fs.readFileSync(path.join(pub, 'i18n', `${l}.json`), 'utf8'));
    assert.ok(Object.keys(j.d).length > 100);
  }
  for (const f of fs.readdirSync(pub).filter((x) => x.endsWith('.html'))) {
    assert.ok(fs.readFileSync(path.join(pub, f), 'utf8').includes('/js/i18n.js'), f);
  }
});
