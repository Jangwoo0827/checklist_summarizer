(function (root) {
  "use strict";
  var CN = root.CN = root.CN || {};
  var util = CN.util;

  // Getting text out of the web page the user is looking at. The app lives in a side panel (or a narrow
  // window), so it stays open while the user works on the page. This file is the mechanics; the screens
  // that ask the user what to do live in new-flow.js.
  //
  //   hasAccess / requestAccess   the one-time permission to read web pages (asked for on first use)
  //   prepare()                   finds the page being viewed and reads text selected on it, in any frame
  //   start(...)                  starts a mode on the page:
  //                                 "unlock"  lifts copy protection so text can be selected by dragging,
  //                                 "pick"    click-to-pick blocks of text,
  //                                 "region"  drag an area, read it with OCR
  //   init()                      imports what the page hands over (saved to chrome.storage.local), now and
  //                               whenever it arrives while the panel is open
  var PENDING_KEY = "cnPending";
  var PENDING_MAX_AGE_MS = 30 * 60 * 1000;
  var TEMPLATE_PREF_KEY = "checklist_note_import_tpl_v1";   // the template chosen before the page took over
  var ORIGINS = ["http://*/*", "https://*/*"];

  var doc = root.document;
  var chromeApi = root.chrome;

  function available() {
    return doc.documentElement.classList.contains("is-popup") &&
      !!(chromeApi && chromeApi.scripting && chromeApi.tabs && chromeApi.storage && chromeApi.permissions && chromeApi.runtime);
  }

  // ---------- permission ----------

  function hasAccess() {
    return new Promise(function (resolve) {
      chromeApi.permissions.contains({ origins: ORIGINS }, function (granted) { resolve(!!granted); });
    });
  }

  // Must be called straight from a click: the browser shows its own "allow access to all sites" prompt.
  function requestAccess() {
    return new Promise(function (resolve) {
      chromeApi.permissions.request({ origins: ORIGINS }, function (granted) { resolve(!!granted); });
    });
  }

  // ---------- the page ----------

  // The page being looked at: the active tab of the last focused browser window. (A side panel or the
  // fallback window is not that tab, so "the current window" would be the wrong one.)
  function activeTab() {
    return new Promise(function (resolve) {
      function done(tabs) { resolve(tabs && tabs[0]); }
      if (chromeApi.windows && chromeApi.windows.getLastFocused) {
        chromeApi.windows.getLastFocused({ windowTypes: ["normal"] }, function (win) {
          if (!win || (chromeApi.runtime && chromeApi.runtime.lastError)) chromeApi.tabs.query({ active: true, currentWindow: true }, done);
          else chromeApi.tabs.query({ active: true, windowId: win.id }, done);
        });
      } else {
        chromeApi.tabs.query({ active: true, currentWindow: true }, done);
      }
    });
  }

  function inject(tabId, func, options) {
    options = options || {};
    var details = { target: { tabId: tabId, allFrames: !!options.allFrames }, func: func };
    if (options.world) details.world = options.world;
    return chromeApi.scripting.executeScript(details);
  }

  // pageSelection walks the frames of the page itself, so one call on the top frame is enough; it is also
  // run in every frame we can reach, in case a frame of another site holds the selection. The innermost
  // selection wins. `frames` (how many documents were looked at) is only for the "nothing selected" hint.
  function readSelection(tabId) {
    return inject(tabId, CN.pageSelection, { allFrames: true }).catch(function () {
      return inject(tabId, CN.pageSelection);
    }).then(function (results) {
      var answers = (results || []).map(function (r) { return r && r.result; }).filter(Boolean);
      var chosen = answers.filter(function (a) { return a.text && a.text.trim(); }).sort(function (a, b) {
        return b.depth - a.depth || b.text.length - a.text.length;
      })[0];
      var looked = answers.reduce(function (most, a) { return Math.max(most, a.frames || 0); }, 0);
      return { text: chosen ? chosen.text : "", frames: looked };
    });
  }

  // Resolves { needsAccess }, { error }, or { tab, selection }.
  function prepare() {
    return hasAccess().then(function (granted) {
      if (!granted) return { needsAccess: true };
      return activeTab().then(function (tab) {
        if (!tab || !/^https?:/.test(tab.url || "")) {
          return { error: "이 페이지에서는 쓸 수 없어요. 일반 웹페이지를 보고 있는 상태에서 눌러주세요" };
        }
        return readSelection(tab.id).then(function (found) {
          return { tab: tab, selection: found.text, frames: found.frames };
        });
      });
    }).catch(function (err) {
      console.error(err);
      return { error: "이 페이지에서는 글을 가져올 수 없어요 (" + (err && err.message ? err.message : "알 수 없는 오류") + ")" };
    });
  }

  var MODES = {
    // Every frame: the text to select may live in one.
    unlock: function (tabId) { return inject(tabId, CN.pageUnlock, { world: "MAIN", allFrames: true }); },
    pick: function (tabId) { return inject(tabId, CN.pagePick); },
    region: function (tabId) { return inject(tabId, CN.pageRegion); }
  };

  // Live mode: unlock selecting (every frame, in the page's own world) and report selection changes (every
  // frame we can reach, in the content-script world). Resolves true when both are running.
  function startLive(tabId, templateId) {
    util.writeString(TEMPLATE_PREF_KEY, templateId || "");   // pick / region started from the live bar reuse it
    return Promise.all([
      MODES.unlock(tabId),
      inject(tabId, CN.pageWatch, { allFrames: true }).catch(function () { return inject(tabId, CN.pageWatch); })
    ]).then(function () { return true; }, function (err) {
      console.error(err);
      util.toast("이 페이지에서는 쓸 수 없어요 (" + (err && err.message ? err.message : "알 수 없는 오류") + ")");
      return false;
    });
  }

  // Resolves true when the mode is running on the page.
  function start(tabId, mode, templateId) {
    util.writeString(TEMPLATE_PREF_KEY, templateId || "");
    return MODES[mode](tabId).then(function () { return true; }, function (err) {
      console.error(err);
      util.toast("이 페이지에서는 쓸 수 없어요 (" + (err && err.message ? err.message : "알 수 없는 오류") + ")");
      return false;
    });
  }

  // ---------- what the page hands over ----------

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
      if (CN.newFlow.close) CN.newFlow.close();
      if (pending.image) importImage(pending.image, templateId);
      else if (pending.text) CN.newFlow.deliver(CN.pageText.toList(pending.text, CN.settings.styleFor), templateId);
    });
  }

  function init() {
    if (!available()) return;
    importPending();
    // The page reports its selection as it changes (see live.js), by runtime message and by storage.
    function route(report) {
      if (!report || !CN.live) return;
      if (report.type === "cn-selection") CN.live.onSelection(report.text);
      else if (report.type === "cn-watch-ready") CN.live.onReady(report.frames);
    }
    chromeApi.runtime.onMessage.addListener(route);
    // The panel stays open while the user picks on the page, so take the result the moment it is saved.
    chromeApi.storage.onChanged.addListener(function (changes, area) {
      if (area !== "local") return;
      if (changes[PENDING_KEY] && changes[PENDING_KEY].newValue) importPending();
      if (changes.cnSelection && changes.cnSelection.newValue) route(changes.cnSelection.newValue);
    });
  }

  CN.pageImport = {
    available: available, hasAccess: hasAccess, requestAccess: requestAccess,
    prepare: prepare, start: start, startLive: startLive, init: init
  };
})(window);
