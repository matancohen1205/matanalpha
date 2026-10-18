'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { createSupportService } = require('../../services/support');
const { TOPICS } = require('../../services/support/topics');

/** מגביל 5 פניות לשעה לכתובת. */
function createContactLimiter() {
  return rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'RATE_LIMIT', message: 'נשלחו כמה פניות בזמן קצר. נסו שוב מאוחר יותר.' },
  });
}

/** האם ה-Origin של הבקשה זר לאתר (נבדק בפרודקשן בלבד). */
function isForeignOrigin(req, publicUrl) {
  return !!(publicUrl && req.headers.origin && req.headers.origin !== new URL(publicUrl).origin && process.env.NODE_ENV === 'production');
}

/** בונה את מודול שירות הלקוחות: GET /site-config ו-POST /contact. */
function createSupport({ store, mailer, config = {}, publicUrl }) {
  const service = createSupportService({ store, mailer, config });
  const router = express.Router();

  router.get('/site-config', (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json(service.publicConfig());
  });

  router.post('/contact', createContactLimiter(), express.json({ limit: '12kb' }), (req, res) => {
    if (!req.is('application/json')) return res.status(415).json({ error: 'JSON_ONLY' });
    if (isForeignOrigin(req, publicUrl)) return res.status(403).json({ error: 'BAD_ORIGIN' });
    const r = service.submit(req.body || {});
    res.status(r.status).json(r.body);
    if (r.notify) r.notify(); // התראה במייל אחרי שהתשובה נשלחה
  });

  return { router, TOPICS };
}

module.exports = { createSupport };
