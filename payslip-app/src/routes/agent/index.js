'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { createAgentService } = require('../../services/agent');

/** מגביל קצב ייעודי לצ'אט (ברירת מחדל 25 הודעות ל-10 דקות לכל כתובת). */
function createChatLimiter() {
  return rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: Number(process.env.AGENT_RATE_LIMIT) || 25,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'RATE_LIMIT', message: 'נשלחו הרבה הודעות בזמן קצר. נסו שוב בעוד כמה דקות.' },
  });
}

/** בונה את מודול הסוכן: GET /status ו-POST /chat. כשאין מפתח API הוא כבוי ועונה 503. */
function createAgent(opts) {
  const service = createAgentService(opts);
  const router = express.Router();
  const limiter = createChatLimiter();

  router.get('/status', (req, res) => res.json({ enabled: service.enabled }));

  router.post('/chat', limiter, express.json({ limit: '16kb' }), async (req, res) => {
    if (!service.enabled) return res.status(503).json({ error: 'NOT_CONFIGURED' });
    if (!req.is('application/json')) return res.status(415).json({ error: 'JSON_ONLY' });
    const messages = service.normalize(req.body && req.body.messages);
    if (!messages) return res.status(400).json({ error: 'BAD_INPUT', message: 'ההודעה אינה תקינה.' });
    if (service.overDailyCap()) return res.status(503).json({ error: 'BUSY', message: 'העוזר עמוס כרגע. אפשר לפנות לשירות לקוחות.' });
    try {
      const reply = await service.reply(messages, { lang: req.body.lang, page: req.body.page });
      res.setHeader('Cache-Control', 'no-store');
      res.json({ ok: true, ...reply });
    } catch (e) {
      res.status(502).json({ error: e.code === 'EMPTY' ? 'EMPTY' : 'UPSTREAM' });
    }
  });

  return { router, enabled: service.enabled };
}

module.exports = { createAgent };
