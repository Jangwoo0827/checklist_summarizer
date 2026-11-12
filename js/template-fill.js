(function (root) {
  "use strict";
  var CN = root.CN = root.CN || {};

  // Pours text taken from elsewhere (a web page, a photo, the editor) into a template, in order.
  //
  // A template is a list with blanks ("___"):    1. 단어 ___
  //                                              2. 낭독: ___회 선행
  // The incoming items fill the blanks one by one, from the top: the first item goes into the first
  // blank, the second into the second, and so on. An item that has sub-items brings them along, right
  // under the line it filled. Nothing is matched by name or reordered.
  //   * Fewer items than blanks: the blanks that are left stay as they are.
  //   * More items than blanks: the rest is added at the end.
  // Numbered groups are renumbered afterwards, so lines added at the end continue the numbering.
  //
  // explain() returns the result together with what happened to every line, for the preview;
  // apply() returns just the text.
  var BLANK = "___";
  var INDENT = "    ";

  function markersApi() { return CN.markers; }

  function parseItems(text) {
    return String(text || "").split(/\r?\n/).filter(function (l) { return l.trim(); }).map(function (line) {
      var p = markersApi().parseLine(line);
      return {
        level: Math.floor(markersApi().indentWidth(p.indent) / 4),
        marker: p.marker,            // "1." / "1)" / "" - without the trailing space
        body: p.rest.trim()
      };
    });
  }

  function childCount(items, i) {
    var n = 0;
    while (i + 1 + n < items.length && items[i + 1 + n].level > items[i].level) n++;
    return n;
  }

  function join(marker, body) { return marker ? marker + " " + body : body; }

  // The marker a new sibling of a line with `marker` would get (its number is fixed by renumbering).
  function siblingMarker(marker) {
    return marker ? markersApi().parseLine(marker + " x").next.trim() : "";
  }

  function explain(templateText, incomingText) {
    var tpl = parseItems(templateText);
    var inc = parseItems(incomingText);
    if (!tpl.length) return fromItems(inc, "inserted", "");
    if (!inc.length) return fromItems(tpl, null, "");

    var used = inc.map(function () { return false; });
    var rows = tpl.map(function (t) {
      var blank = t.body.indexOf(BLANK) >= 0;
      return {
        level: t.level, text: join(t.marker, t.body),
        kind: blank ? "blank" : "kept",
        note: blank ? "채울 항목이 모자라서 비어 있어요" : ""
      };
    });
    var attached = tpl.map(function () { return []; });   // sub-items of whatever filled a template line

    // the next item that has not been used: it, and the sub-items that belong to it
    function nextBlock() {
      for (var j = 0; j < inc.length; j++) {
        if (used[j]) continue;
        var count = childCount(inc, j);
        for (var k = j; k <= j + count; k++) used[k] = true;
        return inc.slice(j, j + 1 + count);
      }
      return null;
    }

    // 1. blanks, top to bottom, left to right
    tpl.forEach(function (t, ti) {
      while (rows[ti].text.indexOf(BLANK) >= 0) {
        var block = nextBlock();
        if (!block) return;
        rows[ti].text = rows[ti].text.replace(BLANK, block[0].body);
        rows[ti].kind = "filled";
        rows[ti].note = "빈칸에 순서대로 채웠어요";
        block.slice(1).forEach(function (child) {
          attached[ti].push({
            level: Math.max(t.level + 1, t.level + child.level - block[0].level),
            text: join(child.marker, child.body), kind: "filled", note: ""
          });
        });
      }
    });

    // 2. whatever is left goes at the end, continuing the numbering of the template's top level
    var lastTop = null;
    tpl.forEach(function (t) { if (t.level === 0 && t.marker) lastTop = t; });
    var tail = [];
    for (var q = nextBlock(); q; q = nextBlock()) {
      q.forEach(function (item, i) {
        var head = i === 0;
        tail.push({
          level: head ? item.level : item.level,
          // a top-level item takes the template's own numbering style, so the numbers line up
          text: head && item.level === 0 && lastTop ? join(siblingMarker(lastTop.marker), item.body) : join(item.marker, item.body),
          kind: "inserted",
          note: head ? "빈칸보다 항목이 많아서 맨 아래에 붙였어요" : ""
        });
      });
    }

    var out = [];
    rows.forEach(function (row, ti) {
      out.push(row);
      attached[ti].forEach(function (r) { out.push(r); });
    });
    tail.forEach(function (r) { out.push(r); });

    renumberGroups(out);

    return {
      text: out.map(function (r) { return new Array(r.level + 1).join(INDENT) + r.text; }).join("\n"),
      lines: out
    };
  }

  // Renumbers every group of siblings whose lines are all numbered the same way.
  function renumberGroups(rows) {
    var top = [];
    var groups = [top];          // each group is a list of sibling rows
    var open = [];               // ancestors of the current row, with their children lists
    rows.forEach(function (row) {
      while (open.length && open[open.length - 1].row.level >= row.level) open.pop();
      (open.length ? open[open.length - 1].children : top).push(row);
      var entry = { row: row, children: [] };
      groups.push(entry.children);
      open.push(entry);
    });
    groups.forEach(function (group) {
      var next = markersApi().renumber(group.map(function (r) { return r.text; }));
      if (next) group.forEach(function (r, i) { r.text = next[i]; });
    });
  }

  function fromItems(items, kind, note) {
    var lines = items.map(function (it) {
      var blank = it.body.indexOf(BLANK) >= 0;
      return {
        level: it.level, text: join(it.marker, it.body),
        kind: kind || (blank ? "blank" : "kept"),
        note: note || (!kind && blank ? "채울 항목이 없어서 비어 있어요" : "")
      };
    });
    return { text: lines.map(function (r) { return new Array(r.level + 1).join(INDENT) + r.text; }).join("\n"), lines: lines };
  }

  function apply(templateText, incomingText) { return explain(templateText, incomingText).text; }

  CN.templateFill = { apply: apply, explain: explain };
  if (typeof module !== "undefined" && module.exports) module.exports = CN.templateFill;
})(typeof window !== "undefined" ? window : globalThis);
