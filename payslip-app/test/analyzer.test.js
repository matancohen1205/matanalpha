'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { analyzePayslip } = require('../src/analyzer');
const { sniffType } = require('../src/extract');

const SLIP = ['שכר יסוד 12,000.00', 'סה"כ ברוטו 15,126.00', 'מס הכנסה 1,480.00', 'פנסיה עובד 907.56', 'פנסיה מעסיק 983.00', 'שכר נטו 11,230.44'].join('\n');

test('מזהה סעיפים וסכומים', () => {
  const r = analyzePayslip(SLIP);
  const by = Object.fromEntries(r.items.map((i) => [i.id, i.amount]));
  assert.strictEqual(by.base_salary, 12000);
  assert.strictEqual(by.income_tax, 1480);
  assert.strictEqual(by.pension_employee, 907.56);
  assert.strictEqual(by.pension_employer, 983);
  assert.strictEqual(r.summary.net, 11230.44);
});

test('מזהה גם טקסט בסדר הפוך (PDF)', () => {
  const r = analyzePayslip('12,000.00שכר יסוד');
  assert.strictEqual(r.items[0].id, 'base_salary');
});

test('בדיקת סוג קובץ לפי תוכן', () => {
  assert.strictEqual(sniffType(Buffer.from('%PDF-1.7 aaaaaaaa')), 'pdf');
  assert.strictEqual(sniffType(Buffer.from('MZ not an image at all')), null);
});
