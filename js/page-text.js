(function (root) {
  "use strict";
  var CN = root.CN = root.CN || {};

  // Turns text taken from a web page (a table cell or a selection) into the editor's list format:
  // numbered items at the left, "1)"/① sub-items indented one level, loose lines kept under the
  // item they follow. Unlike OCR text this is exact, so nothing is guessed or repaired: every
  // line break in the page is a real one.
  var TOP = /^(\d{1,2})\s*\.(?!\d)\s*(.*)$/;
  var SUB = /^(?:\((\d{1,2})\)|(\d{1,2})\s*\)|([①-⑳]))\s*(.*)$/;
  var INDENT = "    ";

  function normalize(line) {
    return line
      .replace(/[ ​　]/g, " ")
      .replace(/[：︰]/g, ":").replace(/[，]/g, ",").replace(/[（]/g, "(").replace(/[）]/g, ")")
      .replace(/\s+/g, " ").replace(/\s+([:,])/g, "$1")
      .trim();
  }

  // The marker for item number n at `width` columns, in the style the user chose for that level.
  function marker(styleFor, width, n) {
    var id = styleFor ? styleFor(width) : width === 0 ? "dot" : "paren";
    var markers = CN.markers;
    if (!markers) return n + (width === 0 ? ". " : ") ");
    return markers.sample(id, n);
  }

  // styleFor(width) is optional (the settings' marker styles); without it "1." / "1)" are used.
  function toList(raw, styleFor) {
    var lines = String(raw || "").split(/\r?\n/).map(normalize).filter(Boolean);

    // Skip a heading above the first numbered item, when there is one.
    var first = -1;
    for (var i = 0; i < lines.length; i++) {
      if (TOP.test(lines[i])) { first = i; break; }
    }
    if (first > 0) lines = lines.slice(first);

    // Loose lines only nest under an item when the text is a numbered list at all.
    var numbered = lines.some(function (line) { return TOP.test(line) || SUB.test(line); });

    // Board titles end with their comment count ("... 숙제 [0]"): noise in a list of posts. Numbered
    // homework text is never touched.
    if (!numbered) {
      lines = lines.map(function (line) { return line.replace(/\s*\[\d+\]$/, "") || line; });
    }

    var out = [];
    var prev = null;
    lines.forEach(function (line) {
      var item;
      var m = line.match(TOP);
      if (m) {
        item = { level: 0, text: m[2] ? marker(styleFor, 0, Number(m[1])) + m[2] : "" };
      } else if ((m = line.match(SUB))) {
        var n = m[1] || m[2] || (m[3].charCodeAt(0) - 0x2460 + 1);
        item = { level: 1, text: m[4] ? marker(styleFor, 4, Number(n)) + m[4] : "" };
      } else {
        // A plain line belongs to the item above: under a top-level item it becomes its child,
        // after a sub-item it stays beside it.
        item = { level: numbered && prev ? Math.max(prev.level, 1) : 0, text: line };
      }
      if (!item.text) return;
      out.push(item);
      prev = item;
    });

    return out.map(function (it) {
      return new Array(it.level + 1).join(INDENT) + it.text;
    }).join("\n");
  }

  // Live selecting reports the selection again and again while it is dragged. Each report is either the same
  // selection growing or shrinking (the new text contains the old, or the old contains the new) or a new
  // selection somewhere else, which becomes the next item. Takes and returns { blocks, current }:
  // `blocks` are the finished items, `current` the one being selected right now.
  function squash(s) { return String(s || "").replace(/\s+/g, " ").trim(); }

  function accumulate(state, text) {
    var blocks = state.blocks.slice();
    var current = state.current;
    var next = String(text || "").trim();
    if (!squash(next)) return { blocks: blocks, current: current };
    if (!current) return { blocks: blocks, current: next };
    var a = squash(next);
    var b = squash(current);
    if (a === b) return { blocks: blocks, current: current };
    if (a.indexOf(b) >= 0 || b.indexOf(a) >= 0) return { blocks: blocks, current: next };   // the same selection, adjusted
    blocks.push(current);
    return { blocks: blocks, current: next };
  }

  CN.pageText = { toList: toList, accumulate: accumulate };
  if (typeof module !== "undefined" && module.exports) module.exports = CN.pageText;
})(typeof window !== "undefined" ? window : globalThis);
