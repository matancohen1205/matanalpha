/*
 * בסיס הידע והתאמת השאלות של עוזר האתר. עובד בדפדפן ובבדיקות (Node).
 * העוזר מבוסס כללים: אין שליחת שאלות לשום שרת או מודל, והוא לא נותן ייעוץ אישי.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ChatKB = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var URL = {
    home: '/',
    upload: '/#upload',
    calc: '/calculator.html',
    credits: '/credits.html',
    compare: '/compare.html',
    whatsapp: '/whatsapp.html',
    pricing: '/pricing.html',
    privacy: '/privacy.html',
    terms: '/terms.html',
    access: '/accessibility.html',
    about: '/about.html',
    contact: '/contact.html',
    glossary: '/#glossary',
  };

  var CONTACT = { label: '💬 פנייה לשירות לקוחות', href: URL.contact };

  /** כל ערך: מילות מפתח (ביטויים), תשובה וכפתורי המשך */
  var INTENTS = [
    {
      id: 'upload',
      keys: ['להעלות', 'העלאה', 'מעלים', 'איך מעלים', 'להעלות תלוש', 'לסרוק', 'סריקה', 'איך מתחילים', 'להתחיל', 'איך משתמשים', 'איך עובד', 'איך זה עובד'],
      answer: 'מעלים את התלוש בדף הבית: גוררים קובץ (PDF, JPG, PNG או WEBP, עד 8MB) או לוחצים לבחירה. מסמנים את תיבת האישור ולוחצים "סריקה והסבר התלוש". תוך שניות מקבלים סיכום והסבר לכל סעיף. אפשר גם להדביק טקסט, או לנסות עם תלוש לדוגמה בלי להעלות כלום.',
      actions: [{ label: 'למסך ההעלאה', href: URL.upload }, { label: 'תלוש לדוגמה', href: URL.upload }],
    },
    {
      id: 'formats',
      keys: ['פורמט', 'סוג קובץ', 'סוגי קבצים', 'pdf', 'תמונה', 'גודל קובץ', 'גדול מדי', 'מגבלת גודל', 'צילום'],
      answer: 'אפשר להעלות PDF עם טקסט, או תמונה (JPG, PNG, WEBP) עד 8MB. לתמונה כדאי צילום ישר, חד ומואר. PDF סרוק (ללא טקסט) לא נקרא ישירות, ולכן שמרו אותו כתמונה או צלמו מסך.',
      actions: [{ label: 'למסך ההעלאה', href: URL.upload }],
    },
    {
      id: 'unreadable',
      keys: ['לא קורא', 'לא זיהה', 'לא זוהה', 'סכום שגוי', 'סכומים שגויים', 'טעות בסריקה', 'קריאה שגויה', 'לא מצליח לקרוא', 'לא נקרא', 'שגיאה בקריאה', 'תיקון סכום', 'לתקן סכום'],
      answer: 'הזיהוי אוטומטי וייתכנו טעויות, בעיקר בתמונות לא ברורות. בתוצאות לוחצים על סעיף ואפשר לתקן את הסכום ידנית, והסיכומים יתעדכנו. שורות שלא זוהו מופיעות בתחתית, ושם אפשר לסווג אותן כתשלום או ניכוי. אם הקריאה נכשלת כל פעם, נסו תמונה ישרה וחדה יותר או הדבקת טקסט.',
      actions: [{ label: 'הדבקת טקסט', href: URL.upload }],
    },
    {
      id: 'privacy',
      keys: ['פרטיות', 'נשמר', 'שומרים', 'מאובטח', 'אבטחה', 'בטוח', 'מי רואה', 'מחיקה', 'למחוק', 'מוחקים', 'מוחק', 'מחיקת מידע', 'מחיקת נתונים', 'מידע אישי', 'נתונים שלי', 'הצפנה'],
      answer: 'התלוש מעובד בזיכרון השרת בלבד ונמחק מיד אחרי הקריאה, בלי חשבון ובלי שמירה. מנויי Pro שמחברים וואטסאפ מאשרים שמירה של טלפון (מוצפן) וסכומים מסוכמים בלבד, ואפשר למחוק הכול בשליחת "הפסק" לבוט. פרטים מלאים במדיניות הפרטיות.',
      actions: [{ label: 'מדיניות פרטיות', href: URL.privacy }, { label: 'בקשת מחיקת מידע', href: URL.contact + '?topic=privacy' }],
    },
    {
      id: 'pro',
      keys: ['pro', 'מנוי', 'פרו', 'מה כלול', 'יתרונות', 'לשדרג', 'שדרוג', 'מתקדם', 'בתשלום'],
      answer: 'מנוי Pro מוסיף השוואת עד 12 תלושים בין חודשים (גרף, טבלה והתראות על חריגות), ייצוא CSV ובוט וואטסאפ שמנתח תלוש ושולח התראות. ההסבר על תלוש בודד, המחשבון ובדיקת נקודות הזיכוי נשארים חינם.',
      price: true,
      actions: [{ label: 'פרטי המנוי', href: URL.pricing }],
    },
    {
      id: 'billing',
      keys: ['לבטל מנוי', 'לבטל את המנוי', 'ביטול מנוי', 'לבטל', 'ביטול', 'חיוב', 'חויבתי', 'תשלום', 'להצטרף', 'כרטיס אשראי', 'החזר', 'חשבונית', 'קבלה', 'לנהל מנוי', 'ניהול מנוי'],
      answer: 'להצטרפות לוחצים "הצטרפות ל-Pro" בדף המנוי ומשלמים בדף מאובטח של ספק התשלומים. לביטול או לעדכון כרטיס: בדף המנוי לוחצים "ניהול מנוי וביטול". הביטול נכנס לתוקף בסוף תקופת החיוב ששולמה. לשאלות על חיוב, החזר או חשבונית פנו לשירות לקוחות.',
      actions: [{ label: 'לדף המנוי', href: URL.pricing }, { label: 'שאלה על חיוב', href: URL.contact + '?topic=billing' }],
    },
    {
      id: 'whatsapp',
      keys: ['וואטסאפ', 'ווטסאפ', 'וואצאפ', 'whatsapp', 'בוט', 'התראות', 'להתחבר', 'חיבור וואטסאפ', 'הפסק'],
      answer: 'בוט הוואטסאפ זמין למנויי Pro: נכנסים לעמוד הוואטסאפ, מאשרים ולוחצים "חיבור וואטסאפ". נפתח צ\'אט עם הודעת חיבור מוכנה, שולחים אותה, ואחר כך שולחים לבוט תמונה או PDF של התלוש ומקבלים סיכום והתראות. לניתוק ומחיקת הנתונים שולחים לבוט "הפסק".',
      actions: [{ label: 'לעמוד הוואטסאפ', href: URL.whatsapp }],
    },
    {
      id: 'calc',
      keys: ['מחשבון', 'נטו', 'ברוטו', 'לחשב', 'חישוב', 'כמה אקבל', 'שכר נטו', 'שכר ברוטו', 'העלאה בשכר'],
      answer: 'במחשבון נטו-ברוטו מזינים שכר ברוטו (או נטו), נקודות זיכוי ואחוזי פנסיה והשתלמות, ורואים מיד את הנטו, פירוט המס והניכויים וכמה נשאר מכל תוספת. החישוב מקורב לפי נתוני המס של השנה שמופיעה בעמוד.',
      actions: [{ label: 'פתיחת המחשבון', href: URL.calc }],
    },
    {
      id: 'credits',
      keys: ['נקודות זיכוי', 'זיכוי', 'טופס 101', 'חסרות נקודות', 'לבדוק נקודות', 'ילדים', 'משוחרר', 'תואר'],
      answer: 'בבדיקת נקודות הזיכוי עונים על כמה שאלות (מין, ילדים, תואר, שחרור משירות), ורואים כמה נקודות מגיעות לכם, בהשוואה למה שרשום בתלוש ושווי הפער בכסף. לעדכון בפועל ממלאים טופס 101 אצל המעסיק.',
      actions: [{ label: 'בדיקת נקודות זיכוי', href: URL.credits }],
    },
    {
      id: 'compare',
      keys: ['השוואה', 'להשוות', 'בין חודשים', 'כמה תלושים', 'מגמות', 'חריגות', 'חריג'],
      answer: 'השוואת תלושים (ל-Pro): מוסיפים שניים עד שנים-עשר תלושים כקבצים או כטקסט ולוחצים "השוו". מקבלים גרף, טבלת שינויים והתראות, למשל סעיף שנעלם, קפיצה בשיעור המס או שינוי בנקודות הזיכוי.',
      actions: [{ label: 'להשוואת תלושים', href: URL.compare }],
    },
    {
      id: 'a11y',
      keys: ['נגישות', 'להגדיל', 'גודל טקסט', 'ניגודיות', 'קורא מסך', 'קשה לקרוא', 'כתב גדול', 'לקרוא'],
      answer: 'בכפתור הנגישות שבפינת המסך אפשר להגדיל טקסט, להפעיל ניגודיות גבוהה, גווני אפור, גופן קריא, ריווח, עצירת אנימציות וסמן גדול. האתר תומך גם בניווט מקלדת וקורא מסך.',
      actions: [{ label: 'פתיחת תפריט נגישות', fn: 'a11y' }, { label: 'הצהרת נגישות', href: URL.access }],
    },
    {
      id: 'theme',
      keys: ['מצב כהה', 'מצב בהיר', 'כהה', 'בהיר', 'דארק', 'חושך', 'להחליף צבע', 'ערכת נושא'],
      answer: 'אפשר להחליף בין מצב בהיר לכהה בכפתור השמש/ירח בראש העמוד. הבחירה נשמרת במכשיר שלכם.',
      actions: [{ label: 'החלפת מצב תצוגה', fn: 'theme' }],
    },
    {
      id: 'accuracy',
      keys: ['מדויק', 'דיוק', 'אמין', 'ייעוץ', 'רואה חשבון', 'משפטי', 'אחריות', 'לסמוך'],
      answer: 'ההסברים והחישובים כלליים ומקורבים ואינם ייעוץ משפטי, מיסויי או פנסיוני. הזיהוי האוטומטי עלול לטעות, ולכן אפשר לתקן סכומים. בכל ספק פנו למחלקת השכר אצל המעסיק או לרואה חשבון.',
      actions: [{ label: 'תנאי שימוש', href: URL.terms }],
    },
    {
      id: 'glossary',
      keys: ['מילון', 'מונחים', 'מושגים', 'מה זה', 'לא מבין', 'לא מבינה', 'הסבר על סעיף'],
      answer: 'במילון המונחים יש הסבר פשוט ל-35 מונחי שכר, עם חיפוש וסינון. אפשר גם לכתוב לי כאן שם של מונח, למשל "ביטוח לאומי" או "קרן השתלמות", ואסביר מה הוא.',
      actions: [{ label: 'פתיחת המילון', href: URL.glossary }],
    },
    {
      id: 'about',
      keys: ['מי אתם', 'מי אנחנו', 'על האתר', 'עלינו', 'מי עומד', 'החברה'],
      answer: 'תלוש בעברית הוא שירות שמסביר תלושי שכר בשפה פשוטה, בפרטיות מלאה. בעמוד "מי אנחנו" מופיעים העקרונות שלנו ופרטי העסק.',
      actions: [{ label: 'מי אנחנו', href: URL.about }],
    },
    {
      id: 'human',
      keys: ['נציג', 'שירות לקוחות', 'אדם', 'בן אדם', 'לדבר עם', 'ליצור קשר', 'צור קשר', 'טלפון', 'מייל', 'אימייל', 'תמיכה', 'עזרה אנושית', 'תקלה', 'באג', 'לא עובד', 'דיווח', 'להתלונן', 'תלונה'],
      answer: 'אשמח לחבר אתכם לשירות לקוחות. הדרך המהירה היא טופס יצירת הקשר: אתם כותבים מה קרה ואנחנו חוזרים אליכם. אל תשלחו בטופס תלוש או מספר זהות.',
      contact: true,
      actions: [CONTACT],
    },
    {
      id: 'hello',
      keys: ['שלום', 'היי', 'הי', 'בוקר טוב', 'ערב טוב', 'מה נשמע'],
      answer: 'שלום! במה אפשר לעזור?',
      weak: true,
    },
    {
      id: 'thanks',
      keys: ['תודה', 'תודה רבה', 'מעולה', 'סבבה', 'אחלה', 'יופי'],
      answer: 'בשמחה! אם יש עוד שאלה אני כאן.',
      weak: true,
    },
  ];

  /* ---------------- נרמול והתאמה ---------------- */

  function normalize(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[֑-ׇ]/g, '')
      .replace(/["'`׳״.,!?;:()\[\]{}\-–—_/\\|*]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  var PREFIX = /^[והבכלמש]/;
  function tokens(s) {
    return normalize(s).split(' ').filter(Boolean);
  }
  function stem(t) {
    return t.length > 3 && PREFIX.test(t) ? t.slice(1) : t;
  }
  function stemmedSet(s) {
    var set = {};
    tokens(s).forEach(function (t) { set[t] = 1; set[stem(t)] = 1; });
    return set;
  }

  function scoreIntent(intent, nq, qset) {
    var score = 0;
    intent.keys.forEach(function (k) {
      var nk = normalize(k);
      if (!nk) return;
      var words = nk.split(' ');
      if (words.length > 1) {
        if (nq.indexOf(nk) >= 0) score += 2 + words.length;
      } else if (qset[nk] || qset[stem(nk)]) {
        score += nk.length >= 4 ? 3 : 2;
      } else if (nk.length >= 5 && nq.indexOf(nk) >= 0) {
        score += 2; // מילת מפתח כתת-מחרוזת (כינויי קניין וכד')
      }
    });
    return score;
  }

  var ASKS_TERM = /(מה זה|מהו|מהי|מה הוא|מה היא|פירוש|הסבר|מה אומר|מה אומרת|מה המשמעות|למה יש|למה אני משלם|למה מנכים)/;

  function glossaryMatch(nq, glossary) {
    var best = null;
    (glossary || []).forEach(function (g) {
      String(g.title || '').split('/').forEach(function (alt) {
        var name = normalize(alt.replace(/\(.*?\)/g, ''));
        if (name.length < 4 || nq.indexOf(name) < 0) return;
        if (!best || name.length > best.len) best = { g: g, len: name.length };
      });
    });
    return best && best.g;
  }

  /**
   * @param {string} query
   * @param {Array} glossary  רשימת {title, what, why}
   * @returns {{type:'kb'|'glossary'|'none', intent?:object, entry?:object, score:number}}
   */
  function match(query, glossary) {
    var nq = normalize(query);
    if (!nq) return { type: 'none', score: 0 };
    var qset = stemmedSet(query);

    var best = null;
    INTENTS.forEach(function (it) {
      var s = scoreIntent(it, nq, qset);
      if (s > 0 && (!best || s > best.score || (s === best.score && !it.weak && best.intent.weak))) best = { intent: it, score: s };
    });
    var g = glossaryMatch(nq, glossary);
    var asks = ASKS_TERM.test(nq);

    if (g && (asks || !best || best.score < 4 || best.intent.id === 'glossary')) return { type: 'glossary', entry: g, score: 5 };
    if (best && best.score >= 2) {
      if (best.intent.weak && nq.split(' ').length > 3) return { type: 'none', score: best.score };
      return { type: 'kb', intent: best.intent, score: best.score };
    }
    return { type: 'none', score: 0 };
  }

  var QUICK = [
    { label: 'איך מעלים תלוש?', say: 'איך מעלים תלוש' },
    { label: 'מה כלול ב-Pro?', say: 'מה כלול במנוי Pro' },
    { label: 'הסבר על מונח', say: 'מה זה ביטוח לאומי' },
    { label: 'דברו עם נציג', say: 'אני רוצה נציג' },
  ];

  return { INTENTS: INTENTS, URL: URL, QUICK: QUICK, CONTACT: CONTACT, normalize: normalize, match: match };
});
