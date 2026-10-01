/*
 * הצפנה בצד הלקוח לחשבון המשתמש (zero-knowledge).
 *
 *  סיסמה + אימייל --PBKDF2(600K)--> 64 בתים
 *     ├─ 32 הראשונים: authKey  (נשלח לשרת, שמגבב אותו שוב; אי אפשר לשחזר ממנו את הסיסמה או את מפתח ההצפנה)
 *     └─ 32 האחרונים: wrapKey  (נשאר בדפדפן; עוטף את vaultKey)
 *  vaultKey: מפתח AES-GCM אקראי (256 ביט) שמצפין את כל הנתונים. נשמר בשרת רק עטוף (פעם בסיסמה ופעם במפתח שחזור).
 *  השרת לעולם לא רואה סיסמה, wrapKey או vaultKey. שכחתם סיסמה: מפתח השחזור פותח את vaultKey (אין דרך אחרת).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(globalThis.crypto);
  else root.VaultCrypto = factory(root.crypto);
})(typeof self !== 'undefined' ? self : this, function (crypto) {
  'use strict';

  var ITERATIONS = 600000;
  var enc = new TextEncoder();
  var dec = new TextDecoder();
  var AAD = enc.encode('tlush-vault:v1');
  var subtle = crypto.subtle;

  function b64(bytes) {
    var s = '';
    var u = new Uint8Array(bytes);
    for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function unb64(str) {
    var s = String(str).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s);
    var u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  function normEmail(e) { return String(e).trim().toLowerCase(); }

  /** מפיק authKey (לשרת) ו-wrapKey (נשאר בדפדפן) מהסיסמה */
  async function deriveFromPassword(password, email, iterations) {
    var base = await subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    var bits = new Uint8Array(await subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode('tlush-v1:' + normEmail(email)), iterations: iterations || ITERATIONS, hash: 'SHA-256' }, base, 512));
    var wrapKey = await subtle.importKey('raw', bits.slice(32), 'AES-GCM', false, ['encrypt', 'decrypt']);
    return { authKey: b64(bits.slice(0, 32)), wrapKey: wrapKey };
  }

  function randomBytes(n) { return crypto.getRandomValues(new Uint8Array(n)); }

  async function seal(keyOrBytes, plain) {
    var key = keyOrBytes instanceof Uint8Array ? await subtle.importKey('raw', keyOrBytes, 'AES-GCM', false, ['encrypt']) : keyOrBytes;
    var iv = randomBytes(12);
    var ct = await subtle.encrypt({ name: 'AES-GCM', iv: iv, additionalData: AAD }, key, plain);
    return { iv: b64(iv), ct: b64(ct) };
  }
  async function open(keyOrBytes, sealed) {
    var key = keyOrBytes instanceof Uint8Array ? await subtle.importKey('raw', keyOrBytes, 'AES-GCM', false, ['decrypt']) : keyOrBytes;
    return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: unb64(sealed.iv), additionalData: AAD }, key, unb64(sealed.ct)));
  }

  /** יצירת חשבון: מפתח כספת אקראי + מפתח שחזור. מחזיר גם את מה שנשלח לשרת. */
  async function createAccountMaterial(password, email) {
    var d = await deriveFromPassword(password, email);
    var vaultKey = randomBytes(32);
    var recoveryBytes = randomBytes(16);
    var recKey = await recoveryWrapKey(recoveryBytes);
    return {
      authKey: d.authKey,
      vaultKey: vaultKey,
      recoveryKey: formatRecovery(recoveryBytes),
      wrappedPw: await seal(d.wrapKey, vaultKey),
      wrappedRec: await seal(recKey, vaultKey),
    };
  }

  async function recoveryWrapKey(bytes) {
    var h = await subtle.digest('SHA-256', new Uint8Array([].concat(Array.from(enc.encode('tlush-recovery-v1:')), Array.from(bytes))));
    return subtle.importKey('raw', h, 'AES-GCM', false, ['encrypt', 'decrypt']);
  }

  var ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Base32 בלי תווים מבלבלים
  function formatRecovery(bytes) {
    var bits = '';
    for (var i = 0; i < bytes.length; i++) bits += bytes[i].toString(2).padStart(8, '0');
    var out = '';
    for (var j = 0; j + 5 <= bits.length; j += 5) out += ALPHA[parseInt(bits.slice(j, j + 5), 2)];
    out += ALPHA[parseInt(bits.slice(125).padEnd(5, '0'), 2)];
    return out.match(/.{1,4}/g).join('-');
  }
  function parseRecovery(text) {
    var s = String(text).toUpperCase().replace(/[^A-Z2-9]/g, '');
    var bits = '';
    for (var i = 0; i < s.length; i++) {
      var v = ALPHA.indexOf(s[i]);
      if (v < 0) throw new Error('BAD_RECOVERY_KEY');
      bits += v.toString(2).padStart(5, '0');
    }
    if (bits.length < 128) throw new Error('BAD_RECOVERY_KEY');
    var bytes = new Uint8Array(16);
    for (var k = 0; k < 16; k++) bytes[k] = parseInt(bits.slice(k * 8, k * 8 + 8), 2);
    return bytes;
  }

  /** פתיחת מפתח הכספת בסיסמה (אחרי התחברות) */
  async function unwrapWithPassword(password, email, wrappedPw) {
    var d = await deriveFromPassword(password, email);
    return open(d.wrapKey, wrappedPw);
  }
  async function unwrapWithRecovery(recoveryText, wrappedRec) {
    return open(await recoveryWrapKey(parseRecovery(recoveryText)), wrappedRec);
  }
  /** סיסמה חדשה (שינוי/איפוס): עוטפים מחדש את אותו vaultKey */
  async function rewrapForNewPassword(newPassword, email, vaultKey) {
    var d = await deriveFromPassword(newPassword, email);
    return { authKey: d.authKey, wrappedPw: await seal(d.wrapKey, vaultKey) };
  }

  async function encryptJson(vaultKey, obj) {
    return seal(vaultKey, enc.encode(JSON.stringify(obj)));
  }
  async function decryptJson(vaultKey, sealed) {
    return JSON.parse(dec.decode(await open(vaultKey, sealed)));
  }

  return {
    ITERATIONS: ITERATIONS, b64: b64, unb64: unb64,
    deriveFromPassword: deriveFromPassword, createAccountMaterial: createAccountMaterial,
    unwrapWithKey: open, unwrapWithPassword: unwrapWithPassword, unwrapWithRecovery: unwrapWithRecovery, rewrapForNewPassword: rewrapForNewPassword,
    encryptJson: encryptJson, decryptJson: decryptJson, parseRecovery: parseRecovery, formatRecovery: formatRecovery,
  };
});
