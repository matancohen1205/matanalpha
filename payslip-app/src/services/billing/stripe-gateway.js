'use strict';

const ACTIVE_STATUSES = ['active', 'trialing', 'past_due'];

/** עוטף את קריאות Stripe שהאתר צריך; בלי לקוח Stripe (null) כל הפעולות לא זמינות. */
function createStripeGateway({ stripe, publicUrl }) {
  /** האם ללקוח יש מנוי פעיל (כולל ניסיון וחוב זמני). */
  async function hasActiveSubscription(customerId) {
    const subs = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 5 });
    return subs.data.some((s) => ACTIVE_STATUSES.includes(s.status));
  }

  return {
    available: !!stripe,
    hasActiveSubscription,
    /** פותח דף תשלום (Checkout) למנוי במחיר נתון ומחזיר את ה-URL. */
    async createCheckoutUrl(price) {
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price, quantity: 1 }],
        success_url: `${publicUrl}/pricing.html?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${publicUrl}/pricing.html?canceled=1`,
        locale: 'he',
        allow_promotion_codes: true,
        billing_address_collection: 'auto',
        custom_text: { submit: { message: `בלחיצה על התשלום אתם מאשרים את [תנאי השימוש](${publicUrl}/terms.html) ואת [מדיניות הפרטיות](${publicUrl}/privacy.html). ניתן לבטל בכל עת.` } },
      });
      return session.url;
    },
    /** שולף סשן תשלום כולל פריטי החיוב (לאימות הפעלה). */
    retrieveCheckout: (id) => stripe.checkout.sessions.retrieve(id, { expand: ['line_items'] }),
    /** פותח את פורטל ניהול המנוי של Stripe ומחזיר את ה-URL. */
    async createPortalUrl(customerId) {
      const p = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: `${publicUrl}/pricing.html` });
      return p.url;
    },
    /** מוצא מזהה לקוח עם מנוי פעיל לפי אימייל (בודק גם אותיות קטנות), או null. */
    async findActiveCustomerId(email) {
      for (const e of new Set([email, email.toLowerCase()])) {
        const list = await stripe.customers.list({ email: e, limit: 10 });
        for (const c of list.data) if (await hasActiveSubscription(c.id)) return c.id;
      }
      return null;
    },
  };
}

module.exports = { createStripeGateway };
