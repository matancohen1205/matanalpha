'use strict';

const { GLOSSARY } = require('./glossary');

const INVISIBLE = /[‎‏‪-‮⁦-⁩֑-ׇ]/g;
const NUMBER = /-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?/g;

const reverse = (s) => Array.from(s).reverse().join('');

function normalize(line) {
  return line.replace(INVISIBLE, '').replace(/[\t ]+/g, ' ').trim();
}

/** מוצא את ההתאמה הטובה ביותר (הארוכה ביותר) מהמילון לשורה נתונה */
function matchLine(line) {
  let best = null;
  const candidates = [line, reverseWords(line)];
  for (const entry of GLOSSARY) {
    for (const re of entry.match) {
      for (const text of candidates) {
        const m = re.exec(text);
        if (m && (!best || m[0].length > best.len)) {
          best = { entry, len: m[0].length };
        }
      }
    }
  }
  return best && best.entry;
}

/** PDF עם עברית לעיתים נקרא בסדר הפוך: הופך אותיות בתוך כל מילה עברית */
function reverseWords(line) {
  return line.replace(/[א-ת"'.]+/g, (w) => reverse(w));
}

function toNumber(str) {
  return Number(str.replace(/,/g, ''));
}

function extractNumbers(line) {
  const out = [];
  let m;
  NUMBER.lastIndex = 0;
  while ((m = NUMBER.exec(line))) {
    const after = line.slice(m.index + m[0].length, m.index + m[0].length + 2);
    const before = line[m.index - 1];
    if (/^\s*%/.test(after) || before === '/' || after[0] === '/') continue; // אחוזים ותאריכים
    out.push({ raw: m[0], value: toNumber(m[0]), decimal: m[0].includes('.') });
  }
  return out;
}

function pickAmount(entry, numbers) {
  if (!numbers.length) return null;
  const decimals = numbers.filter((n) => n.decimal);
  if (entry.type === 'info') return numbers[0].value;
  const pool = decimals.length ? decimals : numbers;
  return pool.reduce((a, b) => (Math.abs(b.value) > Math.abs(a.value) ? b : a)).value;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function detectPeriod(text) {
  const m = /(0?[1-9]|1[0-2])\s*[\/.\-]\s*(20\d{2})/.exec(text);
  return m ? `${m[1].padStart(2, '0')}/${m[2]}` : null;
}

/**
 * מנתח טקסט של תלוש שכר ומחזיר מבנה מוסבר.
 * @param {string} rawText
 */
function analyzePayslip(rawText) {
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map(normalize)
    .filter((l) => l.length > 1);

  const items = [];
  const unknown = [];
  const seenSummary = new Set();

  for (const line of lines) {
    const entry = matchLine(line);
    const numbers = extractNumbers(line);
    if (!entry) {
      if (numbers.some((n) => n.decimal) && /[א-ת]/.test(line) && unknown.length < 25) {
        unknown.push({ line: line.slice(0, 140), amount: pickAmount({ type: 'earning' }, numbers) });
      }
      continue;
    }
    const amount = pickAmount(entry, numbers);
    if (entry.type === 'summary') {
      if (amount === null || seenSummary.has(entry.id)) continue;
      seenSummary.add(entry.id);
    }
    items.push({
      key: `${entry.id}-${items.length}`,
      id: entry.id,
      type: entry.type,
      title: entry.title,
      what: entry.what,
      why: entry.why,
      amount: amount !== null && entry.type !== 'info' ? Math.abs(amount) : amount, // מינוס בתלוש מציין ניכוי, לא סכום שלילי
      line: line.slice(0, 160),
    });
  }

  const sumOf = (types, notIds = []) =>
    round2(
      items
        .filter((i) => types.includes(i.type) && !notIds.includes(i.id) && i.amount !== null)
        .reduce((s, i) => s + Math.abs(i.amount), 0)
    );

  const find = (id) => items.find((i) => i.id === id && i.amount !== null);
  const gross = find('gross')?.amount ?? null;
  const net = find('net')?.amount ?? null;
  const totalDed = find('total_deductions')?.amount ?? null;

  const earningsSum = sumOf(['earning']);
  const deductionsSum = sumOf(['deduction']);

  const summary = {
    gross: gross ?? (earningsSum || null),
    net,
    totalDeductions: totalDed ?? (gross !== null && net !== null ? round2(gross - net) : deductionsSum || null),
    earningsSum,
    deductionsSum,
    period: detectPeriod(lines.join('\n')),
  };

  return {
    summary,
    items,
    unknown,
    insights: buildInsights(items, summary),
    stats: { linesRead: lines.length, itemsRecognized: items.length },
  };
}

function buildInsights(items, summary) {
  const out = [];
  const amt = (id) => items.find((i) => i.id === id && i.amount !== null)?.amount ?? null;
  const g = summary.gross;

  if (g && summary.net) {
    const pct = round2(((g - summary.net) / g) * 100);
    out.push({
      level: 'info',
      title: `בסך הכל ${pct}% מהברוטו שלכם ירדו החודש`,
      text: `מתוך ${fmt(g)} ברוטו, קיבלתם ${fmt(summary.net)} נטו. הפער הוא מסים, ביטוחים לאומיים ופנסיה.`,
    });
  }

  const pension = amt('pension_employee');
  if (g && pension !== null && g > 0) {
    const pct = round2((pension / g) * 100);
    if (pct < 5.5) {
      out.push({
        level: 'warn',
        title: 'אחוז הפנסיה נראה נמוך מהמינימום החוקי',
        text: `ניכוי הפנסיה (${pct}% מהברוטו) נמוך מ-6% הנדרשים בחוק לחלק העובד. ייתכן שחלק מהשכר אינו מבוטח, או שזיהוי הסכום אינו מדויק. כדאי לבדוק עם מחלקת השכר.`,
      });
    } else {
      out.push({
        level: 'ok',
        title: 'הפרשת הפנסיה נראית תקינה',
        text: `ניכוי הפנסיה הוא כ-${pct}% מהברוטו, בטווח המקובל.`,
      });
    }
  }

  const tax = amt('income_tax');
  if (g && tax !== null && g > 0) {
    out.push({
      level: 'info',
      title: `שיעור מס הכנסה אפקטיבי: ${round2((tax / g) * 100)}%`,
      text: 'זהו המס החודשי חלקי הברוטו. אם השיעור נראה גבוה, כדאי לבדוק כמה נקודות זיכוי רשומות בתלוש ולהגיש ללא דאגה טופס 101 לעדכון.',
    });
  }

  if (summary.gross && summary.net && summary.deductionsSum) {
    const diff = round2(summary.gross - summary.net - summary.deductionsSum);
    if (Math.abs(diff) > Math.max(5, summary.gross * 0.01)) {
      out.push({
        level: 'warn',
        title: 'ייתכן שחלק מהניכויים לא זוהו',
        text: `הפער בין הברוטו לנטו (${fmt(summary.gross - summary.net)}) שונה מסכום הניכויים שזוהו (${fmt(summary.deductionsSum)}). אפשר להוסיף או לתקן סכומים ידנית בתוצאות.`,
      });
    }
  }

  if (!items.some((i) => i.id === 'tax_credits')) {
    out.push({
      level: 'info',
      title: 'לא זוהו נקודות זיכוי',
      text: 'נקודות זיכוי מקטינות את המס. אם הן לא מופיעות בתלוש שלכם, כדאי לוודא עם המעסיק שמולא טופס 101.',
    });
  }
  return out;
}

function fmt(n) {
  return `${Number(n).toLocaleString('he-IL', { maximumFractionDigits: 2 })} ₪`;
}

module.exports = { analyzePayslip, extractNumbers, matchLine };
