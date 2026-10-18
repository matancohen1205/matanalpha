'use strict';

/** מחייב בקשות משנות מצב להיות JSON, ומונע שמירת תשובות במטמון. */
function jsonOnlyNoStore(req, res, next) {
  res.setHeader('Cache-Control', 'no-store');
  if ((req.method === 'POST' || req.method === 'PUT') && !req.is('application/json')) return res.status(415).json({ error: 'JSON_ONLY' });
  next();
}

/** יוצר middleware שמחייב סשן תקף ומציב את החשבון ב-req.acc (אחרת 401). */
function createRequireSession({ cookie, session }) {
  return (req, res, next) => {
    const acc = session.accountFor(cookie.read(req));
    if (!acc) return res.status(401).json({ error: 'NOT_LOGGED_IN', message: 'יש להתחבר.' });
    req.acc = acc;
    next();
  };
}

/** שולח תשובת כשל של שירות (status + error + message) כ-JSON; משמיט שדות ריקים. */
function sendFailure(res, r) {
  const { ok, status, ...body } = r;
  res.status(status).json(body);
}

module.exports = { jsonOnlyNoStore, createRequireSession, sendFailure };
