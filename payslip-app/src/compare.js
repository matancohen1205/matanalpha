'use strict';

const MAX_SLIPS = 12;
const MAX_ITEMS = 80;

const CORE_IDS = ['gross', 'net', 'income_tax', 'national_insurance', 'health_tax', 'pension_employee'];
const KEY_LABELS = {
  gross: 'ברוטו',
  net: 'נטו',
  income_tax: 'מס הכנסה',
  national_insurance: 'ביטוח לאומי',
  health_tax: 'מס בריאות',
  pension_employee: 'פנסיה (עובד)',
};

const round2 = (n) => Math.round(n * 100) / 100;
const dir = (p) => (p === null ? '' : p > 0 ? `עלה ב-${p}%` : p < 0 ? `ירד ב-${Math.abs(p)}%` : 'לא השתנה');
const pct = (a, b) => (b ? round2(((a - b) / Math.abs(b)) * 100) : null);

/** בדיקה קפדנית של הקלט: הלקוח שולח רק שדות מינימליים מתוצאות הניתוח */
function sanitize(input) {
  if (!input || !Array.isArray(input.slips)) throw new Error('slips required');
  if (input.slips.length < 2) throw new Error('at least two payslips are needed');
  if (input.slips.length > MAX_SLIPS) throw new Error('too many payslips');
  return input.slips.map((s, idx) => {
    const items = Array.isArray(s.items) ? s.items.slice(0, MAX_ITEMS) : [];
    return {
      label: String(s.label || `תלוש ${idx + 1}`).slice(0, 40),
      items: items
        .filter((i) => i && typeof i.id === 'string' && Number.isFinite(Number(i.amount)))
        .map((i) => ({
          id: i.id.slice(0, 40),
          title: String(i.title || i.id).slice(0, 60),
          type: ['earning', 'deduction', 'employer', 'summary', 'info'].includes(i.type) ? i.type : 'info',
          amount: Number(i.amount),
        })),
    };
  });
}

function compareSlips(input) {
  const slips = sanitize(input);
  const labels = slips.map((s) => s.label);

  // סכום לכל מזהה בכל תלוש (פריטים חוזרים כמו בונוסים מסוכמים)
  const rows = new Map();
  slips.forEach((s, col) => {
    s.items.forEach((i) => {
      if (i.type === 'info' && i.id !== 'tax_credits') return;
      if (!rows.has(i.id)) rows.set(i.id, { id: i.id, title: i.title, type: i.type, values: Array(slips.length).fill(null) });
      const r = rows.get(i.id);
      r.values[col] = round2((r.values[col] || 0) + (i.type === 'info' ? i.amount : Math.abs(i.amount)));
    });
  });

  const table = [...rows.values()].map((r) => {
    const first = r.values.find((v) => v !== null);
    const last = [...r.values].reverse().find((v) => v !== null);
    return {
      ...r,
      change: first !== undefined && last !== undefined ? round2(last - first) : null,
      changePct: first !== undefined && last !== undefined ? pct(last, first) : null,
    };
  });

  const order = (a, b) => {
    const ai = CORE_IDS.indexOf(a.id);
    const bi = CORE_IDS.indexOf(b.id);
    if (ai >= 0 || bi >= 0) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    return a.type.localeCompare(b.type) || a.title.localeCompare(b.title, 'he');
  };
  table.sort(order);

  const series = {};
  CORE_IDS.forEach((id) => {
    const r = rows.get(id);
    if (r) series[id] = { label: KEY_LABELS[id], values: r.values };
  });

  return { labels, table, series, findings: findings(table, series, labels) };
}

function findings(table, series, labels) {
  const out = [];
  const n = labels.length;
  const byId = Object.fromEntries(table.map((r) => [r.id, r]));

  // שינוי בנטו וברוטו בין התלוש הראשון לאחרון
  const g = series.gross?.values;
  const net = series.net?.values;
  if (g && net) {
    const gl = g[n - 1], gf = g[0], nl = net[n - 1], nf = net[0];
    if ([gl, gf, nl, nf].every((v) => v !== null)) {
      const gp = pct(gl, gf);
      const np = pct(nl, nf);
      out.push({
        level: 'info',
        title: `בין ${labels[0]} ל-${labels[n - 1]}: הברוטו ${dir(gp)} והנטו ${dir(np)}`,
        text: 'השוואה בין תלוש ראשון לאחרון. אם הנטו עולה לאט מהברוטו, ייתכן שעברתם מדרגת מס או שהוגדלו הפרשות.',
      });
    }
  }

  // סעיפים שנעלמו או הופיעו לראשונה
  table.forEach((r) => {
    if (['info', 'summary'].includes(r.type)) return;
    const present = r.values.map((v) => v !== null);
    const lastIdx = present.lastIndexOf(true);
    if (!present[n - 1] && present.filter(Boolean).length >= Math.ceil(n / 2) && ['deduction', 'earning'].includes(r.type)) {
      out.push({
        level: r.type === 'earning' ? 'warn' : 'info',
        title: `"${r.title}" לא מופיע בתלוש האחרון`,
        text: `הסעיף הופיע ב-${present.filter(Boolean).length} מתוך ${n} תלושים, ובתלוש האחרון הוא חסר (הופיע לאחרונה ב-${labels[lastIdx]}). אם זה תשלום קבוע, כדאי לברר.`,
      });
    }
    if (present[n - 1] && present.filter(Boolean).length === 1 && n >= 3 && r.type === 'earning') {
      out.push({ level: 'info', title: `"${r.title}" חדש בתלוש האחרון`, text: 'הסעיף לא הופיע בתלושים הקודמים.' });
    }
  });

  // קפיצה חריגה במס
  const tax = byId.income_tax;
  if (tax && g) {
    tax.values.forEach((v, i) => {
      if (i === 0 || v === null || tax.values[i - 1] === null || !g[i] || !g[i - 1]) return;
      const rate = v / g[i];
      const prevRate = tax.values[i - 1] / g[i - 1];
      if (Math.abs(rate - prevRate) > 0.03) {
        out.push({
          level: 'warn',
          title: `שיעור מס ההכנסה השתנה ב-${labels[i]}`,
          text: `מ-${round2(prevRate * 100)}% ל-${round2(rate * 100)}% מהברוטו. שינוי כזה נובע לרוב מבונוס, שינוי בנקודות זיכוי או חישוב מצטבר.`,
        });
      }
    });
  }

  // נקודות זיכוי השתנו
  const tc = byId.tax_credits;
  if (tc) {
    const vals = tc.values.filter((v) => v !== null);
    if (new Set(vals).size > 1) {
      out.push({ level: 'warn', title: 'מספר נקודות הזיכוי השתנה בין התלושים', text: `הערכים שנמצאו: ${vals.join(', ')}. ודאו שהשינוי מוצדק (למשל לידה, שחרור משירות).` });
    }
  }
  return out;
}

module.exports = { compareSlips, MAX_SLIPS };
