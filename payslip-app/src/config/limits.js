'use strict';

/** קבועי גודל, זמן וקצב של השרת, במקום אחד. */
module.exports = Object.freeze({
  MAX_FILE_BYTES: 8 * 1024 * 1024, // גודל קובץ תלוש מקסימלי
  MAX_TEXT_CHARS: 40_000, // אורך טקסט מודבק מקסימלי
  MAX_CONCURRENT_JOBS: 2, // סריקות כבדות במקביל
  RATE_WINDOW_MS: 10 * 60 * 1000, // חלון הגבלת קצב
  GENERAL_LIMIT: 300, // בקשות API כלליות לחלון
  DEFAULT_AUTH_LIMIT: 30, // התחברות/הרשמה/איפוס לחלון
  DEFAULT_HEAVY_LIMIT: 20, // סריקה/השוואה/תשלום לחלון
  TIMEOUT_ANALYZE_MS: 90_000, // זמן מקסימלי לבקשת סריקה
  TIMEOUT_API_MS: 30_000, // זמן מקסימלי לשאר בקשות ה-API
  SERVER: Object.freeze({ headersTimeout: 20_000, requestTimeout: 100_000, keepAliveTimeout: 5_000, maxHeadersCount: 60, maxConnections: 1000 }),
  DAY_MS: 24 * 3600 * 1000,
});
