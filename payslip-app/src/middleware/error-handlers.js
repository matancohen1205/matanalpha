'use strict';

const multer = require('multer');

const MULTIPART_ERROR = /multipart|boundary|unexpected end of form|malformed part|header size|too many (parts|files|fields)/i;

/** 404 ל-API: JSON קבוע, בלי להחזיר את הנתיב שהתבקש. */
function apiNotFound(req, res) {
  res.status(404).json({ error: 'NOT_FOUND' });
}

/** 404 כללי: טקסט קבוע בלי הדהוד של הנתיב ובלי פרטי שרת. */
function notFound(req, res) {
  res.status(404).type('text/plain; charset=utf-8').send('Not found');
}

/** ממפה שגיאה מוכרת של קלט לקוח לתשובת 4xx, או null אם זו שגיאת שרת. */
function mapClientError(err) {
  if (err instanceof multer.MulterError) {
    const tooBig = err.code === 'LIMIT_FILE_SIZE';
    return { status: tooBig ? 413 : 400, body: { error: err.code, message: tooBig ? 'הקובץ גדול מדי (עד 8MB).' : 'הבקשה אינה תקינה.' } };
  }
  if (MULTIPART_ERROR.test(String(err.message))) return { status: 400, body: { error: 'BAD_FORM', message: 'הבקשה אינה תקינה.' } };
  if (err.type === 'entity.parse.failed') return { status: 400, body: { error: 'BAD_JSON', message: 'הבקשה אינה תקינה.' } };
  if (err.type === 'entity.too.large') return { status: 413, body: { error: 'TOO_LARGE', message: 'הטקסט ארוך מדי.' } };
  return null;
}

/** מטפל שגיאות אחרון: שגיאות לקוח כ-4xx, וכל השאר כ-500 כללי בלי חשיפת פרטים. */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const mapped = mapClientError(err);
  if (mapped) return res.status(mapped.status).json(mapped.body);
  console.error('server error:', err.name);
  res.status(500).json({ error: 'FAILED', message: 'שגיאה בשרת.' });
}

module.exports = { apiNotFound, notFound, errorHandler };
