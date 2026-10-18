'use strict';

const { compareSlips } = require('../payslip/compare');

const fmt = (n) => `${Number(n).toLocaleString('he-IL', { maximumFractionDigits: 0 })} ₪`;

/** מפתח תקופה "YYYY-MM" מהתלוש (או מהחודש הנוכחי). */
function periodKey(analysis, now) {
  const p = analysis.summary && analysis.summary.period; // "MM/YYYY"
  const m = p && /^(\d{2})\/(\d{4})$/.exec(p);
  return m ? `${m[2]}-${m[1]}` : new Date(now).toISOString().slice(0, 7);
}

/** תמונת מצב מצומצמת לשמירה: סכומים וכותרות מהמילון בלבד, לא טקסט מהתלוש. */
function toSnapshot(analysis) {
  return {
    items: analysis.items
      .filter((i) => i.amount !== null && i.id !== 'manual')
      .map((i) => ({ id: i.id, title: i.title, type: i.type, amount: i.amount })), // כותרות מהמילון שלנו, לא טקסט מהתלוש
  };
}

/** מחשב התראות: השוואה לחודשים קודמים ותובנות אזהרה. */
function buildAlerts(analysis, previous, currentKey) {
  const alerts = [];
  const snap = toSnapshot(analysis);
  if (previous.length) {
    try {
      const r = compareSlips({
        slips: [...previous.map((s) => ({ label: s.period, items: s.items })), { label: currentKey, items: snap.items }],
      });
      r.findings.forEach((f) => alerts.push({ level: f.level, text: f.title }));
    } catch {
      /* אין מספיק נתונים להשוואה */
    }
  }
  (analysis.insights || []).filter((i) => i.level === 'warn').forEach((i) => alerts.push({ level: 'warn', text: i.title }));
  const order = { warn: 0, info: 1, ok: 2 };
  return alerts.sort((a, b) => order[a.level] - order[b.level]).slice(0, 6);
}

/** מרכיב את הודעת הסיכום לוואטסאפ. */
function buildReply(analysis, alerts, currentKey, hadPrevious) {
  const s = analysis.summary;
  const lines = [`*סיכום תלוש ${currentKey.slice(5)}/${currentKey.slice(0, 4)}*`];
  if (s.gross) lines.push(`ברוטו: ${fmt(s.gross)}`);
  if (s.totalDeductions) lines.push(`ניכויים: ${fmt(s.totalDeductions)}`);
  if (s.net) lines.push(`נטו: ${fmt(s.net)}`);
  lines.push('');
  const warns = alerts.filter((a) => a.level === 'warn');
  const infos = alerts.filter((a) => a.level !== 'warn');
  if (warns.length) {
    lines.push('*⚠️ דברים שכדאי לבדוק:*');
    warns.forEach((a) => lines.push(`• ${a.text}`));
  } else {
    lines.push(hadPrevious ? '✅ לא זיהיתי שינויים חריגים לעומת החודשים הקודמים.' : '✅ לא זיהיתי דבר חריג בתלוש.');
  }
  if (infos.length) {
    lines.push('', '*לידיעתך:*');
    infos.forEach((a) => lines.push(`• ${a.text}`));
  }
  if (!hadPrevious) lines.push('', 'זה התלוש הראשון ששמרתי, ובחודש הבא אשווה אותו אוטומטית.');
  lines.push('', 'הערכה אוטומטית בלבד ואינה ייעוץ מקצועי. לשאלות פנו למחלקת השכר.');
  return lines.join('\n');
}

module.exports = { periodKey, toSnapshot, buildAlerts, buildReply };
