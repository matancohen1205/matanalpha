'use strict';

const crypto = require('crypto');
const express = require('express');
const { sign } = require('../../services/billing/tokens');
const { createEngine } = require('../../services/whatsapp/engine');
const { safeEqual } = require('../../services/whatsapp/meta-client');

const LINK_TTL_S = 30 * 60;

/** נתיבי הוואטסאפ: webhook מ-Meta (חתום), ו-API לאתר (חיבור/ניתוק/סטטוס, למנויי Pro). */
function createWhatsApp(cfg) {
  const { store, client, secret, businessNumber, verifyToken, appSecret, getAuth, devUnlock = false, siteUrl, isPro, devEndpoints = false } = cfg;
  const engine = createEngine({ store, client, secret, isPro, siteUrl, extract: cfg.extract });
  const router = express.Router();
  const configured = !!(client && businessNumber);

  // ---- Webhook מ-Meta (גוף גולמי לצורך אימות חתימה) ----
  router.get('/webhook', (req, res) => {
    if (verifyToken && req.query['hub.mode'] === 'subscribe' && typeof req.query['hub.verify_token'] === 'string' && safeEqual(req.query['hub.verify_token'], verifyToken)) {
      return res.type('text').send(String(req.query['hub.challenge'] || ''));
    }
    res.sendStatus(403);
  });

  router.post('/webhook', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
    const sig = String(req.headers['x-hub-signature-256'] || '');
    const expected = 'sha256=' + crypto.createHmac('sha256', appSecret || '').update(req.body || Buffer.alloc(0)).digest('hex');
    const ok = appSecret && sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    if (!ok) return res.sendStatus(401);
    res.sendStatus(200); // עונים מיד, מעבדים ברקע
    let payload;
    try {
      payload = JSON.parse(req.body.toString('utf8'));
    } catch {
      return;
    }
    for (const entry of payload.entry || []) {
      for (const ch of entry.changes || []) {
        for (const m of (ch.value && ch.value.messages) || []) {
          engine.handle(m).catch((e) => console.error('wa handle failed:', e.name));
        }
      }
    }
  });

  // ---- API לאתר (מנויי Pro בלבד) ----
  const json = express.json({ limit: '5kb' });
  function identity(req) {
    const a = getAuth(req);
    if (!a) return null;
    return a.cid || (a.dev && devUnlock ? 'dev' : null);
  }
  const mask = (p) => `${'•'.repeat(Math.max(0, p.length - 3))}${p.slice(-3)}`;

  router.get('/status', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const cid = identity(req);
    if (!cid) return res.json({ configured, pro: false });
    const u = store.getByCid(cid);
    res.json({ configured, pro: true, linked: !!u, phone: u ? mask(u.phone) : null });
  });

  router.post('/link', json, (req, res) => {
    const cid = identity(req);
    if (!cid) return res.status(402).json({ error: 'PRO_REQUIRED', message: 'החיבור זמין למנויי Pro.' });
    if (!configured) return res.status(503).json({ error: 'NOT_CONFIGURED', message: 'שירות הוואטסאפ עדיין לא הופעל באתר.' });
    if (!req.body || req.body.consent !== true) {
      return res.status(400).json({ error: 'CONSENT_REQUIRED', message: 'יש לאשר קבלת הודעות כדי להמשיך.' });
    }
    const token = sign({ t: 'wa-link', cid, nonce: crypto.randomBytes(12).toString('base64url'), exp: Math.floor(Date.now() / 1000) + LINK_TTL_S }, secret);
    const text = `חיבור: ${token}`;
    res.json({ url: `https://wa.me/${businessNumber}?text=${encodeURIComponent(text)}`, expiresInMinutes: LINK_TTL_S / 60 });
  });

  router.post('/unlink', json, (req, res) => {
    const cid = identity(req);
    if (!cid) return res.status(402).json({ error: 'PRO_REQUIRED' });
    const u = store.getByCid(cid);
    if (u) store.deleteUser(u.id);
    res.json({ linked: false });
  });

  if (devEndpoints) {
    // סימולציית הודעה נכנסת בפיתוח מקומי בלבד
    router.post('/dev-inbound', json, async (req, res) => {
      await engine.handle({ id: `dev-${Date.now()}-${Math.random()}`, from: String(req.body.from), type: 'text', text: { body: String(req.body.text || '') } });
      res.json({ ok: true });
    });
  }

  return { router, engine, configured };
}

module.exports = { createWhatsApp };
