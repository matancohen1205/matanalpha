'use strict';

const { sign, verify } = require('./tokens');

const TOKEN_TTL_S = 7 * 24 * 3600; // אחרי שבוע בודקים מחדש מול ספק התשלומים

/** אסימון Pro: חתום, מסוג "pro" בלבד (אסימוני וואטסאפ ומייל חתומים באותו סוד ולכן נבדק הסוג). */
function createProToken({ secret }) {
  return {
    ttlSeconds: TOKEN_TTL_S,
    /** מנפיק אסימון Pro עם מטען (cid) ותוקף שבוע. */
    issue: (payload) => sign({ ...payload, t: 'pro', exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_S }, secret),
    /** קורא אסימון ומחזיר את המטען רק אם הוא תקף ומסוג pro. */
    read(token) {
      const p = verify(token, secret);
      return p && p.t === 'pro' ? p : null;
    },
  };
}

module.exports = { createProToken, TOKEN_TTL_S };
