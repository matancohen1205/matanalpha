/* סרטון הסבר מונפש: סצנות, קריינות בקול הדפדפן (או קובץ שמע), כתוביות ובקרי נגן */
(function () {
  'use strict';
  var stage = document.getElementById('stage');
  if (!stage) return;
  var $ = function (id) { return document.getElementById(id); };
  var scenes = Array.prototype.slice.call(stage.querySelectorAll('.scene'));
  var captions = $('captions');
  var timeline = $('timeline');
  var note = $('voice-note');
  var synth = 'speechSynthesis' in window ? window.speechSynthesis : null;

  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };
  var st = {
    idx: 0, elapsed: 0, playing: false, started: false, speechDone: true,
    voice: store.get('ps-video-voice') !== '0', cc: store.get('ps-video-cc') !== '0', audio: null,
  };
  var TICK = 100;
  var timer = null;

  /* ---------- בנייה: פרקים ותמליל ---------- */
  var segBtns = scenes.map(function (sc, i) {
    var title = sc.querySelector('h3').textContent;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'seg-btn';
    b.setAttribute('aria-label', 'פרק ' + (i + 1) + ': ' + title);
    b.title = title;
    b.addEventListener('click', function () { goTo(i, true); });
    timeline.appendChild(b);
    var li = document.createElement('li');
    li.textContent = sc.dataset.say;
    $('transcript').appendChild(li);
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
    captions.textContent = st.cc ? scenes[i].dataset.say : '';
    paintProgress();
  }

  /* ---------- קריינות ---------- */
  function pickVoice() {
    if (!synth) return null;
    var vs = synth.getVoices().filter(function (v) { return /^(he|iw)(-|_|$)/i.test(v.lang); });
    if (!vs.length) return null;
    var score = function (v) { return (/natural|online|google|microsoft/i.test(v.name) ? 2 : 0) + (/female|hila|carmit/i.test(v.name) ? 1 : 0); };
    return vs.sort(function (a, b) { return score(b) - score(a); })[0];
  }
  function stopVoice() {
    if (synth) synth.cancel();
    if (st.audio) { st.audio.pause(); st.audio = null; }
  }
  function narrate(i) {
    stopVoice();
    st.speechDone = true;
    note.hidden = true;
    if (!st.voice) return;
    var sc = scenes[i];
    if (sc.dataset.audio) { // קובץ הקלטה אופציונלי: data-audio="/media/scene-1.mp3"
      var a = new Audio(sc.dataset.audio);
      st.audio = a;
      st.speechDone = false;
      a.addEventListener('ended', function () { st.speechDone = true; });
      a.addEventListener('error', function () { st.audio = null; st.speechDone = true; speak(sc.dataset.say); });
      a.play().catch(function () { st.speechDone = true; });
      return;
    }
    speak(sc.dataset.say);
  }
  function speak(text) {
    if (!synth) { st.speechDone = true; return; }
    var v = pickVoice();
    if (!v) {
      st.speechDone = true;
      note.textContent = 'לא נמצא קול בעברית במכשיר הזה, ולכן הסרטון מוצג עם כתוביות בלבד.';
      note.hidden = false;
      return;
    }
    var u = new SpeechSynthesisUtterance(text);
    u.voice = v;
    u.lang = v.lang;
    u.rate = 1;
    st.speechDone = false;
    u.onend = u.onerror = function () { st.speechDone = true; };
    synth.speak(u);
  }

  /* ---------- ציר זמן ---------- */
  function tick() {
    if (!st.playing) return;
    st.elapsed += TICK;
    var d = dur(st.idx);
    if (st.elapsed >= d && (st.speechDone || st.elapsed >= d + 6000)) next();
    else paintProgress();
  }
  function next() {
    if (st.idx < scenes.length - 1) {
      st.idx++; st.elapsed = 0; show(st.idx); narrate(st.idx);
    } else {
      finish();
    }
  }
  function finish() {
    st.playing = false; clearInterval(timer); stopVoice();
    st.idx = scenes.length - 1; st.elapsed = dur(st.idx); st.started = false;
    paintProgress();
    setState('ended');
    $('big-play').querySelector('span').textContent = 'צפו שוב';
  }
  function goTo(i, andPlay) {
    st.idx = i; st.elapsed = 0; show(i);
    if (andPlay) { start(true); }
  }
  function start(keepIdx) {
    if (!keepIdx) { st.idx = 0; st.elapsed = 0; show(0); }
    st.started = true; st.playing = true;
    setState('playing');
    narrate(st.idx);
    clearInterval(timer);
    timer = setInterval(tick, TICK);
  }
  function pause() {
    st.playing = false; setState('paused');
    if (synth) synth.pause();
    if (st.audio) st.audio.pause();
  }
  function resume() {
    st.playing = true; setState('playing');
    if (synth && synth.paused) synth.resume();
    else if (!st.speechDone && !st.audio) narrate(st.idx);
    if (st.audio) st.audio.play().catch(function () {});
    clearInterval(timer);
    timer = setInterval(tick, TICK);
  }
  function toggle() {
    if (!st.started || stage.dataset.state === 'ended') start(false);
    else if (st.playing) pause();
    else resume();
  }

  /* ---------- בקרים ---------- */
  $('big-play').addEventListener('click', toggle);
  $('btn-play').addEventListener('click', toggle);
  $('btn-restart').addEventListener('click', function () { start(false); });

  var vb = $('btn-voice'), cb = $('btn-cc');
  if (!synth) { vb.hidden = true; note.textContent = 'הדפדפן הזה אינו תומך בקריינות. אפשר לקרוא את הכתוביות והתמליל.'; note.hidden = false; }
  vb.setAttribute('aria-pressed', String(st.voice));
  cb.setAttribute('aria-pressed', String(st.cc));
  stage.dataset.cc = st.cc ? 'on' : 'off';
  vb.addEventListener('click', function () {
    st.voice = !st.voice; store.set('ps-video-voice', st.voice ? '1' : '0');
    vb.setAttribute('aria-pressed', String(st.voice));
    if (!st.voice) { stopVoice(); st.speechDone = true; note.hidden = true; } else if (st.playing) narrate(st.idx);
  });
  cb.addEventListener('click', function () {
    st.cc = !st.cc; store.set('ps-video-cc', st.cc ? '1' : '0');
    cb.setAttribute('aria-pressed', String(st.cc));
    stage.dataset.cc = st.cc ? 'on' : 'off';
    captions.textContent = st.cc ? scenes[st.idx].dataset.say : '';
  });
  $('btn-full').addEventListener('click', function () {
    var p = $('player');
    if (document.fullscreenElement) document.exitFullscreen();
    else if (p.requestFullscreen) p.requestFullscreen().catch(function () {});
  });
  if (!document.fullscreenEnabled) $('btn-full').hidden = true;

  document.addEventListener('visibilitychange', function () { if (document.hidden && st.playing) pause(); });
  if (synth) synth.addEventListener && synth.addEventListener('voiceschanged', function () {});

  /* מצב התחלתי: פוסטר של הסצנה הראשונה, בלי כתוביות עד ההפעלה */
  setState('idle');
  captions.textContent = '';
  paintProgress();
})();
