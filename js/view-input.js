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

  // ---------- list-aware typing: Enter continues numbering, Tab/Shift+Tab nest ----------
  var INDENT = "    ";

  // Splits a line into indent, list marker and content. Decimals like "1.5kg" are not markers.
  function parseLine(line) {
    var m;
    if ((m = line.match(/^([ \t]*)(\d+)([.)])(?!\d)[ \t]*(.*)$/))) {
      return { indent: m[1], marker: m[2] + m[3], rest: m[4], next: (Number(m[2]) + 1) + m[3] + " " };
    }
    if ((m = line.match(/^([ \t]*)\((\d+)\)[ \t]*(.*)$/))) {
      return { indent: m[1], marker: "(" + m[2] + ")", rest: m[3], next: "(" + (Number(m[2]) + 1) + ") " };
    }
    if ((m = line.match(/^([ \t]*)([a-zA-Z])\)[ \t]*(.*)$/))) {
      return { indent: m[1], marker: m[2] + ")", rest: m[3], next: String.fromCharCode(m[2].charCodeAt(0) + 1) + ") " };
    }
    if ((m = line.match(/^([ \t]*)([-•])[ \t]+(.*)$/))) {
      return { indent: m[1], marker: m[2], rest: m[3], next: m[2] + " " };
    }
    m = line.match(/^([ \t]*)(.*)$/);
    return { indent: m[1], marker: "", rest: m[2], next: "" };
  }

  function indentWidth(indent) { return indent.replace(/\t/g, INDENT).length; }

  // The marker to use on a line at `width` after the lines above it: continue the nearest
  // sibling's numbering, or start a new list ("1." at the top level, "1)" below it).
  function markerFor(lines, index, width) {
    for (var i = index - 1; i >= 0; i--) {
      var p = parseLine(lines[i]);
      if (!p.marker && !p.rest) continue;
      var w = indentWidth(p.indent);
      if (w < width) break;
      if (w === width && p.marker) return p.next;
    }
    return width === 0 ? "1. " : "1) ";
  }

  // Edits through execCommand so the browser's Ctrl+Z still works; falls back if unsupported.
  function replaceRange(start, end, text) {
    elText.setSelectionRange(start, end);
    var ok = text ? doc.execCommand("insertText", false, text) : doc.execCommand("delete");
    if (!ok) elText.setRangeText(text, start, end, "end");
  }

  function lineBounds(pos) {
    var value = elText.value;
    var start = value.lastIndexOf("\n", pos - 1) + 1;
    var end = value.indexOf("\n", pos);
    return { start: start, end: end === -1 ? value.length : end };
  }

  function handleEnter(e) {
    var pos = elText.selectionStart;
    if (pos !== elText.selectionEnd) return;
    var b = lineBounds(pos);
    var line = elText.value.slice(b.start, b.end);
    var p = parseLine(line);
    if (!p.indent && !p.marker) return; // plain line: normal Enter
    e.preventDefault();
    if (p.marker && !p.rest.trim() && pos === b.end) {
      // Enter on an empty item ends the list, like most editors.
      replaceRange(b.start, b.end, p.indent);
      return;
    }
    replaceRange(pos, pos, "\n" + p.indent + p.next);
  }

  function handleTab(e) {
    e.preventDefault();
    var pos = elText.selectionStart;
    var b = lineBounds(pos);
    var line = elText.value.slice(b.start, b.end);
    var p = parseLine(line);
    var emptyItem = p.marker && !p.rest.trim();
    var width = indentWidth(p.indent);
    var newIndent;
    if (e.shiftKey) {
      if (!width) return;
      newIndent = INDENT.repeat(Math.floor((width - 1) / 4));
    } else {
      newIndent = p.indent + INDENT;
    }
    if (emptyItem) {
      // A freshly continued "3. " that gets nested should restart as "1)" (or resume the outer list).
      var lines = elText.value.split("\n");
      var index = elText.value.slice(0, b.start).split("\n").length - 1;
      replaceRange(b.start, b.end, newIndent + markerFor(lines, index, indentWidth(newIndent)));
    } else {
      replaceRange(b.start, b.start + p.indent.length, newIndent);
      var shift = newIndent.length - p.indent.length;
      elText.setSelectionRange(Math.max(b.start, pos + shift), Math.max(b.start, pos + shift));
    }
  }

  elText.addEventListener("keydown", function (e) {
    if (e.isComposing || e.keyCode === 229) return; // Korean IME is still composing a syllable
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) handleEnter(e);
    else if (e.key === "Tab" && !e.ctrlKey && !e.metaKey && !e.altKey) handleTab(e);
  });

  doc.getElementById("btn-cancel-new").addEventListener("click", cancel);
  elBuild.addEventListener("click", build);

  CN.input = { openNew: openNew, openEdit: openEdit };
})(window);
