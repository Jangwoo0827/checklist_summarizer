(function (root) {
  "use strict";
  var CN = root.CN = root.CN || {};
  var util = CN.util;
  var parser = CN.parser;
  var store = CN.store;

  var doc = root.document;
  var elTitle = doc.getElementById("title-input");
  var elText = doc.getElementById("text-input");
  var elBuild = doc.getElementById("btn-build");

  var editingListId = null;

  function openNew() {
    editingListId = null;
    elBuild.textContent = "체크리스트 만들기";
    elTitle.value = util.todayLabel();
    elText.value = "";
    CN.app.showInput();
    elText.focus();
  }

  function openEdit(list) {
    editingListId = list.id;
    elBuild.textContent = "체크리스트 수정하기";
    elTitle.value = list.title;
    elText.value = parser.linesToText(list.lines);
    CN.app.showInput();
  }

  function cancel() {
    var back = editingListId || CN.app.activeId();
    editingListId = null;
    if (back && store.getList(back)) CN.app.openDetail(back);
    else CN.app.showList();
  }

  function build() {
    var newLines = parser.parseText(elText.value);
    if (!newLines.length) {
      util.toast("할 일을 한 줄 이상 적어주세요");
      elText.focus();
      return;
    }
    var title = elTitle.value.trim() || util.todayLabel();
    var list = editingListId && store.getList(editingListId);
    if (list) {
      list.checked = parser.remapByText(list.lines, newLines, list.checked);
      list.collapsed = parser.remapByText(list.lines, newLines, list.collapsed);
      list.title = title;
      list.lines = newLines;
      store.commit(list);
    } else {
      list = { id: util.uid(), title: title, lines: newLines, checked: {}, collapsed: {}, createdAt: Date.now() };
      store.addList(list);
    }
    editingListId = null;
    CN.app.openDetail(list.id);
  }

  // Tab / Shift+Tab indent and outdent the current line instead of moving focus.
  elText.addEventListener("keydown", function (e) {
    if (e.key !== "Tab") return;
    e.preventDefault();
    var value = elText.value;
    var pos = elText.selectionStart;
    var lineStart = value.lastIndexOf("\n", pos - 1) + 1;
    if (e.shiftKey) {
      var m = value.slice(lineStart).match(/^(\t| {1,4})/);
      if (!m) return;
      elText.value = value.slice(0, lineStart) + value.slice(lineStart + m[0].length);
      elText.selectionStart = elText.selectionEnd = Math.max(lineStart, pos - m[0].length);
    } else {
      var indent = "    ";
      elText.value = value.slice(0, pos) + indent + value.slice(elText.selectionEnd);
      elText.selectionStart = elText.selectionEnd = pos + indent.length;
    }
  });

  doc.getElementById("btn-cancel-new").addEventListener("click", cancel);
  elBuild.addEventListener("click", build);

  CN.input = { openNew: openNew, openEdit: openEdit };
})(window);
