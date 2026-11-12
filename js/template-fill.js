(function (root) {
  "use strict";
  var CN = root.CN = root.CN || {};

  // Pours text taken from elsewhere (a web page, a photo, the editor) into a template.
  //
  // A template is a list with blanks ("___"):    1. 단어 ___
  //                                              2. 낭독: ___회 선행
  // Rules, in this order:
  //   1. Same name: a template line with a blank whose name ("단어", "낭독") starts an incoming item is
  //      replaced by that item, children included. The template decides the order.
  //   2. A slot that needs more lines grows: further incoming items with the same name go right below
  //      the slot (same level), so they never fall outside the format.
  //   3. Leftover blanks are filled, one each, by leftover plain values (lines without a number). Plain
  //      values beyond the last blank become sub-items of the last line that was filled this way.
  //   4. Anything still unused is added at the end.
  // Numbered groups are renumbered afterwards so inserted lines fit in.
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

  // Comparing names ignores spaces, colons and dots: "낭독 :" == "낭독:" == "낭독".
  function key(text) { return text.replace(/[\s:：.\-]+/g, "").toLowerCase(); }

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
    if (!inc.length) {
      return fromItems(tpl, null, "");
    }

    var used = inc.map(function () { return false; });
    var rows = tpl.map(function (t) {
      var blank = t.body.indexOf(BLANK) >= 0;
      return {
        level: t.level, text: join(t.marker, t.body),
        kind: blank ? "blank" : "kept",
        note: blank ? "가져온 글에서 못 찾아서 비어 있어요" : ""
      };
    });
    var attached = tpl.map(function () { return []; });   // children of whatever filled a template line
    var groups = tpl.map(function () { return []; });     // lines inserted after a template line's whole block
    var tail = [];

    function takeBlock(j) {
      var count = childCount(inc, j);
      for (var k = j; k <= j + count; k++) used[k] = true;
      return inc.slice(j, j + 1 + count);
    }
    function nameOf(ti) {
      var at = tpl[ti].body.indexOf(BLANK);
      return at < 0 ? "" : tpl[ti].body.slice(0, at).replace(/[\s:：.\-]+$/, "").trim();
    }
    function adopt(ti, block, kind, note) {
      var base = block[0].level;
      block.slice(1).forEach(function (child) {
        attached[ti].push({
          level: Math.max(tpl[ti].level + 1, tpl[ti].level + child.level - base),
          text: join(child.marker, child.body), kind: kind, note: note
        });
      });
    }
    function blockRows(block, level, marker, kind, note) {
      var base = block[0].level;
      return block.map(function (item, i) {
        var head = i === 0;
        return {
          level: head ? level : Math.max(level + 1, level + item.level - base),
          text: head && marker !== null ? join(marker, item.body) : join(item.marker, item.body),
          kind: kind, note: head ? note : ""
        };
      });
    }

    // 1. same name
    var matched = {};            // template line index -> name key, for lines filled by name
    tpl.forEach(function (t, ti) {
      var name = key(nameOf(ti));
      if (!name) return;
      for (var j = 0; j < inc.length; j++) {
        if (used[j] || key(inc[j].body).indexOf(name) !== 0) continue;
        var block = takeBlock(j);
        rows[ti].text = join(t.marker, block[0].body);
        rows[ti].kind = "filled";
        rows[ti].note = "\"" + nameOf(ti) + "\" 칸에 채웠어요";
        adopt(ti, block, "filled", "");
        matched[ti] = name;
        return;
      }
    });

    // 2. the slot needs more lines: same-name items go right below it
    for (var j = 0; j < inc.length; j++) {
      if (used[j]) continue;
      var host = -1;
      Object.keys(matched).forEach(function (ti) {
        if (key(inc[j].body).indexOf(matched[ti]) === 0) host = Number(ti);   // the last matching slot
      });
      if (host < 0) continue;
      groups[host] = groups[host].concat(blockRows(takeBlock(j), tpl[host].level, siblingMarker(tpl[host].marker), "inserted",
        "\"" + nameOf(host) + "\" 칸에 한 줄 더 필요해서 바로 아래에 넣었어요"));
    }

    // 3. leftover plain values fill leftover blanks, one each
    function nextPlain() {
      for (var k = 0; k < inc.length; k++) if (!used[k] && !inc[k].marker) return k;
      return -1;
    }
    var lastPlain = -1;
    tpl.forEach(function (t, ti) {
      while (rows[ti].text.indexOf(BLANK) >= 0) {
        var k = nextPlain();
        if (k < 0) return;
        var block = takeBlock(k);
        rows[ti].text = rows[ti].text.replace(BLANK, block[0].body);
        rows[ti].kind = "filled";
        rows[ti].note = "빈칸에 순서대로 채웠어요";
        adopt(ti, block, "filled", "");
        lastPlain = ti;
      }
    });
    // plain values beyond the last blank: sub-items of the last line filled that way
    if (lastPlain >= 0) {
      for (var p = nextPlain(); p >= 0; p = nextPlain()) {
        var extra = takeBlock(p);
        extra.forEach(function (item, i) {
          attached[lastPlain].push({
            level: tpl[lastPlain].level + 1 + (i === 0 ? 0 : Math.max(0, item.level - extra[0].level)),
            text: join(item.marker, item.body), kind: "inserted",
            note: i === 0 ? "값이 더 있어서 바로 위 줄의 하위 항목으로 넣었어요" : ""
          });
        });
      }
    }

    // 4. whatever is left goes at the end
    for (var q = 0; q < inc.length; q++) {
      if (used[q]) continue;
      tail = tail.concat(blockRows(takeBlock(q), inc[q].level, null, "inserted", "맞는 칸이 없어서 맨 아래에 붙였어요"));
    }

    // compose: a template line, what filled it, and what was inserted after its block
    var endsAt = {};
    tpl.forEach(function (t, ti) {
      var end = ti + childCount(tpl, ti);
      (endsAt[end] = endsAt[end] || []).push(ti);
    });
    var out = [];
    rows.forEach(function (row, ti) {
      out.push(row);
      attached[ti].forEach(function (r) { out.push(r); });
      // blocks ending here, innermost (deepest) first
      (endsAt[ti] || []).slice().sort(function (a, b) { return tpl[b].level - tpl[a].level; }).forEach(function (host) {
        groups[host].forEach(function (r) { out.push(r); });
      });
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
        note: note || (!kind && blank ? "가져온 글에서 못 찾아서 비어 있어요" : "")
      };
    });
    return { text: lines.map(function (r) { return new Array(r.level + 1).join(INDENT) + r.text; }).join("\n"), lines: lines };
  }

  function apply(templateText, incomingText) { return explain(templateText, incomingText).text; }

  CN.templateFill = { apply: apply, explain: explain };
  if (typeof module !== "undefined" && module.exports) module.exports = CN.templateFill;
})(typeof window !== "undefined" ? window : globalThis);
