(function (root) {
  "use strict";
  var CN = root.CN = root.CN || {};

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function todayLabel(date) {
    var d = date || new Date();
    return (d.getMonth() + 1) + "/" + d.getDate() + " 체크리스트";
  }

  // localStorage can throw (private mode, file:// quirks, blocked storage); never let that break the app.
  function readJSON(key, fallback) {
    try {
      var raw = root.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function writeJSON(key, value) {
    try { root.localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }
  function readString(key) {
    try { return root.localStorage.getItem(key); } catch (e) { return null; }
  }
  function writeString(key, value) {
    try {
      if (value == null) root.localStorage.removeItem(key);
      else root.localStorage.setItem(key, value);
    } catch (e) {}
  }

  var toastTimer = null;
  // opts.action + opts.onAction add a button (e.g. 되돌리기); such toasts stay up longer.
  function toast(message, opts) {
    var el = root.document && root.document.getElementById("toast");
    if (!el) return;
    opts = opts || {};
    el.innerHTML = "";
    var text = root.document.createElement("span");
    text.textContent = message;
    el.appendChild(text);
    if (opts.action) {
      var btn = root.document.createElement("button");
      btn.type = "button";
      btn.className = "toast-action";
      btn.textContent = opts.action;
      btn.addEventListener("click", function () {
        el.hidden = true;
        clearTimeout(toastTimer);
        opts.onAction();
      });
      el.appendChild(btn);
    }
    el.hidden = false;
    el.classList.remove("toast-in");
    void el.offsetWidth; // restart the entrance animation
    el.classList.add("toast-in");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, opts.action ? 5000 : 2600);
  }

  CN.util = {
    uid: uid,
    todayLabel: todayLabel,
    readJSON: readJSON,
    writeJSON: writeJSON,
    readString: readString,
    writeString: writeString,
    toast: toast
  };
  if (typeof module !== "undefined" && module.exports) module.exports = CN.util;
})(typeof window !== "undefined" ? window : globalThis);
