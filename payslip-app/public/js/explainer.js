/* סרטון הסבר מונפש: סצנות, כתוביות ובקרי נגן (בלי קריינות) */
(function () {
  'use strict';
  var stage = document.getElementById('stage');
  if (!stage) return;
  var $ = function (id) { return document.getElementById(id); };
  var scenes = Array.prototype.slice.call(stage.querySelectorAll('.scene'));
  var captions = $('captions');
  var timeline = $('timeline');

  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };
  var st = { idx: 0, elapsed: 0, playing: false, started: false, cc: store.get('ps-video-cc') !== '0' };
  var TICK = 100;
  var timer = null;

  /* ---------- בנייה: פרקים ---------- */
  var segBtns = scenes.map(function (sc, i) {
    var title = sc.querySelector('h3').textContent;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'seg-btn';
    b.setAttribute('aria-label', 'פרק ' + (i + 1) + ': ' + title);
    b.title = title;
    b.addEventListener('click', function () { goTo(i); });
    timeline.appendChild(b);
    return b;
  });
  var dur = function (i) { return Number(scenes[i].dataset.dur || 8) * 1000; };

  /* ---------- תצוגה ---------- */
  function setState(s) { stage.dataset.state = s; }
  function paintProgress() {
    segBtns.forEach(function (b, i) {
      b.classList.toggle('done', i < st.idx);
      b.classList.toggle('cur', i === st.idx);
      b.style.setProperty('--p', i === st.idx ? String(Math.min(1, st.elapsed / dur(i))) : i < st.idx ? '1' : '0');
    });
  }
  function show(i) {
    scenes.forEach(function (sc, k) {
      if (k === i) { sc.classList.remove('on'); void sc.offsetWidth; sc.classList.add('on'); }
      else sc.classList.remove('on');
    });
    stage.dataset.scene = String(i);
    captions.textContent = st.started && st.cc ? scenes[i].dataset.say : '';
    paintProgress();
  }

  /* ---------- ציר זמן ---------- */
  function tick() {
    if (!st.playing) return;
    st.elapsed += TICK;
    if (st.elapsed >= dur(st.idx)) next(); else paintProgress();
  }
  function next() {
    if (st.idx < scenes.length - 1) { st.idx++; st.elapsed = 0; show(st.idx); }
    else finish();
  }
  function finish() {
    st.playing = false; clearInterval(timer);
    st.elapsed = dur(st.idx); st.started = false;
    paintProgress();
    setState('ended');
    $('big-play').querySelector('span').textContent = 'צפו שוב';
  }
  function goTo(i) {
    st.idx = i; st.elapsed = 0; st.started = true;
    show(i);
    run();
  }
  function run() {
    st.playing = true; st.started = true;
    setState('playing');
    captions.textContent = st.cc ? scenes[st.idx].dataset.say : '';
    clearInterval(timer);
    timer = setInterval(tick, TICK);
  }
  function restart() { st.idx = 0; st.elapsed = 0; st.started = true; show(0); run(); }
  function pause() { st.playing = false; setState('paused'); }
  function toggle() {
    if (!st.started || stage.dataset.state === 'ended') restart();
    else if (st.playing) pause();
    else run();
  }

  /* ---------- בקרים ---------- */
  $('big-play').addEventListener('click', toggle);
  $('btn-play').addEventListener('click', toggle);
  $('btn-restart').addEventListener('click', restart);

  var cb = $('btn-cc');
  cb.setAttribute('aria-pressed', String(st.cc));
  stage.dataset.cc = st.cc ? 'on' : 'off';
  cb.addEventListener('click', function () {
    st.cc = !st.cc; store.set('ps-video-cc', st.cc ? '1' : '0');
    cb.setAttribute('aria-pressed', String(st.cc));
    stage.dataset.cc = st.cc ? 'on' : 'off';
    captions.textContent = st.started && st.cc ? scenes[st.idx].dataset.say : '';
  });
  $('btn-full').addEventListener('click', function () {
    var p = $('player');
    if (document.fullscreenElement) document.exitFullscreen();
    else if (p.requestFullscreen) p.requestFullscreen().catch(function () {});
  });
  if (!document.fullscreenEnabled) $('btn-full').hidden = true;

  document.addEventListener('visibilitychange', function () { if (document.hidden && st.playing) pause(); });

  /* מצב התחלתי: פוסטר של הסצנה הראשונה */
  setState('idle');
  captions.textContent = '';
  paintProgress();
})();
