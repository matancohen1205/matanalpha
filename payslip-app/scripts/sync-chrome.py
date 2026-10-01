#!/usr/bin/env python3
"""מעדכן כותרת עליונה ותחתית בכל דפי public/*.html לפי התבנית כאן (מקור אמת אחד)."""
import re, glob, os

HEADER = '''<header class="site-header">
    <div class="container header-inner">
      <a class="brand" href="/" aria-label="דף הבית">
        <img src="/logo-mark.svg" alt="" width="34" height="34">
        <span>תלוש בעברית</span>
      </a>
      <nav class="nav" aria-label="ניווט ראשי">
        <a class="nav-link" href="/">הסבר תלוש</a>
        <a class="nav-link" href="/calculator.html">מחשבון נטו-ברוטו</a>
        <a class="nav-link" href="/credits.html">נקודות זיכוי</a>
        <a class="nav-link" href="/compare.html">השוואת תלושים</a>
        <a class="nav-link" href="/pricing.html">מנוי Pro</a>
      </nav>
      <span id="pro-badge" class="pro-badge" hidden>Pro</span>
      <button id="theme-toggle" class="icon-btn" type="button" aria-label="מעבר למצב כהה" aria-pressed="false">
        <svg class="theme-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
        <svg class="theme-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
      </button>
    </div>
  </header>'''

FOOTER = '''<footer class="site-footer">
    <div class="container footer-inner">
      <span>© <span id="year">2025</span> תלוש בעברית. ההסברים והחישובים כלליים ואינם ייעוץ מקצועי.</span>
      <nav class="footer-links" aria-label="קישורים נוספים">
        <a href="/#glossary">מילון מונחים</a>
        <a href="/privacy.html">מדיניות פרטיות</a>
        <a href="/terms.html">תנאי שימוש</a>
        <a href="/accessibility.html">הצהרת נגישות</a>
      </nav>
    </div>
  </footer>'''

HEAD_TAGS = '''<meta name="theme-color" content="#3b5bdb">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="icon" href="/icons/favicon-32.png" sizes="32x32" type="image/png">
  <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
  <link rel="manifest" href="/manifest.webmanifest">'''

root = os.path.join(os.path.dirname(__file__), '..', 'public')
for f in glob.glob(os.path.join(root, '*.html')):
    s = open(f, encoding='utf-8').read()
    s = re.sub(r'<header class="site-header">.*?</header>', lambda m: HEADER, s, flags=re.S)
    s = re.sub(r'<footer class="site-footer">.*?</footer>', lambda m: FOOTER, s, flags=re.S)
    # תגיות head: אייקונים, manifest וצבע דפדפן
    s = re.sub(r'\s*<link rel="icon"[^>]*>', '', s)
    s = re.sub(r'\s*<meta name="theme-color"[^>]*>|\s*<link rel="manifest"[^>]*>|\s*<link rel="apple-touch-icon"[^>]*>', '', s)
    s = s.replace('<link rel="stylesheet" href="/css/style.css">', HEAD_TAGS + '\n  <link rel="stylesheet" href="/css/style.css">', 1)
    # סקריפטים משותפים בכל דף
    if '/js/util.js' not in s:
        s = s.replace('<script src="/js/common.js"></script>', '<script src="/js/util.js"></script>\n  <script src="/js/common.js"></script>')
    if '/js/promo.js' not in s:
        s = s.replace('<script src="/js/common.js"></script>', '<script src="/js/common.js"></script>\n  <script src="/js/promo.js"></script>')
    open(f, 'w', encoding='utf-8').write(s)
    print('synced', os.path.basename(f))
