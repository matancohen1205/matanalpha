/*
 * חישוב זכויות שכיר: חופשה, הבראה, מחלה, ותזכורות ביומן (.ics).
 * הנתונים ב-RIGHTS_DATA הם הערכה כללית לפי החוק בלבד: הסכם קיבוצי, חוזה אישי או צו הרחבה עשויים להקנות יותר.
 * יש לאמת ולעדכן אותם מדי שנה (למשל ב"כל זכות").
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RightsCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var RIGHTS_DATA = {
    year: 2025,
    // חוק חופשה שנתית: ימי חופשה בשנה לפי מספר שנת העבודה (שבוע עבודה של 6 ימים)
    vacation6: [14, 14, 14, 14, 16, 18, 20, 21, 22],
    // המרה לשבוע 5 ימים (יחסית, מעוגל). לאמת מול הטבלה הרשמית.
    sickDaysPerMonth: 1.5,
    sickMax: 90,
    // ימי הבראה לפי שנת עבודה (מגזר פרטי, צו הרחבה)
    recuperation: function (yearNo) {
      if (yearNo <= 1) return 5;
      if (yearNo <= 3) return 6;
      if (yearNo <= 10) return 7;
      if (yearNo <= 15) return 8;
      if (yearNo <= 19) return 9;
      return 10;
    },
    recuperationRate: 418, // תעריף ליום הבראה (₪). לעדכן מדי שנה.
  };

  function parseDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    if (!m) return null;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return isNaN(d) || d.getUTCMonth() !== +m[2] - 1 ? null : d;
  }
  function addYears(d, n) {
    var x = new Date(d.getTime());
    x.setUTCFullYear(x.getUTCFullYear() + n);
    return x;
  }
  function fmt(d) {
    return d.toISOString().slice(0, 10);
  }
  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  function vacationDays(yearNo, daysPerWeek) {
    var t = RIGHTS_DATA.vacation6;
    var six = t[Math.min(yearNo, t.length) - 1];
    return daysPerWeek === 5 ? Math.round((six * 5) / 6) : six;
  }

  /**
   * @param {{start:string, daysPerWeek?:5|6, today?:string, recuperationRate?:number}} p
   */
  function compute(p) {
    var start = parseDate(p.start);
    var today = parseDate(p.today) || parseDate(new Date().toISOString().slice(0, 10));
    if (!start) return { error: 'תאריך התחלה לא תקין' };
    if (start > today) return { error: 'תאריך ההתחלה בעתיד' };
    var perWeek = Number(p.daysPerWeek) === 6 ? 6 : 5;

    var completed = 0;
    while (addYears(start, completed + 1) <= today) completed++;
    var yearNo = completed + 1; // מספר שנת העבודה הנוכחית
    var yearStart = addYears(start, completed);
    var yearEnd = addYears(start, completed + 1);
    var frac = (today - yearStart) / (yearEnd - yearStart);

    var months = (today.getUTCFullYear() - start.getUTCFullYear()) * 12 + today.getUTCMonth() - start.getUTCMonth() - (today.getUTCDate() < start.getUTCDate() ? 1 : 0);
    var vac = vacationDays(yearNo, perWeek);
    var rate = Number(p.recuperationRate) > 0 ? Number(p.recuperationRate) : RIGHTS_DATA.recuperationRate;
    var recDays = RIGHTS_DATA.recuperation(yearNo);

    return {
      yearNo: yearNo,
      completedYears: completed,
      monthsOfService: Math.max(0, months),
      anniversary: fmt(yearEnd),
      vacation: { perYear: vac, accruedThisYear: round1(vac * frac), nextYearPerYear: vacationDays(yearNo + 1, perWeek) },
      recuperation: { days: recDays, rate: rate, amount: Math.round(recDays * rate), firstYearProRata: yearNo === 1 },
      sick: { accrued: Math.min(RIGHTS_DATA.sickMax, round1(Math.max(0, months) * RIGHTS_DATA.sickDaysPerMonth)), max: RIGHTS_DATA.sickMax },
      dataYear: RIGHTS_DATA.year,
    };
  }

  /* ---------------- יומן (iCalendar) ---------------- */

  function esc(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }
  function fold(line) {
    // קיפול שורות לפי RFC 5545 (75 בתים)
    var out = '';
    var bytes = 0;
    for (var ch of line) {
      var n = unescape(encodeURIComponent(ch)).length;
      if (bytes + n > 74) { out += '\r\n '; bytes = 1; }
      out += ch;
      bytes += n;
    }
    return out;
  }
  function nextOn(from, month, day) {
    var d = new Date(Date.UTC(from.getUTCFullYear(), month - 1, day));
    if (d <= from) d = new Date(Date.UTC(from.getUTCFullYear() + 1, month - 1, day));
    return d;
  }
  function stamp(d) {
    return fmt(d).replace(/-/g, '');
  }

  /** כל התזכורות האפשריות. id משמש לבחירה בממשק. */
  function reminderCatalog(r, todayStr) {
    var today = parseDate(todayStr) || parseDate(new Date().toISOString().slice(0, 10));
    var list = [
      { id: 'recuperation', title: 'בדקו שקיבלתם דמי הבראה', desc: 'זכאות שנתית: ' + r.recuperation.days + ' ימים (כ-' + r.recuperation.amount + ' ₪ לפי התעריף שהוזן). בדקו בתלוש שהסכום שולם.', start: nextOn(today, 6, 15), rrule: 'FREQ=YEARLY' },
      { id: 'vacation', title: 'בדקו יתרת חופשה בתלוש', desc: 'בתלוש מופיעה יתרת ימי החופשה. ודאו שהיא תואמת למה שצברתם.', start: nextOn(today, 3, 1), rrule: 'FREQ=MONTHLY;INTERVAL=3' },
      { id: 'form101', title: 'עדכון טופס 101 לשנה החדשה', desc: 'בתחילת השנה מעדכנים אצל המעסיק פרטים ונקודות זיכוי.', start: nextOn(today, 1, 5), rrule: 'FREQ=YEARLY' },
      { id: 'anniversary', title: 'יום השנה בעבודה: עדכון זכויות', desc: 'מתחילה שנת עבודה ' + (r.yearNo + 1) + '. ייתכן עדכון בימי חופשה והבראה (חופשה: ' + r.vacation.nextYearPerYear + ' ימים).', start: parseDate(r.anniversary), rrule: 'FREQ=YEARLY' },
      { id: 'payslip', title: 'תלוש חדש: להעלות לבדיקה', desc: 'העלו את תלוש החודש לאתר ובדקו שהכול תקין.', start: nextOn(today, today.getUTCMonth() + 1, 10), rrule: 'FREQ=MONTHLY' },
    ];
    // תאריך "הבא" לתזכורת חודשית צריך להיות בעתיד
    list.forEach(function (x) {
      while (x.start <= today) x.start = new Date(Date.UTC(x.start.getUTCFullYear(), x.start.getUTCMonth() + 1, x.start.getUTCDate()));
    });
    return list;
  }

  function toIcs(reminders, uidSeed) {
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tlush BeIvrit//Rights//HE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:תלוש בעברית - תזכורות זכויות'];
    var now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    reminders.forEach(function (x, i) {
      lines.push('BEGIN:VEVENT',
        'UID:' + (uidSeed || 'tlush') + '-' + x.id + '-' + i + '@tlush',
        'DTSTAMP:' + now,
        'DTSTART;VALUE=DATE:' + stamp(x.start),
        'RRULE:' + x.rrule,
        'SUMMARY:' + esc(x.title),
        'DESCRIPTION:' + esc(x.desc),
        'TRANSP:TRANSPARENT',
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(x.title), 'TRIGGER:-PT15H', 'END:VALARM', // 9:00 ביום הקודם
        'END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  }

  return { RIGHTS_DATA: RIGHTS_DATA, compute: compute, reminderCatalog: reminderCatalog, toIcs: toIcs, parseDate: parseDate };
});
