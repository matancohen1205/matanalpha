'use strict';

const express = require('express');
const multer = require('multer');
const { analyzePayslip } = require('../services/payslip/analyzer');
const { extractText } = require('../services/extraction/extract');
const { createConcurrencyGate } = require('../middleware/concurrency-gate');
const { MAX_FILE_BYTES, MAX_TEXT_CHARS, MAX_CONCURRENT_JOBS } = require('../config/limits');
const { ANALYZE_ERRORS } = require('../config/messages');

/** מעלה קבצים לזיכרון בלבד (בלי כתיבה לדיסק), קובץ אחד, ללא שדות טקסט. */
function createUploader() {
  return multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 0, parts: 2 } });
}

/** מטפל בקובץ שהועלה: מחלץ טקסט (OCR/PDF), מנתח ומחזיר תשובה; שגיאות מוכרות כ-422 והשאר כ-500 כללי. */
function handleAnalyzeFile(withSlot) {
  return (req, res) => withSlot(res, async () => {
    if (!req.file) return res.status(400).json({ error: 'NO_FILE', message: 'לא נבחר קובץ.' });
    try {
      const { text, source } = await extractText(req.file.buffer);
      res.json({ ok: true, source, ...analyzePayslip(text) });
    } catch (err) {
      const code = err.code || err.message;
      if (ANALYZE_ERRORS[code]) return res.status(422).json({ error: code, message: ANALYZE_ERRORS[code] });
      console.error('analyze failed:', err.name); // רק סוג השגיאה, בלי תוכן או שם קובץ
      res.status(500).json({ error: 'FAILED', message: 'לא הצלחנו לקרוא את הקובץ. נסו קובץ אחר.' });
    } finally {
      req.file.buffer = null;
    }
  });
}

/** מטפל בטקסט מודבק ידנית (חלופה להעלאת קובץ). */
function handleAnalyzeText(req, res) {
  const text = typeof req.body?.text === 'string' ? req.body.text.slice(0, MAX_TEXT_CHARS) : '';
  if (text.trim().length < 10) return res.status(400).json({ error: 'NO_TEXT', message: 'יש להדביק טקסט של התלוש.' });
  res.json({ ok: true, source: 'text', ...analyzePayslip(text) });
}

/** מחבר את נתיבי הסריקה: POST /analyze (קובץ) ו-POST /analyze-text (טקסט). */
function mountAnalyze(api, { limiters }) {
  const withSlot = createConcurrencyGate(MAX_CONCURRENT_JOBS);
  api.post('/analyze', limiters.heavy, createUploader().single('payslip'), handleAnalyzeFile(withSlot));
  api.post('/analyze-text', limiters.heavy, express.json({ limit: '100kb' }), handleAnalyzeText);
}

module.exports = { mountAnalyze };
