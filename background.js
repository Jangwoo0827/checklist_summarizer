// Background worker. Its only job: take a screenshot of the visible tab for the region picker
// (content scripts can't call chrome.tabs.captureVisibleTab themselves). It only works for the tab the
// user opened the extension on (activeTab) and only answers messages from this extension's own scripts.
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message || message.type !== "cn-capture" || !sender.tab) return false;
  chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: "png" }, function (dataUrl) {
    if (chrome.runtime.lastError || !dataUrl) sendResponse({ error: (chrome.runtime.lastError || {}).message || "capture failed" });
    else sendResponse({ dataUrl: dataUrl });
  });
  return true; // the reply is asynchronous
});
