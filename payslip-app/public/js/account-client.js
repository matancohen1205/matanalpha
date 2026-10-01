/* לקוח משותף לחשבון והכספת המוצפנת. מפתח הכספת נשמר רק בזיכרון הלשונית (sessionStorage) ולא נשלח לשרת. */
(function () {
  'use strict';
  var V = window.VaultCrypto, PS_ = window.PS;
  var KEY = 'ps-vk';
  var ss = PS_.store('session');
  var MAX_SNAPSHOTS = 24;
  var meCache = null;

  function me(force) {
    if (!meCache || force) {
      meCache = fetch('/api/account/me', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).catch(function () { return { loggedIn: false }; });
    }
    return meCache;
  }
  function setKey(bytes) { if (bytes) ss.set(KEY, V.b64(bytes)); }
  function getKey() { var s = ss.get(KEY); return s ? V.unb64(s) : null; }
  function clearKey() { try { sessionStorage.removeItem(KEY); } catch (e) {} }
  function api(method, url, body) {
    return fetch(url, { method: method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, body: j }; }); });
  }

  /** מחזיר {version, data} כשהכספת מפוענחת. data ריק אם עוד לא נוצרה. */
  async function loadVault() {
    var key = getKey();
    if (!key) throw new Error('LOCKED');
    var r = await api('GET', '/api/account/vault');
    if (!r.ok) throw new Error('VAULT_' + r.status);
    var data = r.body.blob ? await V.decryptJson(key, r.body.blob) : { v: 1, snapshots: [], rights: null };
    if (!Array.isArray(data.snapshots)) data.snapshots = [];
    return { version: r.body.version, data: data };
  }
  async function putVault(version, data) {
    var key = getKey();
    var blob = await V.encryptJson(key, data);
    return api('PUT', '/api/account/vault', { version: version, blob: blob });
  }
  /** טוען, מפעיל mutator, ושומר. בהתנגשות גרסאות מנסה פעם נוספת. */
  async function updateVault(mutator) {
    for (var attempt = 0; attempt < 2; attempt++) {
      var cur = await loadVault();
      mutator(cur.data);
      var r = await putVault(cur.version, cur.data);
      if (r.ok) return cur.data;
      if (r.status !== 409) throw new Error('SAVE_' + r.status);
    }
    throw new Error('CONFLICT');
  }
  async function saveSnapshot(analysis) {
    var items = (analysis.items || []).filter(function (i) { return i.amount !== null && i.id !== 'manual'; })
      .map(function (i) { return { id: i.id, title: i.title, type: i.type, amount: i.amount }; });
    var period = (analysis.summary && analysis.summary.period) || new Date().toISOString().slice(0, 7).split('-').reverse().join('/');
    var snap = { id: V.b64(crypto.getRandomValues(new Uint8Array(9))), period: period, label: period, items: items, savedAt: new Date().toISOString() };
    return updateVault(function (d) {
      d.snapshots = d.snapshots.filter(function (s) { return s.period !== period; }); // תלוש לאותו חודש מחליף את הקודם
      d.snapshots.push(snap);
      if (d.snapshots.length > MAX_SNAPSHOTS) d.snapshots = d.snapshots.slice(-MAX_SNAPSHOTS);
    });
  }

  window.PSAccount = { me: me, setKey: setKey, getKey: getKey, clearKey: clearKey, api: api, loadVault: loadVault, updateVault: updateVault, saveSnapshot: saveSnapshot, MAX_SNAPSHOTS: MAX_SNAPSHOTS };
})();
