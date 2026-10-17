(function (root) {
  "use strict";
  var CN = root.CN = root.CN || {};
  var util = CN.util;
  var store = CN.store;

  // Account sync: sign in with email + password (Supabase Auth); the notes are stored in a table that
  // only their owner can read or write. The same account also works in the SuperDialer app, which can
  // hand this page a session so it opens already signed in ("managed" session, no refresh token).
  var SESSION_KEY = "checklist_note_session_v2";
  var LEGACY_USER_KEY = "checklist_note_user_v1"; // old id-only sync, kept only to offer an import
  var LAST_SYNC_KEY = "checklist_note_last_sync_v1";
  var PUSH_DELAY_MS = 1200;
  var POLL_MS = 45000;
  var REFRESH_MARGIN_MS = 60000;

  var cfg = root.CN_CONFIG || {};
  var baseUrl = (cfg.supabaseUrl || "").replace(/\/+$/, "");
  var apiKey = cfg.supabaseKey || "";

  var session = readSession();
  var state = {
    userId: session ? (session.email || session.user_id) : null, // shown as the account label
    status: "off",
    error: null,
    lastSync: Number(util.readString(LAST_SYNC_KEY)) || 0,
    legacyId: util.readString(LEGACY_USER_KEY)
  };
  var statusListeners = [];
  var remoteListeners = [];
  var queue = Promise.resolve();
  var pushTimer = null;

  function readSession() {
    var s = util.readJSON(SESSION_KEY, null);
    return s && s.access_token && s.user_id ? s : null;
  }
  function saveSession(s) {
    session = s;
    state.userId = s ? (s.email || s.user_id) : null;
    if (s) util.writeJSON(SESSION_KEY, s);
    else util.writeString(SESSION_KEY, null);
  }

  function configured() { return !!(baseUrl && apiKey); }
  function active() { return configured() && !!session; }

  function headers(extra) {
    var h = { apikey: apiKey, "Content-Type": "application/json" };
    h.Authorization = "Bearer " + (session ? session.access_token : apiKey);
    if (extra) Object.keys(extra).forEach(function (k) { h[k] = extra[k]; });
    return h;
  }

  function friendly(msg, status) {
    var m = String(msg || "").toLowerCase();
    if (m.indexOf("invalid login") >= 0) return "이메일 또는 비밀번호가 맞지 않아요.";
    if (m.indexOf("not confirmed") >= 0) return "메일로 보낸 인증 링크를 먼저 눌러주세요.";
    if (m.indexOf("already registered") >= 0 || m.indexOf("already been registered") >= 0) return "이미 가입된 이메일이에요. 로그인해 주세요.";
    if (m.indexOf("password") >= 0 && (m.indexOf("at least") >= 0 || m.indexOf("weak") >= 0)) return "비밀번호는 6자 이상이어야 해요.";
    if (m.indexOf("valid email") >= 0 || m.indexOf("invalid email") >= 0) return "올바른 이메일 주소를 입력해 주세요.";
    if (status === 429) return "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.";
    return "서버 응답 " + status + ": " + msg;
  }

  function check(res) {
    if (res.ok) return res;
    return res.text().then(function (body) {
      var msg = body;
      try {
        var j = JSON.parse(body);
        msg = j.error_description || j.msg || j.message || j.hint || body;
      } catch (e) {}
      var err = new Error(friendly(msg, res.status));
      err.status = res.status;
      throw err;
    });
  }

  // --- Auth -------------------------------------------------------------------------------------

  function authCall(path, body) {
    return fetch(baseUrl + "/auth/v1" + path, {
      method: "POST",
      headers: { apikey: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(check).then(function (res) { return res.json(); });
  }

  function sessionFrom(json) {
    if (!json || !json.access_token || !json.user) return null;
    return {
      access_token: json.access_token,
      refresh_token: json.refresh_token || null,
      expires_at: Date.now() + (Number(json.expires_in) || 3600) * 1000,
      user_id: json.user.id,
      email: json.user.email || "",
      managed: false
    };
  }

  function authExpired() {
    var err = new Error("로그인이 만료됐어요. 다시 로그인해 주세요.");
    err.authExpired = true;
    return err;
  }

  // Renews the access token when it is about to expire. A managed session (from the SuperDialer app) has no
  // refresh token: the app hands over a fresh one each time the page is opened.
  function ensureFresh() {
    if (!session) return Promise.reject(authExpired());
    if (session.expires_at - Date.now() > REFRESH_MARGIN_MS) return Promise.resolve();
    if (!session.refresh_token) return Promise.reject(authExpired());
    return authCall("/token?grant_type=refresh_token", { refresh_token: session.refresh_token }).then(function (json) {
      var next = sessionFrom(json);
      if (!next) throw authExpired();
      saveSession(next);
    }, function () { throw authExpired(); });
  }

  // Calls a Supabase Edge Function as the signed-in user and returns its JSON.
  function callFunction(name, body) {
    if (!active()) return Promise.reject(new Error("로그인해야 쓸 수 있어요."));
    return ensureFresh().then(function () {
      return fetch(baseUrl + "/functions/v1/" + name, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(body)
      });
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (j) {
        if (!res.ok) throw new Error(j.error || "서버 오류가 났어요 (" + res.status + ")");
        return j;
      });
    });
  }

  function signOutLocally() {
    clearTimeout(pushTimer);
    saveSession(null);
    util.writeString(LAST_SYNC_KEY, null);
  }

  // --- Data -------------------------------------------------------------------------------------

  function fetchRemote() {
    return ensureFresh().then(function () {
      return fetch(baseUrl + "/rest/v1/checklist_data?select=data&limit=1", { headers: headers() });
    }).then(check).then(function (res) { return res.json(); })
      .then(function (rows) { return rows.length ? rows[0].data : null; });
  }

  function pushRemote(doc) {
    return ensureFresh().then(function () {
      return fetch(baseUrl + "/rest/v1/checklist_data?on_conflict=user_id", {
        method: "POST",
        headers: headers({ Prefer: "resolution=merge-duplicates,return=minimal" }),
        body: JSON.stringify([{ user_id: session.user_id, data: doc, updated_at: new Date().toISOString() }])
      });
    }).then(check);
  }

  // One-time import from the old id-only sync (those rows are still readable with the public key).
  function importLegacy(rawId) {
    var id = (rawId || "").trim().toLowerCase();
    if (!/^[a-z0-9가-힣_-]{2,32}$/.test(id)) return Promise.reject(new Error("아이디 형식이 맞지 않아요."));
    var h = { apikey: apiKey, "Content-Type": "application/json", Authorization: "Bearer " + apiKey };
    return fetch(baseUrl + "/rest/v1/user_data?select=data&user_id=eq." + encodeURIComponent(id), { headers: h })
      .then(check).then(function (res) { return res.json(); })
      .then(function (rows) {
        if (!rows.length) throw new Error("그 아이디로 저장된 체크리스트가 없어요.");
        store.applyDoc(store.mergeDocs(store.snapshot(), rows[0].data));
        remoteListeners.forEach(function (fn) { fn(); });
        return syncNow();
      });
  }

  function setStatus(status, err) {
    state.status = status;
    state.error = err || null;
    statusListeners.forEach(function (fn) { fn(state); });
  }

  // Pull, merge with local, push back if the server is behind. Runs one at a time.
  function syncNow() {
    if (!active()) return Promise.resolve(false);
    var who = session.user_id;
    queue = queue.then(function () {
      if (!session || session.user_id !== who) return false;
      setStatus("syncing");
      return fetchRemote().then(function (remote) {
        if (!session || session.user_id !== who) return false;
        var local = store.snapshot();
        var merged = remote ? store.mergeDocs(local, remote) : local;
        var mergedKey = store.docKey(merged);
        var localChanged = mergedKey !== store.docKey(local);
        var remoteBehind = !remote || mergedKey !== store.docKey(remote);
        if (localChanged) store.applyDoc(merged);
        return (remoteBehind ? pushRemote(merged) : Promise.resolve()).then(function () {
          state.lastSync = Date.now();
          util.writeString(LAST_SYNC_KEY, String(state.lastSync));
          setStatus("ok");
          if (localChanged) remoteListeners.forEach(function (fn) { fn(); });
          return localChanged;
        });
      });
    }).catch(function (err) {
      if (err && err.authExpired) {
        // Keep the notes on this device; just disconnect.
        signOutLocally();
        setStatus("off");
        remoteListeners.forEach(function (fn) { fn(); });
        return false;
      }
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

  // create=true signs up; otherwise signs in. Resolves true when signed in, false when the email must be confirmed first.
  function login(email, password, create) {
    var address = (email || "").trim();
    if (!address || !password) return Promise.reject(new Error("이메일과 비밀번호를 입력해 주세요."));
    if (!configured()) return Promise.reject(new Error("동기화 서버가 설정되지 않았어요."));
    var call = create
      ? authCall("/signup", { email: address, password: password })
      : authCall("/token?grant_type=password", { email: address, password: password });
    return call.then(function (json) {
      var next = sessionFrom(json);
      if (!next) return false; // sign-up waiting for the confirmation mail
      saveSession(next);
      return syncNow().then(function () { return true; });
    });
  }

  function logout() {
    signOutLocally();
    store.clear();
    setStatus("off");
    remoteListeners.forEach(function (fn) { fn(); });
  }

  // syncNow is a no-op until signed in, so these triggers are safe to register up front
  // and start working as soon as the user signs in mid-session.
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
    callFunction: callFunction,
    importLegacy: importLegacy,
    onStatus: function (fn) { statusListeners.push(fn); },
    onRemoteChange: function (fn) { remoteListeners.push(fn); }
  };
})(window);
