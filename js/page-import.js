(function (root) {
  "use strict";
  var CN = root.CN = root.CN || {};
  var util = CN.util;

  // "이 페이지에서 가져오기" (extension popup only). Text the user has selected on the page is imported
  // straight away. With nothing selected, the page switches to click-to-pick mode; clicking the page
  // closes the popup, so the picked text is saved to chrome.storage.local and imported the next time the
  // popup opens (see importPending).
  var PENDING_KEY = "cnPending";
  var PENDING_MAX_AGE_MS = 30 * 60 * 1000;

  var doc = root.document;
  var chromeApi = root.chrome;
  var button = doc.getElementById("btn-import");

  function inPopup() {
    return doc.documentElement.classList.contains("is-popup") && chromeApi && chromeApi.scripting && chromeApi.tabs && chromeApi.storage;
  }

  function activeTab() {
    return new Promise(function (resolve) {
      chromeApi.tabs.query({ active: true, currentWindow: true }, function (tabs) { resolve(tabs && tabs[0]); });
    });
  }

  function inject(tabId, func, allFrames) {
    return chromeApi.scripting.executeScript({ target: { tabId: tabId, allFrames: !!allFrames }, func: func });
  }

  // A selection may be inside a frame of the page, so look in all of them (frames we have no access
  // to are skipped; if that makes the whole call fail, fall back to the top frame).
  function readSelection(tabId) {
    return inject(tabId, CN.pageSelection, true).catch(function () {
      return inject(tabId, CN.pageSelection, false);
    }).then(function (results) {
      var found = (results || []).map(function (r) { return r && r.result; }).filter(function (t) { return t && t.trim(); });
      return found.length ? found[0] : "";
    });
  }

  function importText(text) {
    CN.input.openNewWith(text);
    util.toast("페이지에서 가져왔어요. 틀린 곳이 있으면 고쳐주세요");
  }

  function run() {
    activeTab().then(function (tab) {
      if (!tab || !/^https?:/.test(tab.url || "")) {
        util.toast("이 페이지에서는 쓸 수 없어요. 일반 웹페이지에서 눌러주세요");
        return null;
      }
      return readSelection(tab.id).then(function (selected) {
        if (selected) { importText(selected); return null; }
        return inject(tab.id, CN.pagePick, false).then(function () {
          // The popup would close on the first click on the page anyway; close it now so the page is clear.
          root.close();
        });
      });
    }).catch(function (err) {
      console.error(err);
      util.toast("이 페이지에서는 글을 가져올 수 없어요");
    });
  }

  // Picks up text the page saved after click-to-pick.
  function importPending() {
    chromeApi.storage.local.get(PENDING_KEY, function (items) {
      var pending = items && items[PENDING_KEY];
      if (!pending) return;
      chromeApi.storage.local.remove(PENDING_KEY);
      if (!pending.text || Date.now() - pending.at > PENDING_MAX_AGE_MS) return;
      importText(pending.text);
    });
  }

  function init() {
    if (!button || !inPopup()) return;
    button.hidden = false;
    button.addEventListener("click", run);
    importPending();
  }

  CN.pageImport = { init: init };
})(window);
