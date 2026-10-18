'use strict';

const { LINKS } = require('./links');

const MAX_TURNS = 12;
const MAX_MSG_CHARS = 600;
const MAX_TOTAL_CHARS = 4000;
const MAX_INPUT_MESSAGES = 40;
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/**
 * מנקה ומגביל את היסטוריית השיחה שהגיעה מהלקוח: תפקידים חוקיים בלבד, חיתוך אורך, איחוד הודעות רצופות
 * של אותו צד, פתיחה בהודעת משתמש וסיום בהודעת משתמש. מחזיר null אם הקלט לא תקין.
 */
function normalizeMessages(raw) {
  if (!Array.isArray(raw) || !raw.length || raw.length > MAX_INPUT_MESSAGES) return null;
  const out = [];
  let total = 0;
  for (const m of raw.slice(-MAX_TURNS)) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') return null;
    const text = m.content.replace(CONTROL_CHARS, '').trim().slice(0, MAX_MSG_CHARS);
    if (!text) continue;
    total += text.length;
    if (out.length && out[out.length - 1].role === m.role) out[out.length - 1].content += '\n' + text;
    else out.push({ role: m.role, content: text });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  if (!out.length || out[out.length - 1].role !== 'user' || total > MAX_TOTAL_CHARS) return null;
  return out;
}

/**
 * מפרק את תשובת המודל לטקסט נקי, עד 2 כפתורי ניווט (מרשימה לבנה בלבד) ועד 3 הצעות המשך.
 * תגיות לא מוכרות נמחקות.
 */
function parseReply(text) {
  const actions = [];
  const suggestions = [];
  const withoutAsks = text.replace(/\[\[ask:([^\]\n]{2,80})\]\]/gi, (_, q) => { if (suggestions.length < 3) suggestions.push(q.trim()); return ''; });
  const clean = withoutAsks.replace(/\[\[link:([a-z]+)\]\]/gi, (_, k) => {
    const l = LINKS[k.toLowerCase()];
    if (l && !actions.some((a) => a.href === l.href) && actions.length < 2) actions.push({ label: l.label, href: l.href });
    return '';
  }).replace(/\[\[[^\]]*\]\]/g, '').replace(/\n{3,}/g, '\n\n').trim();
  return { text: clean, actions, suggestions };
}

module.exports = { normalizeMessages, parseReply };
