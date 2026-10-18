'use strict';

/** שער הגבלת עבודות כבדות במקביל: מעבר לתקרה מחזיר 503 במקום להעמיס על השרת. */
function createConcurrencyGate(max) {
  let active = 0;
  /** מריץ fn אם יש מקום פנוי, ואחרת עונה 503 "עסוק". */
  return async function withSlot(res, fn) {
    if (active >= max) return res.status(503).json({ error: 'BUSY', message: 'השרת עסוק כרגע. נסו שוב בעוד רגע.' });
    active++;
    try {
      return await fn();
    } finally {
      active--;
    }
  };
}

module.exports = { createConcurrencyGate };
