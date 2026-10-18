'use strict';

const { LANG_NAMES, PAGES } = require('./links');
const { systemPrompt } = require('./prompt');
const { normalizeMessages, parseReply } = require('./messages');
const { createAnthropicClient } = require('./anthropic-client');
const { createDailyCap } = require('./daily-cap');

const MAX_REPLY_CHARS = 2000;

/** שירות סוכן הצ'אט: מנקה קלט, בונה הנחיה, פונה ל-Claude ומחזיר תשובה מובנית. */
function createAgentService({ apiKey, model, fetchImpl, dailyLimit = 2000, config = {}, now = () => Date.now() }) {
  const ask = createAnthropicClient({ apiKey, model, fetchImpl });
  const overCap = createDailyCap({ limit: dailyLimit, now });
  return {
    enabled: !!apiKey,
    /** מחזיר null אם ההיסטוריה לא תקינה, או את ההיסטוריה המנוקה. */
    normalize: normalizeMessages,
    /** האם חרגנו מתקרת ההודעות היומית. */
    overDailyCap: overCap,
    /** מנסח תשובה לשיחה; lang ו-page מסוננים מול רשימות לבנות (מניעת הזרקה להנחיה). */
    async reply(messages, { lang, page }) {
      const ctx = { lang: LANG_NAMES[lang] ? lang : '', page: typeof page === 'string' && PAGES[page.slice(0, 40)] ? page.slice(0, 40) : '' };
      const text = await ask(systemPrompt(config, ctx), messages);
      return parseReply(text.slice(0, MAX_REPLY_CHARS));
    },
  };
}

module.exports = { createAgentService };
