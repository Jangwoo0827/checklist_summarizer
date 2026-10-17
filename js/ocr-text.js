(function (root) {
  "use strict";
  var CN = root.CN = root.CN || {};

  // Turns OCR output for one column of a homework photo into the editor's list format:
  // "N." items at the left, "N)" sub-items indented 4 spaces per level.
  //
  // Input is either plain text, or lines with positions from Tesseract
  // ({ text, x0, x1, h, first: { text, x0, x1 } }) plus the column width. Positions let it tell
  // a wrapped line from a new item and spot indentation and circled numbers (①) that OCR misreads.
  var CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
  var TOP = /^\d{1,2}\s*\.(?!\d)\s*/;
  // Sub-item markers, including how OCR tends to misread a circled number: "1)", "(1)", "1°", "1 본책".
  var SUB = /^(?:\((\d{1,2})\)|(\d{1,2})\s*[)°º]|(\d)\s(?=[^\d\s.,~:]))\s*/;
  // "409p 워크북" is often read as "4096 워크북": a 3-digit page number whose "p" became a digit.
  var PAGE = /(^|[^\d.,])(\d{3})[6179](?=\s*(?:까지|부터|워크북|본책|풀기|~|-|,|$))/g;

  function normalize(line) {
    var out = "";
    for (var i = 0; i < line.length; i++) {
      var k = CIRCLED.indexOf(line[i]);
      out += k >= 0 ? (k + 1) + ") " : line[i];
    }
    return out
      .replace(/[：︰]/g, ":").replace(/[，]/g, ",").replace(/[（]/g, "(").replace(/[）]/g, ")")
      .replace(/\s+/g, " ").replace(/\s+([:,])/g, "$1")
      .replace(PAGE, "$1$2p")
      .trim();
  }

  function meaningful(text) { return text.replace(/[^0-9A-Za-z가-힣]/g, "").length; }

  function toItems(input) {
    if (Array.isArray(input)) return input.slice();
    return String(input || "").split(/\r?\n/).map(function (t) { return { text: t }; });
  }

  // A printed ① is a roughly square glyph at the start of the line that OCR turns into "0)", "TEX", "ㄱ:"…
  function circledMarker(item, base) {
    var f = item.first;
    if (!f || !item.h || TOP.test(item.text) || item.x0 > base + item.h * 0.5) return false;
    // A real Korean word ("해설지" starts with a square-looking "해") is not a marker.
    if (/[가-힣]/.test(f.text) && !/[):°º]/.test(f.text)) return false;
    var w = f.x1 - f.x0;
    var rest = item.text.slice(f.text.length).trim();
    return rest && w > item.h * 0.7 && w < item.h * 1.4 && meaningful(f.text) <= 3 && !/[가-힣]{2}/.test(f.text);
  }

  function clean(input, width) {
    var items = toItems(input);
    var hasGeo = items.some(function (it) { return it.h; });

    // Skip headers (times, class names) above the first numbered item, when there is one.
    var first = -1;
    for (var i = 0; i < items.length; i++) {
      if (TOP.test(normalize(items[i].text))) { first = i; break; }
    }
    if (first > 0) items = items.slice(first);

    var tops = items.filter(function (it) { return it.h && TOP.test(normalize(it.text)); });
    var base = tops.length ? Math.min.apply(null, tops.map(function (it) { return it.x0; }))
      : Math.min.apply(null, items.filter(function (it) { return it.h; }).map(function (it) { return it.x0; }).concat([0]));

    var out = [];         // { text, level, item }
    var subCount = 0;
    items.forEach(function (it) {
      var prev = out[out.length - 1];
      var wrapped = !!(prev && hasGeo && width && prev.item.x1 > width - prev.item.h * 1.6);
      var text = it.text;
      var circled = hasGeo && circledMarker(it, base);
      if (circled) text = text.slice(it.first.text.length);
      text = normalize(text);
      if (!text) return;
      // Stray one-letter lines are noise, unless they finish a word that wrapped ("14오" + "답").
      if (meaningful(text) <= 1 && !(wrapped && /^[가-힣A-Za-z0-9]+$/.test(text) && it.x0 < base + it.h)) return;

      if (TOP.test(text)) {
        subCount = 0;
        out.push({ text: text.replace(TOP, function (m) { return m.replace(/\s+/g, "").replace(".", ". "); }), level: 0, item: it });
        return;
      }
      var sub = SUB.exec(text);
      if (circled || sub) {
        subCount++;
        var n = circled ? subCount : Number(sub[1] || sub[2] || sub[3]) || subCount;
        if (sub) text = text.slice(sub[0].length);
        var level = prev ? Math.min(prev.level + 1, Math.max(1, prev.level)) : 1;
        if (prev && prev.level === 0) level = 1;
        out.push({ text: n + ") " + text, level: level, item: it });
        return;
      }
      if (!prev) { out.push({ text: text, level: 0, item: it }); return; }

      var endsColon = /:$/.test(prev.text);
      if (!hasGeo) {
        // Without positions: a line after "…:" or after a sub-item is a sub-item, otherwise a wrapped line.
        if (prev.level === 0 && !endsColon) prev.text += " " + text;
        else out.push({ text: text, level: endsColon ? prev.level + 1 : prev.level, item: it });
        return;
      }
      if (wrapped && !endsColon) {
        // Korean wraps mid-word in these tables, so glue short tails on without a space.
        prev.text += (text.length <= 2 ? "" : " ") + text;
        prev.item = it;
        return;
      }
      var indent = it.x0 - base;
      var textStart = (prev.item.first && prev.text !== prev.item.text) ? prev.item.first.x1 : prev.item.x0;
      if (endsColon || it.x0 > textStart + it.h) {
        out.push({ text: text, level: prev.level + 1, item: it });
      } else if (indent > it.h * 0.8) {
        // Hanging indent under the previous item's text: the same item, continued.
        prev.text += " " + text;
        prev.item = it;
      } else {
        out.push({ text: text, level: 0, item: it });
      }
    });

    return out.map(function (o) { return new Array(o.level + 1).join("    ") + o.text; }).join("\n");
  }

  CN.ocrText = { clean: clean };
  if (typeof module !== "undefined" && module.exports) module.exports = CN.ocrText;
})(typeof window !== "undefined" ? window : globalThis);
