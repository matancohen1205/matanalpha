'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { createAdminAuth } = require('../../services/admin/auth');
const { createTicketAdmin } = require('../../services/admin/tickets');

/** קורא עוגייה לפי שם. */
function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

/** מגביל ניסיונות התחברות: 5 לרבע שעה (ניסיונות מוצלחים לא נספרים). */
function createLoginLimiter() {
  return rateLimit({ windowMs: 15 * 60 * 1000, limit: Number(process.env.ADMIN_LOGIN_LIMIT) || 5, standardHeaders: true, legacyHeaders: false, skipSuccessfulRequests: true, message: { error: 'RATE_LIMIT', message: 'יותר מדי ניסיונות. נסו שוב בעוד כרבע שעה.' } });
}

/**
 * ממשק אדמין לבעל האתר בלבד. מופעל רק כש-ADMIN_PASSWORD מוגדר (12 תווים ומעלה); אחרת כל הנתיבים מחזירים 404.
 * הסשן הוא עוגייה חתומה (HttpOnly, SameSite=Strict) שנגזרת מהסיסמה: החלפת הסיסמה מנתקת את כולם.
 */
function createAdmin({ store, password, secret, secure = false, now }) {
  const auth = createAdminAuth({ password, secret, now });
  const tickets = createTicketAdmin(store);
  const COOKIE = secure ? '__Host-ps_admin' : 'ps_admin';
  const router = express.Router();

  router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!auth.enabled) return res.status(404).json({ error: 'NOT_FOUND' });
    next();
  });

  const isAdmin = (req) => auth.isValid(readCookie(req, COOKIE));
  const requireAdmin = (req, res, next) => (isAdmin(req) ? next() : res.status(401).json({ error: 'NOT_LOGGED_IN', message: 'יש להתחבר.' }));

  router.post('/login', createLoginLimiter(), express.json({ limit: '2kb' }), (req, res) => {
    const given = req.body && typeof req.body.password === 'string' ? req.body.password.slice(0, 200) : '';
    if (!auth.checkPassword(given)) return res.status(401).json({ error: 'BAD_CREDENTIALS', message: 'הסיסמה שגויה.' });
    res.cookie(COOKIE, auth.issueToken(), { httpOnly: true, sameSite: 'strict', secure, maxAge: auth.sessionMs, path: '/' });
    res.json({ ok: true });
  });
  router.post('/logout', (req, res) => { res.clearCookie(COOKIE, { path: '/' }); res.json({ ok: true }); });
  router.get('/me', (req, res) => res.json({ loggedIn: isAdmin(req) }));

  router.get('/tickets', requireAdmin, (req, res) => res.json({ tickets: tickets.list() }));
  router.post('/tickets/:id/status', requireAdmin, express.json({ limit: '1kb' }), (req, res) => {
    if (!tickets.setStatus(Number(req.params.id), req.body && req.body.status)) return res.status(400).json({ error: 'BAD_INPUT' });
    res.json({ ok: true });
  });
  router.delete('/tickets/:id', requireAdmin, (req, res) => {
    const deleted = tickets.remove(Number(req.params.id));
    if (deleted === null) return res.status(400).json({ error: 'BAD_INPUT' });
    res.json({ ok: true, deleted });
  });

  return { router, enabled: auth.enabled };
}

module.exports = { createAdmin };
