/* רץ לפני הציור כדי למנוע הבהוב של מצב כהה / הגדרות נגישות */
(function () {
  var root = document.documentElement;
  function read(k) {
    try { return localStorage.getItem(k); } catch (e) { return null; }
  }
  var theme = read('ps-theme');
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  root.setAttribute('data-theme', theme);
  try {
    var a = JSON.parse(read('ps-a11y') || '{}');
    if (a.scale) root.style.setProperty('--fs-scale', a.scale);
    ['contrast', 'links', 'font', 'spacing', 'motion', 'cursor', 'gray', 'headings'].forEach(function (k) {
      if (a[k]) root.setAttribute('data-a11y-' + k, a[k]);
    });
  } catch (e) {}
})();
