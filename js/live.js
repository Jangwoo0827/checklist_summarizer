(function (root) {
  "use strict";
  var CN = root.CN = root.CN || {};
  var util = CN.util;
  var store = CN.store;

  // Live mode: "페이지" in the new-checklist cards. The page is unlocked for selecting and the editor
  // follows the page's selection as it is made - text appears (or the template fills) while the user
  // drags. Typing in the editor takes over: the live updates stop, so nothing the user wrote is overwritten.
  var doc = root.document;
  var elBar = doc.getElementById("live-bar");
  var elTitle = doc.getElementById("live-title");
  var elStatus = doc.getElementById("live-status");
  var elText = doc.getElementById("text-input");

  var state = null;     // { tabId, templateId } while live

  function status(result, list) {
    if (!result) {
      var n = list ? list.split("\n").filter(function (l) { return l.trim(); }).length : 0;
      return n ? n + "줄" : "아직 선택한 글이 없어요";
    }
    var counts = { filled: 0, blank: 0, inserted: 0 };
    result.lines.forEach(function (l) { if (counts[l.kind] !== undefined) counts[l.kind]++; });
    var parts = [];
    if (counts.filled) parts.push(counts.filled + "줄 채움");
    if (counts.inserted) parts.push(counts.inserted + "줄 끝에 붙임");
    if (counts.blank) parts.push(counts.blank + "줄 비어 있음");
    return parts.length ? parts.join(" · ") : "아직 선택한 글이 없어요";
  }

  function showBar() {
    var tpl = state.templateId ? store.getTemplate(state.templateId) : null;
    elTitle.textContent = tpl
      ? "\"" + tpl.name + "\" 템플릿에 실시간으로 채우는 중"
      : "페이지에서 글을 드래그하면 여기에 바로 나타나요";
    elStatus.textContent = status(null, "");
    elBar.hidden = false;
  }

  // The page's selection changed (or was there from the start).
  function onSelection(text) {
    if (!state) return;
    var list = CN.pageText.toList(text, CN.settings.styleFor);
    if (!list.trim()) return;
    var tpl = state.templateId ? store.getTemplate(state.templateId) : null;
    var result = tpl ? CN.templateFill.explain(tpl.text, list) : null;
    CN.input.setLiveText(result ? result.text : list);
    elStatus.textContent = status(result, list);
  }

  function stop() {
    state = null;
    elBar.hidden = true;
  }

  // Opens a fresh editor and starts following the page. `initial` is a selection that was already there.
  function start(tab, tpl, initial) {
    CN.input.openNew();                          // also ends any earlier live session
    state = { tabId: tab.id, templateId: tpl ? tpl.id : "" };
    showBar();
    return CN.pageImport.startLive(tab.id, tpl && tpl.id).then(function (running) {
      if (!running) { stop(); return; }
      if (initial) onSelection(initial);
      else util.toast("페이지에서 글을 드래그해서 선택하세요");
    });
  }

  // Typing in the editor is the user taking over.
  elText.addEventListener("input", function (e) {
    if (!state || !e.isTrusted) return;
    stop();
    util.toast("직접 고치는 중이라 자동으로 채우는 걸 멈췄어요");
  });

  // Other ways to read the page: they hand their result over once, so live mode ends first.
  function other(mode) {
    return function () {
      if (!state) return;
      var tabId = state.tabId;
      var templateId = state.templateId;
      CN.pageImport.start(tabId, mode, templateId).then(function (running) {
        if (!running) return;
        stop();
        util.toast(mode === "pick" ? "페이지에서 가져올 글을 클릭해서 고르세요" : "페이지에서 가져올 영역을 드래그하세요");
      });
    };
  }
  doc.getElementById("live-pick").addEventListener("click", other("pick"));
  doc.getElementById("live-region").addEventListener("click", other("region"));
  doc.getElementById("live-stop").addEventListener("click", function () {
    stop();
    util.toast("실시간 채우기를 멈췄어요. 지금 내용은 그대로 고칠 수 있어요");
  });

  CN.live = { start: start, stop: stop, onSelection: onSelection, active: function () { return !!state; } };
})(window);
