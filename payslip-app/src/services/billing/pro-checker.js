'use strict';

const CACHE_MS = 6 * 3600 * 1000;

/** בודק אם ללקוח יש מנוי פעיל, עם מטמון של 6 שעות (לשימוש שירותי רקע כמו וואטסאפ). */
function createProChecker({ gateway, devUnlock }) {
  const cache = new Map();
  /** true אם הלקוח מנוי פעיל; כשל ב-Stripe מחזיר את התוצאה האחרונה שנשמרה. */
  return async function isProCid(cid) {
    if (cid === 'dev') return devUnlock;
    if (!gateway.available || !cid) return false;
    const hit = cache.get(cid);
    if (hit && hit.until > Date.now()) return hit.value;
    let value = false;
    try {
      value = await gateway.hasActiveSubscription(cid);
    } catch {
      return hit ? hit.value : false;
    }
    cache.set(cid, { value, until: Date.now() + CACHE_MS });
    return value;
  };
}

module.exports = { createProChecker };
