'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createWorker } = require('tesseract.js');
const { Worker } = require('worker_threads');

const MAX_PDF_PAGES = 6;
const OCR_TIMEOUT_MS = 60_000;
const PDF_TIMEOUT_MS = 20_000;
const MAX_PIXELS = 25_000_000; // הגנה מפצצות דחיסה בתמונות
const MAX_SIDE = 12_000;

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

/** קריאת PDF בתוך Worker מבודד עם תקרת זיכרון וזמן, שנהרג בסיום או בחריגה */
function pdfText(buf) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'pdf-worker.js'), {
      workerData: { buf, maxPages: MAX_PDF_PAGES },
      resourceLimits: { maxOldGenerationSizeMb: 192, maxYoungGenerationSizeMb: 32, stackSizeMb: 4 },
    });
    let done = false;
    const finish = (fn, v) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      worker.terminate().catch(() => {});
      fn(v);
    };
    const timer = setTimeout(() => {
      const e = new Error('PDF_TIMEOUT');
      e.code = 'OCR_TIMEOUT';
      finish(reject, e);
    }, PDF_TIMEOUT_MS);
    worker.once('message', (m) => {
      if (m.error) {
        const e = new Error('PDF_INVALID');
        e.code = 'UNSUPPORTED_TYPE';
        finish(reject, e);
      } else finish(resolve, m.text || '');
    });
    worker.once('error', () => {
      const e = new Error('PDF_FAILED');
      e.code = 'UNSUPPORTED_TYPE';
      finish(reject, e);
    });
    worker.once('exit', () => finish(reject, Object.assign(new Error('PDF_EXIT'), { code: 'UNSUPPORTED_TYPE' })));
  });
}

/** מימדי תמונה מהכותרת בלבד (בלי פענוח), כדי לדחות תמונות ענק לפני ה-OCR */
function imageSize(buf) {
  try {
    if (buf[0] === 0x89) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }; // PNG
    if (buf[0] === 0xff) { // JPEG: סריקת סמנים עד SOF
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) { i++; continue; }
        const m = buf[i + 1];
        if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
        i += 2 + buf.readUInt16BE(i + 2);
      }
      return null;
    }
    if (buf.slice(0, 4).toString('latin1') === 'RIFF') { // WEBP
      const t = buf.slice(12, 16).toString('latin1');
      if (t === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
      if (t === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
      if (t === 'VP8L') { const b = buf.readUInt32LE(21); return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 }; }
    }
  } catch {
    /* כותרת קטועה */
  }
  return null;
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
  const dim = imageSize(buf);
  if (!dim || !dim.w || !dim.h || dim.w > MAX_SIDE || dim.h > MAX_SIDE || dim.w * dim.h > MAX_PIXELS) {
    const e = new Error('IMAGE_DIMENSIONS');
    e.code = 'UNSUPPORTED_TYPE';
    throw e;
  }
  return { text: await ocrImage(buf), source: 'ocr' };
}

module.exports = { extractText, sniffType, ensureLangDir, imageSize };
