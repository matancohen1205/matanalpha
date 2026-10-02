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

test('סכום שלילי בתלוש נקרא כניכוי חיובי, וקיצורי קה"ש ודמי חופשה מזוהים', () => {
  const { analyzePayslip } = require('../src/analyzer');
  const r = analyzePayslip('מס הכנסה\t\t\t-1,480.00\nקה"ש עובד 378.00\nקה"ש מעסיק 7.5% 900.00\nדמי חופשה 1,200.00');
  const by = Object.fromEntries(r.items.map((i) => [i.id, i.amount]));
  assert.strictEqual(by.income_tax, 1480);
  assert.strictEqual(by.study_fund_employee, 378);
  assert.strictEqual(by.study_fund_employer, 900);
  assert.strictEqual(by.vacation_pay, 1200);
});

test('נקודות תואר: תקופת זכאות של 12 חודשים מהחודש שאחרי סיום הלימודים', () => {
  const T = require('../public/js/tax-core.js');
  const w = (end, today) => T.degreeWindow(end, today);
  assert.deepStrictEqual(w('2025-06-30', '2025-06-30'), { valid: true, status: 'future', active: false, start: '2025-07-01', end: '2026-06-30' });
  assert.strictEqual(w('2025-06-30', '2025-07-01').status, 'active');
  assert.strictEqual(w('2025-06-30', '2026-06-30').status, 'active');
  assert.strictEqual(w('2025-06-30', '2026-07-01').status, 'expired');
  assert.strictEqual(w('2025-12-15', '2026-12-31').end, '2026-12-31');
  assert.strictEqual(w('2025-02-30', '2025-03-01').valid, false);
  assert.strictEqual(w('', '2025-03-01').valid, false);
  const pts = (prof) => T.estimateCredits({ gender: 'm', taxYear: 2025, today: '2025-09-01', ...prof }).total;
  const base = pts({});
  assert.strictEqual(pts({ degree: 'ba', degreeEnd: '2025-06-30' }), base + 1);
  assert.strictEqual(pts({ degree: 'ma', degreeEnd: '2025-06-30' }), base + 0.5);
  assert.strictEqual(pts({ degree: 'ba', degreeEnd: '2023-06-30' }), base); // פג תוקף
  assert.strictEqual(pts({ degree: 'ba', degreeEnd: '2025-09-30' }), base); // עדיין לא התחילה
  assert.strictEqual(pts({ degree: 'none', degreeEnd: '2025-06-30' }), base);
});
