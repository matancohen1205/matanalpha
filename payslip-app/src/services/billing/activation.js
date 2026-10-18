'use strict';

const DAY_S = 24 * 3600;

/**
 * האם סשן תשלום של Stripe מצדיק הפעלת Pro: הושלם, שולם, טרי (24 שעות), מנוי, והמחיר הוא אחד משלנו
 * (ולא עסקה אחרת באותו חשבון Stripe).
 */
function isValidActivation(session, ourPrices, nowSec = Date.now() / 1000) {
  const fresh = nowSec - session.created < DAY_S;
  const paid = ['paid', 'no_payment_required'].includes(session.payment_status || 'paid');
  const items = (session.line_items && session.line_items.data) || null;
  const ours = !ourPrices.length || !items || items.some((li) => li.price && ourPrices.includes(li.price.id));
  const subscription = !session.mode || session.mode === 'subscription';
  return session.status === 'complete' && !!session.customer && fresh && paid && subscription && ours;
}

/** מחלץ מזהה לקוח מסשן תשלום (מחרוזת או אובייקט). */
const customerIdOf = (session) => (typeof session.customer === 'string' ? session.customer : session.customer.id);

module.exports = { isValidActivation, customerIdOf };
