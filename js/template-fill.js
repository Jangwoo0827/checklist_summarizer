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
  //   2. Leftover blanks are filled with the leftover plain values (lines without a number), one per blank.
  //   3. Anything still unused is added at the end, numbered on from the template's last item.
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

  // Comparing names ignores spaces and colons: "낭독 :" == "낭독:" == "낭독".
  function key(text) { return text.replace(/[\s:：.\-]+/g, "").toLowerCase(); }

  // How many following items are children of items[i] (deeper than it).
  function childCount(items, i) {
    var n = 0;
    while (i + 1 + n < items.length && items[i + 1 + n].level > items[i].level) n++;
    return n;
  }

  function render(item, level) {
    return new Array(level + 1).join(INDENT) + (item.marker ? item.marker + " " : "") + item.body;
  }

  function apply(templateText, incomingText) {
    var tpl = parseItems(templateText);
    var inc = parseItems(incomingText);
    if (!tpl.length) return String(incomingText || "");
    if (!inc.length) return String(templateText || "");

    var used = inc.map(function () { return false; });
    var attached = tpl.map(function () { return []; });     // child lines to put under a template line
    var out = tpl.map(function (t) { return { level: t.level, marker: t.marker, body: t.body }; });

    function takeBlock(j) {          // marks item j and its children used, returns them
      var count = childCount(inc, j);
      var block = inc.slice(j, j + 1 + count);
      for (var k = j; k <= j + count; k++) used[k] = true;
      return block;
    }
    // Only plain values ("3,4") go into a blank; numbered items have a name of their own and wait for step 3.
    function nextUnused() {
      for (var j = 0; j < inc.length; j++) if (!used[j] && !inc[j].marker) return j;
      return -1;
    }
    function adopt(block, intoLevel, ti) {   // children of an incoming block go under template line ti
      var base = block[0].level;
      block.slice(1).forEach(function (child) {
        attached[ti].push({ level: Math.max(intoLevel + 1, child.level - base + intoLevel), marker: child.marker, body: child.body });
      });
    }

    // 1. same name
    tpl.forEach(function (t, ti) {
      var at = t.body.indexOf(BLANK);
      if (at < 0) return;
      var name = key(t.body.slice(0, at));
      if (!name) return;
      for (var j = 0; j < inc.length; j++) {
        if (used[j] || key(inc[j].body).indexOf(name) !== 0) continue;
        var block = takeBlock(j);
        out[ti].body = block[0].body;
        adopt(block, t.level, ti);
        return;
      }
    });

    // 2. leftover blanks, one leftover item each
    tpl.forEach(function (t, ti) {
      while (out[ti].body.indexOf(BLANK) >= 0) {
        var j = nextUnused();
        if (j < 0) return;
        var block = takeBlock(j);
        out[ti].body = out[ti].body.replace(BLANK, block[0].body);
        adopt(block, t.level, ti);
      }
    });

    // 3. whatever is left goes at the end, numbered on from the template's last top-level item
    var lines = [];
    out.forEach(function (item, ti) {
      lines.push(render(item, item.level));
      attached[ti].forEach(function (child) { lines.push(render(child, child.level)); });
    });
    var tail = [];
    for (var j = 0; j < inc.length; j++) if (!used[j]) tail.push(inc[j]);
    if (tail.length) {
      var lastTop = null;
      out.forEach(function (item) { if (item.level === 0 && item.marker) lastTop = item; });
      var next = lastTop ? markersApi().parseLine(lastTop.marker + " x").next : null;
      tail.forEach(function (item) {
        if (item.level === 0 && next) {
          lines.push(next + item.body);
          next = markersApi().parseLine(next + "x").next;
        } else {
          lines.push(render(item, item.level));
        }
      });
    }
    return lines.join("\n");
  }

  CN.templateFill = { apply: apply };
  if (typeof module !== "undefined" && module.exports) module.exports = CN.templateFill;
})(typeof window !== "undefined" ? window : globalThis);
