'use strict';
/**
 * קורא טקסט מ-PDF בתוך Worker מבודד (זיכרון וזמן מוגבלים ע"י התהליך הראשי).
 * pdf.js מעודכן, עם הרצת קוד דינמי (isEvalSupported) כבויה, כדי לסגור את משפחת הפרצות
 * של פונטים זדוניים (CVE-2024-4367) שהייתה בגרסה הישנה שהוטמעה ב-pdf-parse.
 */
const { parentPort, workerData } = require('worker_threads');

(async () => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({
    data: new Uint8Array(workerData.buf),
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    useWorkerFetch: false,
    isOffscreenCanvasSupported: false,
    enableXfa: false,
    verbosity: 0,
  });
  const doc = await task.promise;

  const pages = Math.min(doc.numPages, workerData.maxPages);
  const out = [];
  for (let p = 1; p <= pages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // קיבוץ לשורות לפי גובה, ובתוך שורה מימין לשמאל (עברית)
    const rows = new Map();
    for (const it of content.items) {
      if (!it.str || !it.str.trim()) continue;
      const y = Math.round(it.transform[5] / 3);
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push({ x: it.transform[4], s: it.str });
    }
    [...rows.keys()]
      .sort((a, b) => b - a)
      .forEach((y) => out.push(rows.get(y).sort((a, b) => b.x - a.x).map((i) => i.s).join(' ')));
  }
  await task.destroy();
  parentPort.postMessage({ text: out.join('\n') });
})().catch((e) => parentPort.postMessage({ error: String((e && e.name) || 'PDF_ERROR') }));
