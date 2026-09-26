(function (root) {
  "use strict";
  var CN = root.CN = root.CN || {};
  var util = CN.util;
  var store = CN.store;

  var USER_KEY = "checklist_note_user_v1";
  var LAST_SYNC_KEY = "checklist_note_last_sync_v1";
  var PUSH_DELAY_MS = 1200;
  var POLL_MS = 45000;

  var cfg = root.CN_CONFIG || {};
  var baseUrl = (cfg.supabaseUrl || "").replace(/\/+$/, "");
  var apiKey = cfg.supabaseKey || "";

  var state = {
    userId: util.readString(USER_KEY),
    status: "off",
    error: null,
    lastSync: Number(util.readString(LAST_SYNC_KEY)) || 0
  };
  var statusListeners = [];
  var remoteListeners = [];
  var queue = Promise.resolve();
  var pushTimer = null;

  function configured() { return !!(baseUrl && apiKey); }
  function active() { return configured() && !!state.userId; }

  function headers(extra) {
    var h = { apikey: apiKey, "Content-Type": "application/json" };
    // Legacy anon keys are JWTs and also go in Authorization; new publishable keys must not.
    if (/^eyJ/.test(apiKey)) h.Authorization = "Bearer " + apiKey;
    if (extra) Object.keys(extra).forEach(function (k) { h[k] = extra[k]; });
    return h;
  }

  function check(res) {
    if (res.ok) return res;
    return res.text().then(function (body) {
      var msg = body;
      try { var j = JSON.parse(body); msg = j.message || j.hint || body; } catch (e) {}
      var err = new Error("서버 응답 " + res.status + ": " + msg);
      err.status = res.status;
      throw err;
    });
  }

  function fetchRemote(userId) {
    var url = baseUrl + "/rest/v1/user_data?select=data&user_id=eq." + encodeURIComponent(userId);
    return fetch(url, { headers: headers() })
      .then(check)
      .then(function (res) { return res.json(); })
      .then(function (rows) { return rows.length ? rows[0].data : null; });
  }

  function pushRemote(userId, doc) {
    return fetch(baseUrl + "/rest/v1/user_data", {
      method: "POST",
      headers: headers({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify([{ user_id: userId, data: doc, updated_at: new Date().toISOString() }])
    }).then(check);
  }

  function setStatus(status, err) {
    state.status = status;
    state.error = err || null;
    statusListeners.forEach(function (fn) { fn(state); });
  }

  // Pull, merge with local, push back if the server is behind. Runs one at a time.
  function syncNow() {
    if (!active()) return Promise.resolve(false);
    var userId = state.userId;
    queue = queue.then(function () {
      if (state.userId !== userId) return false;
      setStatus("syncing");
      return fetchRemote(userId).then(function (remote) {
        if (state.userId !== userId) return false;
        var local = store.snapshot();
        var merged = remote ? store.mergeDocs(local, remote) : local;
        var mergedKey = store.docKey(merged);
        var localChanged = mergedKey !== store.docKey(local);
        var remoteBehind = !remote || mergedKey !== store.docKey(remote);
        if (localChanged) store.applyDoc(merged);
        return (remoteBehind ? pushRemote(userId, merged) : Promise.resolve()).then(function () {
          state.lastSync = Date.now();
          util.writeString(LAST_SYNC_KEY, String(state.lastSync));
          setStatus("ok");
          if (localChanged) remoteListeners.forEach(function (fn) { fn(); });
          return localChanged;
        });
      });
    }).catch(function (err) {
      setStatus("error", err);
      return false;
    });
    return queue;
  }

  function schedulePush() {
    if (!active()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(syncNow, PUSH_DELAY_MS);
  }

  function normalizeId(raw) {
    var id = (raw || "").trim().toLowerCase();
    return /^[a-z0-9가-힣_-]{2,32}$/.test(id) ? id : null;
  }

  function login(raw) {
    var id = normalizeId(raw);
    if (!id) return Promise.reject(new Error("아이디는 2~32자의 영문, 숫자, 한글, _, - 만 쓸 수 있어요."));
    if (!configured()) return Promise.reject(new Error("동기화 서버가 설정되지 않았어요."));
    // Probe first so a bad config or missing table surfaces before we commit to this id.
    return fetchRemote(id).then(function () {
      state.userId = id;
      util.writeString(USER_KEY, id);
      return syncNow();
    });
  }

  function logout() {
    clearTimeout(pushTimer);
    state.userId = null;
    util.writeString(USER_KEY, null);
    store.clear();
    setStatus("off");
    remoteListeners.forEach(function (fn) { fn(); });
  }

  // syncNow is a no-op until signed in, so these triggers are safe to register up front
  // and start working as soon as the user connects an id mid-session.
  function init() {
    store.onChange(schedulePush);
    root.document.addEventListener("visibilitychange", function () {
      if (root.document.visibilityState === "visible") syncNow();
    });
    root.addEventListener("online", syncNow);
    setInterval(function () {
      if (root.document.visibilityState === "visible") syncNow();
    }, POLL_MS);
    if (active()) syncNow();
    else setStatus("off");
  }

  CN.sync = {
    init: init,
    configured: configured,
    active: active,
    state: state,
    login: login,
    logout: logout,
    syncNow: syncNow,
    onStatus: function (fn) { statusListeners.push(fn); },
    onRemoteChange: function (fn) { remoteListeners.push(fn); }
  };
})(window);
