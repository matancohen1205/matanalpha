'use strict';

const crypto = require('crypto');
const express = require('express');
const { sign, verify } = require('./billing');

const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;
const MAX_VAULT_CHARS = 262_144; // 256KB של טקסט מוצפן
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;
const B64URL = /^[A-Za-z0-9_-]+$/;

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const scryptHash = (key, salt) => crypto.scryptSync(key, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });

function hashAuth(authKey) {
  const salt = crypto.randomBytes(16);
  return `${salt.toString('hex')}:${scryptHash(authKey, salt).toString('hex')}`;
}
function checkAuth(authKey, stored) {
  const [saltHex, hashHex] = String(stored).split(':');
  const expected = Buffer.from(hashHex || '', 'hex');
  const actual = scryptHash(authKey, Buffer.from(saltHex || '', 'hex'));
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}
// לשוויון זמנים כשהחשבון לא קיים (מניעת enumeration לפי זמן תגובה)
const DUMMY = hashAuth('dummy-auth-key');

function validAuthKey(k) {
  return typeof k === 'string' && B64URL.test(k) && k.length >= 40 && k.length <= 48; // 32 בתים ב-base64url = 43 תווים
}
function validSealed(o) {
  return o && typeof o === 'object' && typeof o.iv === 'string' && typeof o.ct === 'string' && B64URL.test(o.iv) && B64URL.test(o.ct) && o.iv.length <= 24 && o.ct.length <= 200;
}
function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

/**
 * חשבונות עם הצפנה בצד הלקוח. השרת שומר: גיבוב של authKey, מפתח כספת עטוף (שהוא חסר ערך בלי הסיסמה/מפתח השחזור)
 * וכספת מוצפנת (blob אטום). הוא אינו יכול לקרוא את הנתונים.
 */
function createAccounts({ store, mailer, mailFrom, secret, publicUrl, secure = false, devEndpoints = false, setProCookie, isProCid, getProAuth, now = () => Date.now() }) {
  const router = express.Router();
  const COOKIE = secure ? '__Host-ps_sess' : 'ps_sess';
  const { db } = store;
  const q = {
    byEmail: db.prepare('SELECT * FROM accounts WHERE email_hash = ?'),
    byId: db.prepare('SELECT * FROM accounts WHERE id = ?'),
    insert: db.prepare('INSERT INTO accounts (email_hash, email_enc, auth_hash, wrapped_pw, wrapped_rec, created_at) VALUES (?,?,?,?,?,?)'),
    fail: db.prepare('UPDATE accounts SET fail_count = ?, locked_until = ? WHERE id = ?'),
    ok: db.prepare('UPDATE accounts SET fail_count = 0, locked_until = 0, last_login = ? WHERE id = ?'),
    verified: db.prepare('UPDATE accounts SET verified = 1 WHERE id = ?'),
    setAuth: db.prepare('UPDATE accounts SET auth_hash = ?, wrapped_pw = ?, fail_count = 0, locked_until = 0 WHERE id = ?'),
    setRec: db.prepare('UPDATE accounts SET wrapped_rec = ? WHERE id = ?'),
    vDel: db.prepare('DELETE FROM vaults WHERE account_id = ?'),
    setCid: db.prepare('UPDATE accounts SET cid_enc = ? WHERE id = ?'),
    del: db.prepare('DELETE FROM accounts WHERE id = ?'),
    sessIns: db.prepare('INSERT INTO sessions (token_hash, account_id, created_at, expires_at) VALUES (?,?,?,?)'),
    sessGet: db.prepare('SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?'),
    sessDel: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    sessDelAll: db.prepare('DELETE FROM sessions WHERE account_id = ?'),
    vGet: db.prepare('SELECT version, blob, updated_at FROM vaults WHERE account_id = ?'),
    vIns: db.prepare('INSERT INTO vaults (account_id, version, blob, updated_at) VALUES (?,?,?,?)'),
    vUpd: db.prepare('UPDATE vaults SET version = version + 1, blob = ?, updated_at = ? WHERE account_id = ? AND version = ?'),
  };
  const emailHash = (e) => store.hash('acct:' + e);
  const emailOf = (acc) => store.decrypt(acc.email_enc);

  router.use(express.json({ limit: '300kb' }));
  router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'POST' || req.method === 'PUT') {
      if (!req.is('application/json')) return res.status(415).json({ error: 'JSON_ONLY' });
    }
    next();
  });

  /* ---------- סשנים ---------- */
  function startSession(res, accId) {
    const token = crypto.randomBytes(32).toString('base64url');
    q.sessIns.run(sha256(token), accId, now(), now() + SESSION_TTL_MS);
    res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'strict', secure, maxAge: SESSION_TTL_MS, path: '/' });
  }
  function sessionOf(req) {
    const tok = readCookie(req, COOKIE);
    if (!tok || !B64URL.test(tok) || tok.length > 64) return null;
    const s = q.sessGet.get(sha256(tok), now());
    return s ? q.byId.get(s.account_id) : null;
  }
  function requireSession(req, res, next) {
    const acc = sessionOf(req);
    if (!acc) return res.status(401).json({ error: 'NOT_LOGGED_IN', message: 'יש להתחבר.' });
    req.acc = acc;
    next();
  }

  async function sendMail(to, subject, text) {
    if (!mailer) return false;
    try { await mailer.sendMail({ from: mailFrom, to, subject, text }); return true; } catch (e) { console.error('account mail failed:', e.code || e.name); return false; }
  }
  const mailToken = (type, accId, ttlMin) => sign({ t: type, aid: accId, nonce: crypto.randomBytes(12).toString('base64url'), exp: Math.floor(now() / 1000) + ttlMin * 60 }, secret);
  const readToken = (tok, type) => { const p = verify(tok, secret); return p && p.t === type && p.aid ? p : null; };

  /* ---------- הרשמה והתחברות ---------- */
  router.post('/register', async (req, res) => {
    const b = req.body || {};
    const email = String(b.email || '').trim().toLowerCase().slice(0, 120);
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'BAD_EMAIL', message: 'נא להזין כתובת אימייל תקינה.' });
    if (!validAuthKey(b.authKey) || !validSealed(b.wrappedPw) || !validSealed(b.wrappedRec)) return res.status(400).json({ error: 'BAD_MATERIAL', message: 'הבקשה אינה תקינה.' });
    if (q.byEmail.get(emailHash(email))) return res.status(409).json({ error: 'EMAIL_EXISTS', message: 'כבר קיים חשבון בכתובת הזו. אפשר להתחבר או לאפס סיסמה.' });
    const info = q.insert.run(emailHash(email), store.encrypt(email), hashAuth(b.authKey), JSON.stringify(b.wrappedPw), JSON.stringify(b.wrappedRec), now());
    const id = Number(info.lastInsertRowid);
    startSession(res, id);
    const sent = await sendMail(email, 'אימות כתובת האימייל בחשבון', `ברוכים הבאים!\n\nלאימות הכתובת לחצו (בתוקף 24 שעות):\n${publicUrl}/login.html?verify=${mailToken('verify', id, 24 * 60)}\n`);
    res.json({ ok: true, verified: false, mailSent: sent });
  });

  router.post('/login', async (req, res) => {
    const b = req.body || {};
    const email = String(b.email || '').trim().toLowerCase().slice(0, 120);
    const fail = () => res.status(401).json({ error: 'BAD_CREDENTIALS', message: 'אימייל או סיסמה שגויים.' });
    if (!EMAIL_RE.test(email) || !validAuthKey(b.authKey)) { checkAuth('x'.repeat(43), DUMMY); return fail(); }
    const acc = q.byEmail.get(emailHash(email));
    if (!acc) { checkAuth(b.authKey, DUMMY); return fail(); }
    if (Number(acc.locked_until) > now()) {
      return res.status(429).json({ error: 'LOCKED', message: 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.' });
    }
    if (!checkAuth(b.authKey, acc.auth_hash)) {
      const n = Number(acc.fail_count) + 1;
      q.fail.run(n >= MAX_FAILS ? 0 : n, n >= MAX_FAILS ? now() + LOCK_MS : 0, acc.id);
      return fail();
    }
    q.ok.run(now(), acc.id);
    startSession(res, acc.id);
    // מנוי מקושר מפעיל Pro אוטומטית (גם שחזור גישה)
    let pro = false;
    if (acc.cid_enc && setProCookie && isProCid) {
      const cid = store.decrypt(acc.cid_enc);
      if (await isProCid(cid)) { setProCookie(res, cid); pro = true; }
    }
    res.json({ ok: true, verified: !!acc.verified, wrappedPw: JSON.parse(acc.wrapped_pw), pro });
  });

  router.post('/logout', (req, res) => {
    const tok = readCookie(req, COOKIE);
    if (tok) q.sessDel.run(sha256(tok));
    res.clearCookie(COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  router.get('/me', (req, res) => {
    const acc = sessionOf(req);
    if (!acc) return res.json({ loggedIn: false });
    res.json({ loggedIn: true, email: emailOf(acc), verified: !!acc.verified, subscriptionLinked: !!acc.cid_enc, mailAvailable: !!mailer });
  });

  /* ---------- כספת מוצפנת (אטומה לשרת) ---------- */
  router.get('/vault', requireSession, (req, res) => {
    const v = q.vGet.get(req.acc.id);
    res.json(v ? { version: Number(v.version), blob: JSON.parse(v.blob) } : { version: 0, blob: null });
  });

  router.put('/vault', requireSession, (req, res) => {
    const b = req.body || {};
    const blobStr = JSON.stringify(b.blob || null);
    if (!validSealedBlob(b.blob) || blobStr.length > MAX_VAULT_CHARS) return res.status(400).json({ error: 'BAD_BLOB', message: 'הנתונים אינם תקינים או גדולים מדי.' });
    const expected = Number(b.version);
    if (!Number.isInteger(expected) || expected < 0) return res.status(400).json({ error: 'BAD_VERSION' });
    const cur = q.vGet.get(req.acc.id);
    if (!cur) {
      if (expected !== 0) return res.status(409).json({ error: 'CONFLICT', version: 0 });
      q.vIns.run(req.acc.id, 1, blobStr, now());
      return res.json({ ok: true, version: 1 });
    }
    const r = q.vUpd.run(blobStr, now(), req.acc.id, expected);
    if (Number(r.changes) !== 1) return res.status(409).json({ error: 'CONFLICT', message: 'הנתונים עודכנו ממכשיר אחר. רעננו ונסו שוב.', version: Number(cur.version) });
    res.json({ ok: true, version: expected + 1 });
  });
  function validSealedBlob(o) {
    return o && typeof o === 'object' && typeof o.iv === 'string' && typeof o.ct === 'string' && B64URL.test(o.iv) && B64URL.test(o.ct) && o.iv.length <= 24;
  }

  /* ---------- אימות אימייל ואיפוס סיסמה ---------- */
  router.post('/verify', (req, res) => {
    const p = readToken(req.body && req.body.token, 'verify');
    if (!p || !store.useNonce('ver:' + p.nonce)) return res.status(400).json({ error: 'BAD_TOKEN', message: 'הקישור אינו תקף או שכבר נוצל.' });
    q.verified.run(p.aid);
    res.json({ ok: true });
  });

  router.post('/resend-verification', requireSession, async (req, res) => {
    if (req.acc.verified) return res.json({ ok: true, already: true });
    const sent = await sendMail(emailOf(req.acc), 'אימות כתובת האימייל בחשבון', `לאימות הכתובת לחצו (בתוקף 24 שעות):\n${publicUrl}/login.html?verify=${mailToken('verify', req.acc.id, 24 * 60)}\n`);
    res.json({ ok: sent, message: sent ? 'נשלח.' : 'שליחת מייל אינה זמינה כרגע.' });
  });

  router.post('/forgot', async (req, res) => {
    const email = String((req.body && req.body.email) || '').trim().toLowerCase().slice(0, 120);
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'BAD_EMAIL', message: 'נא להזין כתובת אימייל תקינה.' });
    if (!mailer) return res.status(503).json({ error: 'NOT_AVAILABLE', message: 'איפוס סיסמה באימייל אינו זמין כרגע. פנו לשירות לקוחות.' });
    res.json({ ok: true, message: 'אם קיים חשבון בכתובת הזו, נשלח אליה קישור לאיפוס (בתוקף 30 דקות).' });
    const acc = q.byEmail.get(emailHash(email));
    if (!acc || store.bump('forgot:' + email) > 3) return;
    await sendMail(email, 'איפוס סיסמה', `התקבלה בקשה לאיפוס הסיסמה בחשבון שלכם ב"תלוש בעברית".\n\nלאיפוס לחצו על הקישור (בתוקף 30 דקות, שימוש חד-פעמי):\n${publicUrl}/login.html?reset=${mailToken('reset', acc.id, 30)}\n\nכדי לשמור על ההיסטוריה המוצפנת תצטרכו את מפתח השחזור שקיבלתם בהרשמה. אם אין לכם אותו, אפשר לאפס את הסיסמה אבל ההיסטוריה השמורה תימחק.\n\nאם לא ביקשתם, התעלמו מההודעה. הסיסמה שלכם לא תשתנה.\n`);
  });

  // מחזיר את המפתח העטוף במפתח השחזור, כדי שהדפדפן יפתח אותו ויעטוף מחדש בסיסמה חדשה
  router.post('/reset-info', (req, res) => {
    const p = readToken(req.body && req.body.token, 'reset');
    const acc = p && q.byId.get(p.aid);
    if (!acc) return res.status(400).json({ error: 'BAD_TOKEN', message: 'הקישור אינו תקף או שפג תוקפו.' });
    res.json({ wrappedRec: JSON.parse(acc.wrapped_rec), email: emailOf(acc) });
  });

  router.post('/reset', (req, res) => {
    const b = req.body || {};
    const p = readToken(b.token, 'reset');
    const acc = p && q.byId.get(p.aid);
    if (!acc || !validAuthKey(b.authKey) || !validSealed(b.wrappedPw)) return res.status(400).json({ error: 'BAD_TOKEN', message: 'הקישור אינו תקף או שפג תוקפו.' });
    // איפוס ללא מפתח שחזור: הכספת הישנה אינה ניתנת לפתיחה ולכן נמחקת, ומפתח שחזור חדש נקבע
    const wipe = b.wipe === true;
    if (wipe && !validSealed(b.wrappedRec)) return res.status(400).json({ error: 'BAD_MATERIAL', message: 'חומר ההצפנה אינו תקין.' });
    if (!store.useNonce('rst:' + p.nonce)) return res.status(409).json({ error: 'ALREADY_USED', message: 'הקישור כבר נוצל.' });
    q.setAuth.run(hashAuth(b.authKey), JSON.stringify(b.wrappedPw), acc.id);
    if (wipe) { q.setRec.run(JSON.stringify(b.wrappedRec), acc.id); q.vDel.run(acc.id); }
    q.sessDelAll.run(acc.id); // ניתוק כל המכשירים
    q.verified.run(acc.id); // הגעה לקישור במייל מוכיחה בעלות
    res.json({ ok: true });
  });

  router.post('/change-password', requireSession, (req, res) => {
    const b = req.body || {};
    if (!validAuthKey(b.oldAuthKey) || !validAuthKey(b.authKey) || !validSealed(b.wrappedPw)) return res.status(400).json({ error: 'BAD_MATERIAL' });
    if (!checkAuth(b.oldAuthKey, req.acc.auth_hash)) return res.status(401).json({ error: 'BAD_CREDENTIALS', message: 'הסיסמה הנוכחית שגויה.' });
    q.setAuth.run(hashAuth(b.authKey), JSON.stringify(b.wrappedPw), req.acc.id);
    q.sessDelAll.run(req.acc.id);
    startSession(res, req.acc.id);
    res.json({ ok: true });
  });

  router.post('/delete', requireSession, (req, res) => {
    const b = req.body || {};
    if (!validAuthKey(b.authKey) || !checkAuth(b.authKey, req.acc.auth_hash)) return res.status(401).json({ error: 'BAD_CREDENTIALS', message: 'הסיסמה שגויה.' });
    q.del.run(req.acc.id); // מוחק גם סשנים וכספת (ON DELETE CASCADE)
    res.clearCookie(COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  /* ---------- קישור מנוי Pro לחשבון ---------- */
  router.post('/link-subscription', requireSession, (req, res) => {
    const auth = getProAuth && getProAuth(req);
    if (!auth || !auth.cid) return res.status(402).json({ error: 'PRO_REQUIRED', message: 'כדי לקשר מנוי צריך להיות מחוברים עם מנוי Pro פעיל במכשיר הזה.' });
    q.setCid.run(store.encrypt(auth.cid), req.acc.id);
    res.json({ ok: true });
  });
  router.post('/unlink-subscription', requireSession, (req, res) => {
    q.setCid.run(null, req.acc.id);
    res.json({ ok: true });
  });

  if (devEndpoints) {
    router.get('/dev-token', (req, res) => {
      const acc = q.byEmail.get(emailHash(String(req.query.email || '').toLowerCase()));
      if (!acc) return res.status(404).end();
      res.json({ verify: mailToken('verify', acc.id, 60), reset: mailToken('reset', acc.id, 30) });
    });
  }

  return { router, sessionOf };
}

module.exports = { createAccounts };
