'use strict';

const rateLimit = require('express-rate-limit');
const L = require('../config/limits');

const MESSAGE = { error: 'RATE_LIMIT', message: 'יותר מדי בקשות. נסו שוב בעוד מספר דקות.' };

/** יוצר מגביל קצב לפי מספר בקשות לחלון. */
function makeLimiter(limit) {
  return rateLimit({ windowMs: L.RATE_WINDOW_MS, limit, standardHeaders: true, legacyHeaders: false, message: MESSAGE });
}

/** יוצר את שלושת המגבילים: כללי, התחברות/הרשמה, ופעולות כבדות (סריקה/השוואה/תשלום). */
function createRateLimiters(env) {
  return {
    general: makeLimiter(L.GENERAL_LIMIT),
    auth: makeLimiter(Number(env.RATE_LIMIT_AUTH) || L.DEFAULT_AUTH_LIMIT),
    heavy: makeLimiter(Number(env.RATE_LIMIT_HEAVY) || L.DEFAULT_HEAVY_LIMIT),
  };
}

/** מפעיל מגביל רק כשהתנאי מתקיים על הבקשה (למשל POST בלבד), ואחרת ממשיך הלאה. */
function limitWhen(predicate, limiter) {
  return (req, res, next) => (predicate(req) ? limiter(req, res, next) : next());
}

module.exports = { createRateLimiters, limitWhen };
