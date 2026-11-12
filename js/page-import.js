(function (root) {
  "use strict";
  var CN = root.CN = root.CN || {};
  var util = CN.util;

  // Getting text out of the web page the user is looking at (extension popup only). This file is the
  // mechanics; the screens that ask the user what to do live in new-flow.js.
  //
  //   prepare()      checks the active tab and reads text the user has selected on it
  //   start(...)     starts a mode on the page and closes the popup so the page is clear:
  //                    "unlock"  lifts copy protection so the user can select text by dragging,
  //                    "pick"    click-to-pick blocks of text,
  //                    "region"  drag an area, read it with OCR
  //   init()         when the popup opens, imports what the page saved (clicking the page closes the popup,
  //                  so picked text or a captured region is saved to chrome.storage.local meanwhile)
  var PENDING_KEY = "cnPending";
  var PENDING_MAX_AGE_MS = 30 * 60 * 1000;
  var TEMPLATE_PREF_KEY = "checklist_note_import_tpl_v1";   // the template chosen before the page took over

  var doc = root.document;
  var chromeApi = root.chrome;

  function available() {
    return doc.documentElement.classList.contains("is-popup") && !!(chromeApi && chromeApi.scripting && chromeApi.tabs && chromeApi.storage);
  }

  function activeTab() {
    return new Promise(function (resolve) {
      chromeApi.tabs.query({ active: true, currentWindow: true }, function (tabs) { resolve(tabs && tabs[0]); });
    });
  }

  function inject(tabId, func, options) {
    options = options || {};
    var details = { target: { tabId: tabId, allFrames: !!options.allFrames }, func: func };
    if (options.world) details.world = options.world;
    return chromeApi.scripting.executeScript(details);
  }

  // A selection may be inside a frame of the page, so look in all of them (frames we have no access
  // to are skipped; if that makes the whole call fail, fall back to the top frame).
  function readSelection(tabId) {
    return inject(tabId, CN.pageSelection, { allFrames: true }).catch(function () {
      return inject(tabId, CN.pageSelection);
    }).then(function (results) {
      var found = (results || []).map(function (r) { return r && r.result; }).filter(function (t) { return t && t.trim(); });
      return found.length ? found[0] : "";
    });
  }

  // Resolves { tab, selection }, or { error } when this page can't be used.
  function prepare() {
    return activeTab().then(function (tab) {
      if (!tab || !/^https?:/.test(tab.url || "")) {
        return { error: "이 페이지에서는 쓸 수 없어요. 일반 웹페이지에서 눌러주세요" };
      }
      return readSelection(tab.id).then(function (selection) {
        return { tab: tab, selection: selection };
      });
    }).catch(function (err) {
      console.error(err);
      return { error: "이 페이지에서는 글을 가져올 수 없어요" };
    });
  }

  var MODES = {
    unlock: function (tabId) { return inject(tabId, CN.pageUnlock, { world: "MAIN" }); },
    pick: function (tabId) { return inject(tabId, CN.pagePick); },
    region: function (tabId) { return inject(tabId, CN.pageRegion); }
  };

  function start(tabId, mode, templateId) {
    util.writeString(TEMPLATE_PREF_KEY, templateId || "");
    return MODES[mode](tabId).then(function () { root.close(); }).catch(function (err) {
      console.error(err);
      util.toast("이 페이지에서는 쓸 수 없어요");
    });
  }

  // ---------- what the page saved ----------

  function importImage(dataUrl, templateId) {
    CN.input.openNewWithList("");
    util.toast("영역의 글자를 읽는 중이에요. 처음에는 조금 걸려요");
    return root.fetch(dataUrl).then(function (r) { return r.blob(); }).then(function (blob) {
      return CN.photo.recognize(new root.File([blob], "region.png", { type: "image/png" }));
    }).then(function (result) {
      if (!result.text) { util.toast("영역에서 글자를 찾지 못했어요. 영역을 조금 더 크게 잡아보세요"); return; }
      CN.newFlow.deliver(result.text, templateId, "영역을 읽었어요. 틀린 글자가 있으면 고쳐주세요");
    }).catch(function (err) {
      console.error(err);
      util.toast("영역을 읽지 못했어요. 인터넷 연결을 확인해 주세요");
    });
  }

  function importPending() {
    chromeApi.storage.local.get(PENDING_KEY, function (items) {
      var pending = items && items[PENDING_KEY];
      if (!pending) return;
      chromeApi.storage.local.remove(PENDING_KEY);
      if (Date.now() - pending.at > PENDING_MAX_AGE_MS) return;
      var templateId = util.readString(TEMPLATE_PREF_KEY) || "";
      if (pending.image) importImage(pending.image, templateId);
      else if (pending.text) CN.newFlow.deliver(CN.pageText.toList(pending.text, CN.settings.styleFor), templateId);
    });
  }

  function init() {
    if (available()) importPending();
  }

  CN.pageImport = { available: available, prepare: prepare, start: start, init: init };
})(window);
