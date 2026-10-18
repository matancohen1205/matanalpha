'use strict';

/** בונה את קטלוג התוכניות: מזהי מחיר ב-Stripe, הרשימה שלנו, והתוכניות שמוצגות באתר. */
function buildCatalog({ priceId, priceIdYearly, priceLabel, priceLabelYearly, stripe }) {
  // שנתי מוצג רק אם הוגדר מחיר שנתי (או שאין Stripe: מצב תצוגה)
  const yearlyShown = priceLabelYearly && (priceIdYearly || !stripe);
  return {
    prices: { monthly: priceId, yearly: priceIdYearly },
    ourPrices: [priceId, priceIdYearly].filter(Boolean),
    plans: [{ id: 'monthly', label: priceLabel }].concat(yearlyShown ? [{ id: 'yearly', label: priceLabelYearly }] : []),
  };
}

module.exports = { buildCatalog };
