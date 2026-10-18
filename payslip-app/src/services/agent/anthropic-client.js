'use strict';

const API_URL = 'https://api.anthropic.com/v1/messages';
const TIMEOUT_MS = 25_000;
const MAX_TOKENS = 600;

/** יוצר לקוח שפונה ל-API של Claude; fetchImpl ניתן להחלפה בבדיקות. */
function createAnthropicClient({ apiKey, model, fetchImpl = fetch }) {
  /**
   * שולח שיחה עם הנחיית מערכת ומחזיר את טקסט התשובה; זורק Error עם code=UPSTREAM/EMPTY בכשל.
   * @param {string} system
   * @param {{role:string, content:string}[]} messages
   */
  return async function ask(system, messages) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const r = await fetchImpl(API_URL, {
        method: 'POST',
        signal: ctl.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: MAX_TOKENS, system, messages }),
      });
      if (!r.ok) { console.error('agent upstream status:', r.status); throw Object.assign(new Error('upstream'), { code: 'UPSTREAM' }); }
      const data = await r.json();
      const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      if (!text) throw Object.assign(new Error('empty'), { code: 'EMPTY' });
      return text;
    } catch (e) {
      if (e.code) throw e;
      console.error('agent failed:', e.name);
      throw Object.assign(new Error('upstream'), { code: 'UPSTREAM' });
    } finally {
      clearTimeout(timer);
    }
  };
}

module.exports = { createAnthropicClient };
