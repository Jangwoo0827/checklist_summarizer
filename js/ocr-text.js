(function (root) {
  "use strict";
  var CN = root.CN = root.CN || {};

  // Turns raw OCR text from one column of a homework photo into the editor's list format:
  // "N." items at the left, "N)" sub-items indented 4 spaces, wrapped lines joined back.
  var CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
  var TOP = /^\d{1,2}\s*\.(?!\d)\s*/;
  // Sub-item markers, including how OCR tends to misread a circled number: "1)", "(1)", "1°", "1 본책".
  var SUB = /^(?:\((\d{1,2})\)|(\d{1,2})\s*[)°º]|(\d)\s(?=[^\d\s.,~:]))\s*/;

  function normalize(line) {
    var out = "";
    for (var i = 0; i < line.length; i++) {
      var k = CIRCLED.indexOf(line[i]);
      out += k >= 0 ? (k + 1) + ") " : line[i];
    }
    return out
      .replace(/[：︰]/g, ":").replace(/[，]/g, ",").replace(/[（]/g, "(").replace(/[）]/g, ")")
      .replace(/\s+/g, " ").replace(/\s+([:,])/g, "$1").trim();
  }

  // OCR noise: stray one-letter lines and leftover punctuation / table borders.
  function isNoise(line) {
    var meaningful = line.replace(/[^0-9A-Za-z가-힣]/g, "");
    return meaningful.length <= 1;
  }

  function clean(raw) {
    var lines = String(raw || "").split(/\r?\n/).map(normalize).filter(function (l) { return l && !isNoise(l); });

    // Skip headers (times, class names) above the first numbered item, when there is one.
    var first = -1;
    for (var i = 0; i < lines.length; i++) {
      if (TOP.test(lines[i])) { first = i; break; }
    }
    if (first > 0) lines = lines.slice(first);

    var out = [];
    var lastKind = null; // "top" | "sub" | null
    lines.forEach(function (line) {
      if (TOP.test(line)) {
        out.push(line.replace(TOP, function (m) { return m.replace(/\s+/g, "").replace(".", ". "); }));
        lastKind = "top";
      } else if (SUB.test(line)) {
        out.push("    " + line.replace(SUB, function (m, a, b, c) { return (a || b || c) + ") "; }));
        lastKind = "sub";
      } else if (lastKind === "top" && !/:$/.test(out[out.length - 1])) {
        out[out.length - 1] += " " + line; // a wrapped top-level line
      } else if (lastKind) {
        out.push("    " + line);
      } else {
        out.push(line);
      }
    });
    return out.join("\n");
  }

  CN.ocrText = { clean: clean };
  if (typeof module !== "undefined" && module.exports) module.exports = CN.ocrText;
})(typeof window !== "undefined" ? window : globalThis);
