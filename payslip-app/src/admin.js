'use strict';

const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { sign, verify } = require('./billing');

const SESSION_HOURS = 8;
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();

function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

/**
 * ממשק אדמין לבעל האתר בלבד. מופעל רק כש-ADMIN_PASSWORD מוגדר (12 תווים ומעלה); אחרת כל הנתיבים מחזירים 404.
 * הסשן הוא עוגייה חתומה (HttpOnly, SameSite=Strict) שנגזרת מהסיסמה: החלפת הסיסמה מנתקת את כולם.
 */
function createAdmin({ store, password, secret, secure = false, now = () => Date.now() }) {
  const router = express.Router();
  const enabled = typeof password === 'string' && password.length >= 12;
  const COOKIE = secure ? '__Host-ps_admin' : 'ps_admin';
  const key = enabled ? `${secret}|admin|${password}` : '';

  router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!enabled) return res.status(404).json({ error: 'NOT_FOUND' });
    next();
  });

  const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: Number(process.env.ADMIN_LOGIN_LIMIT) || 5, standardHeaders: true, legacyHeaders: false, skipSuccessfulRequests: true, message: { error: 'RATE_LIMIT', message: 'יותר מדי ניסיונות. נסו שוב בעוד כרבע שעה.' } });

  const isAdmin = (req) => {
    const p = verify(readCookie(req, COOKIE) || '', key);
    return !!(p && p.t === 'admin');
  };
  const requireAdmin = (req, res, next) => (isAdmin(req) ? next() : res.status(401).json({ error: 'NOT_LOGGED_IN', message: 'יש להתחבר.' }));

  router.post('/login', loginLimiter, express.json({ limit: '2kb' }), (req, res) => {
    const given = req.body && typeof req.body.password === 'string' ? req.body.password.slice(0, 200) : '';
    // השוואה בזמן קבוע על גיבובים באורך קבוע
    if (!crypto.timingSafeEqual(sha(given), sha(password))) return res.status(401).json({ error: 'BAD_CREDENTIALS', message: 'הסיסמה שגויה.' });
    const token = sign({ t: 'admin', nonce: crypto.randomBytes(8).toString('base64url'), exp: Math.floor(now() / 1000) + SESSION_HOURS * 3600 }, key);
    res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'strict', secure, maxAge: SESSION_HOURS * 3600 * 1000, path: '/' });
    res.json({ ok: true });
  });

  router.post('/logout', (req, res) => { res.clearCookie(COOKIE, { path: '/' }); res.json({ ok: true }); });
  router.get('/me', (req, res) => res.json({ loggedIn: isAdmin(req) }));

  router.get('/tickets', requireAdmin, (req, res) => {
    res.json({ tickets: store.listTickets(200) });
  });

  router.post('/tickets/:id/status', requireAdmin, express.json({ limit: '1kb' }), (req, res) => {
    const id = Number(req.params.id);
    const status = req.body && req.body.status;
    if (!Number.isInteger(id) || id < 1 || (status !== 'new' && status !== 'closed')) return res.status(400).json({ error: 'BAD_INPUT' });
    store.setTicketStatus(id, status);
    res.json({ ok: true });
  });

  return { router, enabled };
}

module.exports = { createAdmin };
