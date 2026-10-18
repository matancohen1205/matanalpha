'use strict';

/** הודעות שגיאה למשתמש לפי קוד שגיאה של חילוץ הטקסט מהתלוש. */
const ANALYZE_ERRORS = Object.freeze({
  UNSUPPORTED_TYPE: 'סוג הקובץ אינו נתמך. אפשר להעלות PDF, JPG, PNG או WEBP.',
  SCANNED_PDF: 'ה-PDF נראה כסרוק (ללא טקסט). אפשר לצלם מסך או להעלות אותו כתמונה (JPG/PNG).',
  OCR_TIMEOUT: 'קריאת התלוש לקחה יותר מדי זמן. נסו תמונה חדה וקטנה יותר.',
});

module.exports = { ANALYZE_ERRORS };
