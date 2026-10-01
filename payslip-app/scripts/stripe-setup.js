'use strict';
/**
 * הקמה חד-פעמית ב-Stripe: מוצר + מחיר חודשי בשקלים + הגדרות Customer Portal.
 * שימוש:  STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-setup.js
 * אופציונלי: PRICE_AMOUNT_AGOROT=1990 (ברירת מחדל 19.90 ₪)
 * בסוף מודפס STRIPE_PRICE_ID להעתקה ל-.env
 */
const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error('חסר STRIPE_SECRET_KEY');
  process.exit(1);
}
const stripe = require('stripe')(key);
const amount = Number(process.env.PRICE_AMOUNT_AGOROT) || 1990;

(async () => {
  const product = await stripe.products.create({
    name: 'תלוש בעברית Pro',
    description: 'השוואת תלושים בין חודשים, מגמות והתראות, וייצוא CSV',
  });
  const price = await stripe.prices.create({
    product: product.id,
    currency: 'ils',
    unit_amount: amount,
    recurring: { interval: 'month' },
  });
  const yearlyAmount = Number(process.env.PRICE_AMOUNT_YEARLY_AGOROT) || amount * 10; // חודשיים מתנה
  const yearly = await stripe.prices.create({
    product: product.id,
    currency: 'ils',
    unit_amount: yearlyAmount,
    recurring: { interval: 'year' },
  });
  const portal = await stripe.billingPortal.configurations.create({
    business_profile: { headline: 'ניהול מנוי Pro' },
    features: {
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      customer_update: { enabled: true, allowed_updates: ['email', 'name', 'address'] },
      subscription_cancel: { enabled: true, mode: 'at_period_end' },
    },
  });
  console.log('נוצר בהצלחה.\n');
  console.log(`STRIPE_PRICE_ID=${price.id}`);
  console.log(`PRICE_LABEL=${(amount / 100).toFixed(2)} ₪ לחודש`);
  console.log(`STRIPE_PRICE_ID_YEARLY=${yearly.id}`);
  console.log(`PRICE_LABEL_YEARLY=${(yearlyAmount / 100).toFixed(0)} ₪ לשנה (חודשיים מתנה)`);
  console.log(`(Customer Portal: ${portal.id})`);
})().catch((e) => {
  console.error('נכשל:', e.message);
  process.exit(1);
});
