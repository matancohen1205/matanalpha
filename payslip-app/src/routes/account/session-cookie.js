'use strict';

const { readCookie } = require('../../http/cookies');

/** עוגיית סשן החשבון: שם (עם קידומת __Host- בפרודקשן), קריאה, הצבה וניקוי. */
function createSessionCookie({ secure, maxAgeMs }) {
  const name = secure ? '__Host-ps_sess' : 'ps_sess';
  return {
    read: (req) => readCookie(req, name),
    /** קובע את אסימון הסשן בעוגייה (HttpOnly, SameSite=Strict). */
    set(res, token) {
      res.cookie(name, token, { httpOnly: true, sameSite: 'strict', secure, maxAge: maxAgeMs, path: '/' });
    },
    clear: (res) => res.clearCookie(name, { path: '/' }),
  };
}

module.exports = { createSessionCookie };
