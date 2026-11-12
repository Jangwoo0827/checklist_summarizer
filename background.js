// Background worker.
//
// 1. Opens the app as a side panel on the right of the browser when the toolbar icon is clicked
//    (chrome.sidePanel). Browsers without that API get the same page in a narrow window docked to the
//    right edge of the browser window instead.
// 2. Takes a screenshot of the visible tab for the region picker (content scripts can't call
//    chrome.tabs.captureVisibleTab themselves). It only answers messages from this extension's own scripts.
var PANEL_URL = chrome.runtime.getURL("panel.html");
var WINDOW_WIDTH = 440;

function hasSidePanel() {
  return !!(chrome.sidePanel && chrome.sidePanel.setPanelBehavior);
}

// With this set, a click on the toolbar icon (or the _execute_action shortcut) toggles the side panel
// and chrome.action.onClicked is not fired. The setting persists, but setting it again is harmless.
function setupSidePanel() {
  if (!hasSidePanel()) return;
  try {
    var result = chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    if (result && result.catch) result.catch(function () {});
  } catch (e) {}
}

// Fallback: the app in its own narrow window, at the right edge of the last focused browser window.
function openPanelWindow() {
  chrome.windows.getAll({ populate: true, windowTypes: ["popup"] }, function (windows) {
    // panel.html hands over to index.html?panel=1, so match any page of this extension.
    var ours = chrome.runtime.getURL("");
    var existing = (windows || []).filter(function (w) {
      return (w.tabs || []).some(function (t) { return (t.url || "").indexOf(ours) === 0; });
    })[0];
    if (existing) {
      chrome.windows.update(existing.id, { focused: true });
      return;
    }
    chrome.windows.getLastFocused({ windowTypes: ["normal"] }, function (base) {
      var options = { url: PANEL_URL, type: "popup", width: WINDOW_WIDTH, focused: true };
      if (base && base.width) {
        options.height = base.height;
        options.top = base.top;
        options.left = Math.max(0, (base.left || 0) + base.width - WINDOW_WIDTH);
      } else {
        options.height = 720;
      }
      chrome.windows.create(options);
    });
  });
}

setupSidePanel();
chrome.runtime.onInstalled.addListener(setupSidePanel);

// Only fires when the side panel could not take over the click (no sidePanel API, or it failed).
chrome.action.onClicked.addListener(function (tab) {
  if (chrome.sidePanel && chrome.sidePanel.open && tab && tab.id != null) {
    try {
      var opened = chrome.sidePanel.open({ tabId: tab.id });
      if (opened && opened.catch) opened.catch(openPanelWindow);
      return;
    } catch (e) {}
  }
  openPanelWindow();
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message || message.type !== "cn-capture" || !sender.tab) return false;
  chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: "png" }, function (dataUrl) {
    if (chrome.runtime.lastError || !dataUrl) sendResponse({ error: (chrome.runtime.lastError || {}).message || "capture failed" });
    else sendResponse({ dataUrl: dataUrl });
  });
  return true; // the reply is asynchronous
});
