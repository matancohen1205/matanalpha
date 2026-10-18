'use strict';

const crypto = require('crypto');

const MAX_MEDIA_BYTES = 8 * 1024 * 1024;

/** מוודא שכתובת מדיה היא HTTPS חיצונית בלבד (הגנת SSRF). */
function assertSafeMediaUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw new Error('BAD_MEDIA_URL'); }
  const h = u.hostname.toLowerCase();
  const internal = h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || /^[\d.]+$/.test(h) || h.includes(':');
  if (u.protocol !== 'https:' || internal || u.username || u.password) throw new Error('BAD_MEDIA_URL');
}

/** השוואת מחרוזות בזמן קבוע. */
function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** לקוח Meta Cloud API: שליחת טקסט/תבנית והורדת מדיה. */
function createMetaClient({ phoneNumberId, token, version = 'v21.0', fetchImpl = fetch }) {
  const base = `https://graph.facebook.com/${version}`;
  const headers = { Authorization: `Bearer ${token}` };

  async function post(body) {
    const res = await fetchImpl(`${base}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...body }),
    });
    if (!res.ok) {
      const err = new Error(`WhatsApp API ${res.status}`);
      err.status = res.status;
      throw err;
    }
  }
  return {
    sendText: (to, text) => post({ to, type: 'text', text: { body: text, preview_url: false } }),
    sendTemplate: (to, name, lang = 'he', params = []) =>
      post({
        to,
        type: 'template',
        template: {
          name,
          language: { code: lang },
          ...(params.length ? { components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }] } : {}),
        },
      }),
    async downloadMedia(mediaId) {
      const meta = await fetchImpl(`${base}/${encodeURIComponent(mediaId)}`, { headers });
      if (!meta.ok) throw new Error('media lookup failed');
      const info = await meta.json();
      if (Number(info.file_size) > MAX_MEDIA_BYTES) {
        const e = new Error('TOO_LARGE');
        e.code = 'TOO_LARGE';
        throw e;
      }
      // כתובת ההורדה מגיעה מתשובת Meta, ובכל זאת מאמתים אותה: HTTPS בלבד ולא כתובת פנימית (הגנת SSRF)
      assertSafeMediaUrl(info.url);
      const file = await fetchImpl(info.url, { headers, redirect: 'error' });
      if (!file.ok) throw new Error('media download failed');
      const buffer = Buffer.from(await file.arrayBuffer());
      if (buffer.length > MAX_MEDIA_BYTES) {
        const e = new Error('TOO_LARGE');
        e.code = 'TOO_LARGE';
        throw e;
      }
      return buffer;
    },
  };
}

module.exports = { assertSafeMediaUrl, safeEqual, createMetaClient };
