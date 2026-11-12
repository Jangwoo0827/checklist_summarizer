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
  var elLink = doc.getElementById("live-link");
  var elNext = doc.getElementById("live-next");
  var elText = doc.getElementById("text-input");

  var CONNECT_WAIT_MS = 3000;
  var state = null;     // { tabId, templateId, ready, timer, blocks, current } while live

  function template() { return state && state.templateId ? store.getTemplate(state.templateId) : null; }

  function status(result, list) {
    if (!list) return "아직 선택한 글이 없어요";
    if (!result) return list.split("\n").filter(function (l) { return l.trim(); }).length + "줄";
    var counts = { filled: 0, blank: 0, inserted: 0 };
    result.lines.forEach(function (l) { if (counts[l.kind] !== undefined) counts[l.kind]++; });
    var parts = [];
    if (counts.filled) parts.push(counts.filled + "줄 채움");
    if (counts.inserted) parts.push(counts.inserted + "줄 끝에 붙임");
    if (counts.blank) parts.push(counts.blank + "줄 비어 있음");
    return parts.join(" · ");
  }

  // Where the next selection will go.
  function nextHint(result) {
    var tpl = template();
    if (!tpl) return "다음에 고른 글은 아래에 이어서 붙어요";
    var blank = result && result.lines.filter(function (l) { return l.kind === "blank"; })[0];
    if (blank) return "다음에 고른 글은 \"" + blank.text + "\" 칸에 들어가요";
    return "빈칸을 다 채웠어요. 더 고르면 맨 아래에 붙어요";
  }

  // The editor shows every finished item plus the one being selected now.
  function render() {
    var tpl = template();
    var parts = state.blocks.concat(state.current ? [state.current] : []);
    var list = parts.map(function (b) { return CN.pageText.toList(b, CN.settings.styleFor); })
      .filter(function (l) { return l.trim(); }).join("\n");
    var result = tpl ? CN.templateFill.explain(tpl.text, list) : null;
    if (!list) CN.input.setLiveText(tpl ? tpl.text : "");
    else CN.input.setLiveText(result ? result.text : CN.templateFill.tidy(list));
    elStatus.textContent = status(result, list);
    elNext.textContent = nextHint(result || (tpl ? CN.templateFill.explain(tpl.text, "") : null));
  }

  function showBar() {
    var tpl = template();
    elTitle.textContent = tpl
      ? "\"" + tpl.name + "\" 템플릿에 실시간으로 채우는 중"
      : "페이지에서 글을 드래그하면 여기에 바로 나타나요";
    elBar.hidden = false;
    render();
  }

  // The page's selection changed (or was there from the start). A new selection somewhere else becomes the
  // next item; growing the same selection updates the current one.
  function onSelection(text) {
    if (!state) return;
    var next = CN.pageText.accumulate(state, text);
    state.blocks = next.blocks;
    state.current = next.current;
    render();
  }

  function undo() {
    if (!state) return;
    if (state.current) state.current = "";
    else state.blocks.pop();
    render();
    util.toast("마지막 항목을 지웠어요");
  }

  function reset() {
    if (!state) return;
    state.blocks = [];
    state.current = "";
    render();
    util.toast("처음부터 다시 고르세요");
  }

  function stop() {
    if (state) clearTimeout(state.timer);
    state = null;
    elBar.hidden = true;
  }

  // The page's watcher says it is listening: the connection works.
  function onReady(frames) {
    if (!state) return;
    state.ready = true;
    clearTimeout(state.timer);
    elLink.className = "live-link is-ok";
    elLink.textContent = "페이지와 연결됐어요 (화면 " + (frames || 1) + "개를 보고 있어요)";
  }

  // No word from the page: say so, instead of leaving the editor silently empty.
  function noSignal() {
    if (!state || state.ready) return;
    elLink.className = "live-link is-warn";
    elLink.textContent = "페이지에서 신호가 안 와요. 확장 프로그램을 새로고침(↻)한 뒤 다시 해보거나, 아래 \"클릭해서 고르기\"를 써보세요.";
  }

  // Opens a fresh editor and starts following the page. `initial` is a selection that was already there.
  function start(tab, tpl, initial) {
    CN.input.openNew();                          // also ends any earlier live session
    state = { tabId: tab.id, templateId: tpl ? tpl.id : "", ready: false, timer: 0, blocks: [], current: "" };
    elLink.className = "live-link";
    elLink.textContent = "페이지와 연결하는 중…";
    showBar();
    return CN.pageImport.startLive(tab.id, tpl && tpl.id).then(function (running) {
      if (!running) { stop(); return; }
      if (state) state.timer = setTimeout(noSignal, CONNECT_WAIT_MS);
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
  doc.getElementById("live-undo").addEventListener("click", undo);
  doc.getElementById("live-reset").addEventListener("click", reset);
  doc.getElementById("live-stop").addEventListener("click", function () {
    stop();
    util.toast("실시간 채우기를 멈췄어요. 지금 내용은 그대로 고칠 수 있어요");
  });

  CN.live = { start: start, stop: stop, onSelection: onSelection, onReady: onReady, active: function () { return !!state; } };
})(window);
