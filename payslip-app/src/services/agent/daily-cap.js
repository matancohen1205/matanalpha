'use strict';

/** מונה יומי לכל האתר שמגביל את עלות הסוכן; מתאפס בחצות UTC. */
function createDailyCap({ limit, now }) {
  let day = '';
  let count = 0;
  /** סופר בקשה ומחזיר true אם חרגנו מהתקרה היומית. */
  return function overCap() {
    const d = new Date(now()).toISOString().slice(0, 10);
    if (d !== day) { day = d; count = 0; }
    return ++count > limit;
  };
}

module.exports = { createDailyCap };
