/*
 * ליבת חישובי מס/ביטוח לאומי/נקודות זיכוי. רצה בדפדפן ובבדיקות (Node).
 * כל הנתונים המשתנים משנה לשנה נמצאים ב-TAX_DATA בלבד: לעדכן אותם בתחילת כל שנה.
 * החישוב הוא הערכה לצורך הבנה בלבד ואינו מחליף חישוב של מחלקת שכר או רואה חשבון.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TaxCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TAX_DATA = {
    year: 2025,
    // מדרגות מס חודשיות לשכיר (עד התקרה, שיעור)
    brackets: [
      { upTo: 7010, rate: 0.1 },
      { upTo: 10060, rate: 0.14 },
      { upTo: 16150, rate: 0.2 },
      { upTo: 22440, rate: 0.31 },
      { upTo: 46690, rate: 0.35 },
      { upTo: 60130, rate: 0.47 },
      { upTo: Infinity, rate: 0.5 },
    ],
    creditPointValue: 242, // שווי נקודת זיכוי בחודש
    ni: { threshold: 7522, max: 50695, reduced: 0.0104, full: 0.07 }, // ביטוח לאומי (עובד)
    health: { reduced: 0.0323, full: 0.0517 }, // מס בריאות (עובד)
    pensionCreditRate: 0.35, // זיכוי על הפקדה לפנסיה (סעיף 45א)
    pensionCreditCap: 0.07, // עד 7% מהשכר
    studyFundDeductCap: 0.025, // ניכוי הפקדת עובד לקרן השתלמות עד 2.5%
    employer: { pension: 0.065, severance: 0.06, studyFund: 0.075 },
  };

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  function bracketTax(taxable) {
    var tax = 0;
    var prev = 0;
    var parts = [];
    for (var i = 0; i < TAX_DATA.brackets.length; i++) {
      var b = TAX_DATA.brackets[i];
      if (taxable <= prev) break;
      var slice = Math.min(taxable, b.upTo) - prev;
      tax += slice * b.rate;
      parts.push({ rate: b.rate, amount: round2(slice), tax: round2(slice * b.rate) });
      prev = b.upTo;
    }
    return { tax: tax, parts: parts };
  }

  /**
   * ברוטו -> נטו
   * @param {{gross:number, creditPoints?:number, pensionPct?:number, studyFundPct?:number}} p  (אחוזים כמספר, למשל 6)
   */
  function grossToNet(p) {
    var gross = Math.max(0, Number(p.gross) || 0);
    var points = p.creditPoints === undefined ? 2.25 : Math.max(0, Number(p.creditPoints) || 0);
    var pensionPct = p.pensionPct === undefined ? 6 : Math.max(0, Number(p.pensionPct) || 0);
    var studyPct = Math.max(0, Number(p.studyFundPct) || 0);

    var pension = gross * (pensionPct / 100);
    var study = gross * (studyPct / 100);
    var studyDeduct = Math.min(study, gross * TAX_DATA.studyFundDeductCap);
    var taxable = Math.max(0, gross - studyDeduct);

    var bt = bracketTax(taxable);
    var pensionCredit = TAX_DATA.pensionCreditRate * Math.min(pension, gross * TAX_DATA.pensionCreditCap);
    var pointsCredit = points * TAX_DATA.creditPointValue;
    var incomeTax = Math.max(0, bt.tax - pointsCredit - pensionCredit);

    var base = Math.min(gross, TAX_DATA.ni.max);
    var low = Math.min(base, TAX_DATA.ni.threshold);
    var high = Math.max(0, base - TAX_DATA.ni.threshold);
    var ni = low * TAX_DATA.ni.reduced + high * TAX_DATA.ni.full;
    var health = low * TAX_DATA.health.reduced + high * TAX_DATA.health.full;

    var totalDeductions = incomeTax + ni + health + pension + study;
    return {
      gross: round2(gross),
      incomeTax: round2(incomeTax),
      incomeTaxBeforeCredits: round2(bt.tax),
      nationalInsurance: round2(ni),
      healthTax: round2(health),
      pension: round2(pension),
      studyFund: round2(study),
      totalDeductions: round2(totalDeductions),
      net: round2(gross - totalDeductions),
      brackets: bt.parts,
      credits: { points: points, pointsValue: round2(pointsCredit), pension: round2(pensionCredit) },
      effectiveRate: gross ? round2((totalDeductions / gross) * 100) : 0,
      marginalRate: marginalRate(taxable),
      employer: {
        pension: round2(gross * TAX_DATA.employer.pension),
        severance: round2(gross * TAX_DATA.employer.severance),
        studyFund: studyPct > 0 ? round2(gross * TAX_DATA.employer.studyFund) : 0,
      },
    };
  }

  function marginalRate(taxable) {
    for (var i = 0; i < TAX_DATA.brackets.length; i++) {
      if (taxable <= TAX_DATA.brackets[i].upTo) return TAX_DATA.brackets[i].rate;
    }
    return TAX_DATA.brackets[TAX_DATA.brackets.length - 1].rate;
  }

  /** נטו -> ברוטו (חיפוש בינארי, כי הנטו עולה עם הברוטו) */
  function netToGross(p) {
    var target = Math.max(0, Number(p.net) || 0);
    var lo = target;
    var hi = Math.max(target * 4, 1000);
    for (var i = 0; i < 80; i++) {
      var mid = (lo + hi) / 2;
      var n = grossToNet(Object.assign({}, p, { gross: mid })).net;
      if (n < target) lo = mid;
      else hi = mid;
    }
    return grossToNet(Object.assign({}, p, { gross: round2((lo + hi) / 2) }));
  }

  /* ---------------- נקודות זיכוי ---------------- */

  /**
   * הערכת נקודות זיכוי לפי פרופיל.
   * @param {{gender:'m'|'f', children?:number[], singleParent?:boolean, degree?:'none'|'ba'|'ma', degreeWithinYear?:boolean, dischargedMonthsLeft?:number, taxYear?:number}} prof
   */
  function estimateCredits(prof) {
    var year = prof.taxYear || TAX_DATA.year;
    var rows = [];
    function add(label, points, note) {
      if (points > 0) rows.push({ label: label, points: round2(points), note: note || '' });
    }
    add('תושב/ת ישראל', 2.25, 'כל תושב זכאי');
    if (prof.gender === 'f') add('אישה', 0.5, 'תוספת לנשים');

    (prof.children || []).forEach(function (birthYear) {
      var age = year - birthYear;
      var label = 'ילד/ה שנולד/ה ב-' + birthYear + ' (גיל ' + age + ')';
      var pts = 0;
      if (prof.gender === 'f') {
        if (age === 0) pts = 1.5;
        else if (age >= 1 && age <= 5) pts = 2.5;
        else if (age >= 6 && age <= 17) pts = 1;
        else if (age === 18) pts = 0.5;
      } else if (age >= 1 && age <= 5) {
        pts = 1; // לאב: נקודה לילד בגילאי 1-5 (בהנחה שאין הורה יחיד)
      }
      add(label, pts, prof.gender === 'f' ? '' : 'לאב זכאות מצומצמת יותר; ייתכן שהאם משתמשת בנקודות');
    });

    if (prof.singleParent && (prof.children || []).length) add('הורה יחיד/ה', 1, 'תוספת להורה יחידני');
    if (prof.degree === 'ba' && prof.degreeWithinYear) add('תואר ראשון (שנה אחרי סיום)', 1, 'בתוך 3 שנים מסיום הלימודים');
    if (prof.degree === 'ma' && prof.degreeWithinYear) add('תואר שני (שנה אחרי סיום)', 0.5, 'בתוך שנה מסיום');
    var m = Math.min(36, Math.max(0, Number(prof.dischargedMonthsLeft) || 0));
    if (m > 0) add('חייל/ת משוחרר/ת', (m / 12) * 2, 'שליש נקודה לחודש בחישוב מקורב, עד 36 חודשים');

    var total = rows.reduce(function (s, r) { return s + r.points; }, 0);
    return { total: round2(total), rows: rows, year: year };
  }

  /** שווי כספי חודשי של הפרש בנקודות */
  function pointsValue(points) {
    return round2(points * TAX_DATA.creditPointValue);
  }

  return {
    TAX_DATA: TAX_DATA,
    grossToNet: grossToNet,
    netToGross: netToGross,
    estimateCredits: estimateCredits,
    pointsValue: pointsValue,
  };
});
