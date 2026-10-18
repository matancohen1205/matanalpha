'use strict';

const { TIMEOUT_ANALYZE_MS, TIMEOUT_API_MS } = require('../config/limits');

/** מגביל זמן לבקשות API כדי שבקשה תקועה לא תתפוס משאבים לנצח (ארוך יותר לסריקה). */
function apiTimeout(req, res, next) {
  const ms = req.path === '/analyze' ? TIMEOUT_ANALYZE_MS : TIMEOUT_API_MS;
  res.setTimeout(ms, () => { if (!res.headersSent) res.status(503).json({ error: 'TIMEOUT' }); });
  next();
}

module.exports = { apiTimeout };
