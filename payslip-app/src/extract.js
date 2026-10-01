'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createWorker } = require('tesseract.js');
const pdfParse = require('pdf-parse/lib/pdf-parse.js');

const MAX_PDF_PAGES = 6;
const OCR_TIMEOUT_MS = 60_000;

/** מכין תיקיית שפות מקומית (ללא הורדה מהאינטרנט בזמן ריצה) */
function ensureLangDir() {
  const dir = path.join(__dirname, '..', '.tessdata');
  fs.mkdirSync(dir, { recursive: true });
  for (const lang of ['heb', 'eng']) {
    const dest = path.join(dir, `${lang}.traineddata.gz`);
    if (!fs.existsSync(dest)) {
      const src = require.resolve(`@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`);
      fs.copyFileSync(src, dest);
    }
  }
  return dir;
}

/** זיהוי סוג הקובץ לפי תוכן (magic bytes) ולא לפי שם או header שהלקוח שולח */
function sniffType(buf) {
  if (buf.length < 12) return null;
  if (buf.slice(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image';
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return 'image';
  return null;
}

async function ocrImage(buf) {
  const langPath = ensureLangDir();
  const worker = await createWorker('heb+eng', 1, {
    langPath,
    gzip: true,
    cacheMethod: 'none',
    logger: () => {},
  });
  let timer;
  try {
    const result = await Promise.race([
      worker.recognize(buf),
      new Promise((_, rej) => {
        timer = setTimeout(() => rej(new Error('OCR_TIMEOUT')), OCR_TIMEOUT_MS);
      }),
    ]);
    return result.data.text || '';
  } finally {
    clearTimeout(timer);
    await worker.terminate().catch(() => {});
  }
}

async function pdfText(buf) {
  const data = await pdfParse(buf, { max: MAX_PDF_PAGES });
  return data.text || '';
}

/**
 * מחלץ טקסט מקובץ בזיכרון בלבד. שום דבר לא נכתב לדיסק (מלבד קבצי השפה הסטטיים).
 * @returns {{ text: string, source: 'pdf'|'ocr' }}
 */
async function extractText(buf) {
  const type = sniffType(buf);
  if (!type) {
    const e = new Error('UNSUPPORTED_TYPE');
    e.code = 'UNSUPPORTED_TYPE';
    throw e;
  }
  if (type === 'pdf') {
    const text = await pdfText(buf);
    if (text.replace(/\s/g, '').length < 40) {
      const e = new Error('SCANNED_PDF');
      e.code = 'SCANNED_PDF';
      throw e;
    }
    return { text, source: 'pdf' };
  }
  return { text: await ocrImage(buf), source: 'ocr' };
}

module.exports = { extractText, sniffType, ensureLangDir };
