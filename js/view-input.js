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

  var elFillHint = doc.getElementById("fill-hint");
  var BLANK = "___";

  var editingListId = null;
  var fillMode = false; // filling in a template: Tab moves between its blanks
  var fillLine = -1;    // line of the blank the user is currently filling

  function setFillMode(on) {
    fillMode = on;
    fillLine = -1;
    elFillHint.hidden = !on;
  }

  function openNew() {
    setFillMode(false);
    editingListId = null;
    elBuild.textContent = "체크리스트 만들기";
    elTitle.value = util.todayLabel();
    elText.value = "";
    CN.app.showInput();
    elText.focus();
  }

  // Puts list text in the editor. When it still has blanks ("___", e.g. from a template), the editor
  // switches to fill mode and selects the first one.
  function replaceText(text) {
    elText.value = text;
    elText.scrollTop = 0;
    if (text.indexOf(BLANK) < 0) {
      setFillMode(false);
      elText.setSelectionRange(0, 0);
      return;
    }
    setFillMode(true);
    elText.setSelectionRange(0, 0);
    jumpToBlank(false);
  }

  // New list whose text comes from outside (a web page, a region read with OCR), already in list format.
  function openNewWithList(text) {
    openNew();
    replaceText(text);
  }

  function openEdit(list) {
    setFillMode(false);
    editingListId = list.id;
    elBuild.textContent = "체크리스트 수정하기";
    elTitle.value = list.title;
    elText.value = parser.linesToText(list.lines);
    CN.app.showInput();
  }

  // New list from a saved template: put its text in the editor and select the first blank.
  function useTemplate(tpl) {
    openNew();
    elText.value = tpl.text;
    if (tpl.text.indexOf(BLANK) < 0) {
      elText.setSelectionRange(tpl.text.length, tpl.text.length);
      return;
    }
    setFillMode(true);
    elText.scrollTop = 0;
    elText.setSelectionRange(0, 0);
    jumpToBlank(false);
  }

  function lineIndexAt(pos) { return elText.value.slice(0, pos).split("\n").length - 1; }

  // Keeps a selection inside the textarea's visible area (setSelectionRange alone doesn't scroll).
  function reveal(pos) {
    var lineHeight = parseFloat(root.getComputedStyle(elText).lineHeight) || 24;
    var top = lineIndexAt(pos) * lineHeight;
    if (top < elText.scrollTop) elText.scrollTop = top;
    else if (top + lineHeight * 2 > elText.scrollTop + elText.clientHeight) {
      elText.scrollTop = top + lineHeight * 2 - elText.clientHeight;
    }
  }

  // Selects the next (or previous) "___" from the caret. Returns false when there is none that way.
  function jumpToBlank(backwards) {
    var value = elText.value;
    var at = -1;
    if (backwards) {
      if (elText.selectionStart > 0) at = value.lastIndexOf(BLANK, elText.selectionStart - 1);
    } else {
      at = value.indexOf(BLANK, elText.selectionEnd);
    }
    if (at < 0) return false;
    elText.focus();
    elText.setSelectionRange(at, at + BLANK.length);
    fillLine = lineIndexAt(at);
    reveal(at);
    return true;
  }

  // Tab/Shift+Tab hop between blanks only while the caret is on the blank being filled,
  // so indenting other lines still works.
  function handleBlankJump(e) {
    var selected = elText.value.slice(elText.selectionStart, elText.selectionEnd) === BLANK;
    if (!selected && lineIndexAt(elText.selectionStart) !== fillLine) return false;
    if (!jumpToBlank(e.shiftKey)) return false;
    e.preventDefault();
    return true;
  }

  function cancel() {
    setFillMode(false);
    var back = editingListId || CN.app.activeId();
    editingListId = null;
    if (back && store.getList(back)) CN.app.openDetail(back);
    else CN.app.showList();
  }

  function build() {
    var newLines = parser.parseText(elText.value, CN.settings.markerLevelOf);
    if (!newLines.length) {
      util.toast("할 일을 한 줄 이상 적어주세요");
      elText.focus();
      return;
    }
    setFillMode(false);
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

  // Marker parsing and numbering live in markers.js; the style used at each level comes from settings.
  function parseLine(line) { return CN.markers.parseLine(line, CN.settings.styleFor); }
  function indentWidth(indent) { return CN.markers.indentWidth(indent); }
  function markerFor(lines, index, width) { return CN.markers.markerFor(lines, index, width, CN.settings.styleFor); }

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
    } else if (p.marker && p.styleId === CN.settings.styleFor(width)) {
      // The item still wears the marker of its old level (e.g. "3. 독해"): give it the new level's style.
      var all = elText.value.split("\n");
      var at = elText.value.slice(0, b.start).split("\n").length - 1;
      var prefix = newIndent + markerFor(all, at, indentWidth(newIndent));
      replaceRange(b.start, b.end, prefix + p.rest);
      var caret = Math.max(b.start + prefix.length, b.start + prefix.length + p.rest.length - (b.end - pos));
      elText.setSelectionRange(caret, caret);
    } else {
      replaceRange(b.start, b.start + p.indent.length, newIndent);
      var shift = newIndent.length - p.indent.length;
      elText.setSelectionRange(Math.max(b.start, pos + shift), Math.max(b.start, pos + shift));
    }
  }

  elText.addEventListener("keydown", function (e) {
    if (e.isComposing || e.keyCode === 229) return; // Korean IME is still composing a syllable
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) handleEnter(e);
    else if (e.key === "Tab" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (fillMode && handleBlankJump(e)) return;
      handleTab(e);
    }
  });
  elText.addEventListener("input", function () {
    if (fillMode && elText.value.indexOf(BLANK) < 0) setFillMode(false);
  });

  doc.getElementById("btn-cancel-new").addEventListener("click", cancel);
  elBuild.addEventListener("click", build);

  CN.input = { openNew: openNew, openEdit: openEdit, openNewWithList: openNewWithList, replaceText: replaceText, useTemplate: useTemplate };
})(window);
