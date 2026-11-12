(function (root) {
  "use strict";
  var CN = root.CN = root.CN || {};

  // List marker styles used when Tab/Enter create or re-mark items in the editor.
  // Each style knows how to recognise its marker at the start of a line (re, anchored, the whole
  // match is the marker token without its trailing space), how to read its number and how to make
  // the token for number n. Stored item text keeps its marker, so these only shape what is typed.
  var CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
  var NUM = "(\\d{1,4})";

  function numbered(id, label, re, make) {
    return {
      id: id,
      label: label,
      re: re,
      numbered: true,
      value: function (m) { return Number(m[1]); },
      make: make,
      next: function (m) { return make(Number(m[1]) + 1); }
    };
  }

  var STYLES = [
    numbered("dot", "1.", new RegExp("^" + NUM + "\\.(?!\\d)"), function (n) { return n + "."; }),
    numbered("paren", "1)", new RegExp("^" + NUM + "\\)"), function (n) { return n + ")"; }),
    numbered("parens", "(1)", new RegExp("^\\(" + NUM + "\\)"), function (n) { return "(" + n + ")"; }),
    numbered("dash", "1-", new RegExp("^" + NUM + "-(?=\\s|$)"), function (n) { return n + "-"; }),
    numbered("under", "1_", new RegExp("^" + NUM + "_(?=\\s|$)"), function (n) { return n + "_"; }),
    numbered("space", "1", new RegExp("^" + NUM + "(?=[ \\t])"), function (n) { return String(n); }),
    {
      id: "circle", label: "①", re: new RegExp("^([" + CIRCLED + "])"), numbered: true,
      value: function (m) { return CIRCLED.indexOf(m[1]) + 1; },
      make: function (n) { return n >= 1 && n <= CIRCLED.length ? CIRCLED.charAt(n - 1) : n + ")"; },
      next: function (m) { return this.make(CIRCLED.indexOf(m[1]) + 2); }
    },
    {
      id: "letter", label: "a)", re: /^([a-zA-Z])\)/, numbered: true,
      value: function (m) { return m[1].toLowerCase().charCodeAt(0) - 96; },
      make: function (n, sample) {
        var upper = sample && /[A-Z]/.test(sample.charAt(0));
        var ch = String.fromCharCode(96 + Math.min(Math.max(n, 1), 26));
        return (upper ? ch.toUpperCase() : ch) + ")";
      },
      next: function (m) { return this.make(this.value(m) + 1, m[1]); }
    },
    {
      id: "bullet", label: "-", re: /^(-)(?=[ \t])/, numbered: false,
      value: function () { return null; },
      make: function () { return "-"; },
      next: function (m) { return m[1]; }
    },
    {
      id: "bullet2", label: "•", re: /^(•)(?=[ \t])/, numbered: false,
      value: function () { return null; },
      make: function () { return "•"; },
      next: function (m) { return m[1]; }
    },
    { id: "none", label: "", re: null, numbered: false, make: function () { return ""; } }
  ];

  var byId = {};
  STYLES.forEach(function (s) { byId[s.id] = s; });

  // "1 일지" is only a marker where the user chose it: a plain "100 문제 풀기" must not become a list.
  var GENERIC = STYLES.filter(function (s) { return s.re && s.id !== "space"; });

  function style(id) { return byId[id] || byId.dot; }

  // A sample line for menus and previews, e.g. "1) 일지".
  function sample(id, n) {
    var s = style(id);
    return s.id === "none" ? "" : s.make(n || 1) + " ";
  }

  function indentWidth(indent) { return indent.replace(/\t/g, "    ").length; }

  // Matches a style at the start of `body`, trying `firstId` first. Returns { style, m, token } or null.
  function matchMarker(body, firstId) {
    var order = GENERIC;
    var first = firstId && byId[firstId];
    if (first && first.re) order = [first].concat(GENERIC.filter(function (s) { return s !== first; }));
    for (var i = 0; i < order.length; i++) {
      var m = body.match(order[i].re);
      if (m) return { style: order[i], m: m, token: m[0] };
    }
    return null;
  }

  // Splits a line into indent, list marker and content. `styleFor(width)` gives the style id the
  // user configured for a line indented `width` columns. Decimals like "1.5kg" are not markers.
  function parseLine(line, styleFor) {
    var m = line.match(/^([ \t]*)(.*)$/);
    var indent = m[1];
    var body = m[2];
    var own = styleFor ? styleFor(indentWidth(indent)) : null;
    var hit = matchMarker(body, own);
    if (!hit && own === "space") {
      var sm = body.match(byId.space.re);
      if (sm) hit = { style: byId.space, m: sm, token: sm[0] };
    }
    if (!hit) return { indent: indent, marker: "", rest: body, next: "", styleId: null };
    return {
      indent: indent,
      marker: hit.token,
      rest: body.slice(hit.token.length).replace(/^[ \t]*/, ""),
      next: hit.style.next(hit.m) + " ",
      styleId: hit.style.id
    };
  }

  // The marker (with trailing space) for a new item at `width` after the lines above it: continue
  // the nearest sibling's numbering, or start a list in the style chosen for that level.
  function markerFor(lines, index, width, styleFor) {
    for (var i = index - 1; i >= 0; i--) {
      var p = parseLine(lines[i], styleFor);
      if (!p.marker && !p.rest) continue;
      var w = indentWidth(p.indent);
      if (w < width) break;
      if (w === width && p.marker) return p.next;
    }
    return sample(styleFor ? styleFor(width) : width === 0 ? "dot" : "paren", 1);
  }

  // Renumbers items that all carry the same numbered marker (3. 1. 2. -> 1. 2. 3.).
  // Returns the new texts, or null when the group isn't a plain numbered list.
  function renumber(texts) {
    if (texts.length < 2) return null;
    var hits = [];
    var styleId = null;
    for (var i = 0; i < texts.length; i++) {
      var hit = matchMarker(texts[i], null);
      if (!hit || !hit.style.numbered) return null;
      if (styleId && hit.style.id !== styleId) return null;
      styleId = hit.style.id;
      hits.push(hit);
    }
    return texts.map(function (text, i) {
      return hits[i].style.make(i + 1, hits[i].token) + text.slice(hits[i].token.length);
    });
  }

  // Which configured level a marker belongs to, for text that has no indentation to go by.
  // `styleIds` are the style ids chosen per level. Returns -1 when the marker matches none of them.
  function levelOfMarker(line, styleIds) {
    var hit = matchMarker(line, null);
    if (!hit) return -1;
    for (var i = 0; i < styleIds.length; i++) if (styleIds[i] === hit.style.id) return i;
    return -1;
  }

  CN.markers = {
    STYLES: STYLES,
    style: style,
    sample: sample,
    indentWidth: indentWidth,
    parseLine: parseLine,
    markerFor: markerFor,
    renumber: renumber,
    levelOfMarker: levelOfMarker
  };
  if (typeof module !== "undefined" && module.exports) module.exports = CN.markers;
})(typeof window !== "undefined" ? window : globalThis);
