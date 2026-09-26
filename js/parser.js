(function (root) {
  "use strict";
  var CN = root.CN = root.CN || {};
  var util = CN.util;

  function detectMarkerLevel(line, prevLevel) {
    if (/^\d+[.)]\s*\d*[.)]\s*/.test(line)) return 0; // safety, unlikely
    if (/^\d+\.(?!\d)\s*/.test(line)) return 0;
    if (/^\(\d+\)\s*/.test(line)) return 1;
    if (/^\d+\)\s*/.test(line)) return 1;
    if (/^[a-zA-Z]\)\s*/.test(line)) return 2;
    if (/^[-•‣▪●·]\s*/.test(line)) return prevLevel >= 0 ? prevLevel : 0;
    return prevLevel >= 0 ? prevLevel : 0;
  }

  // Leading tabs/spaces (Tab = 1 level, every 4 spaces = 1 level) promote an
  // item deeper than its marker alone would imply — never shallower.
  function leadingIndentLevel(rawLine) {
    var lead = rawLine.match(/^[ \t]*/)[0];
    var tabCount = (lead.match(/\t/g) || []).length;
    var spaceCount = (lead.match(/ /g) || []).length;
    return tabCount + Math.floor(spaceCount / 4);
  }

  function parseText(text) {
    var rawLines = text.split("\n");
    var flat = [];
    var prevLevel = -1;
    for (var i = 0; i < rawLines.length; i++) {
      var raw = rawLines[i];
      var line = raw.trim();
      if (!line) continue;
      var wsLevel = leadingIndentLevel(raw);
      var markerLevel = detectMarkerLevel(line, prevLevel);
      var level = Math.max(wsLevel, markerLevel);
      flat.push({ id: util.uid(), text: line, level: level });
      prevLevel = level;
    }
    return flat;
  }

  function linesToText(lines) {
    return lines.map(function (l) {
      return new Array(l.level + 1).join("    ") + l.text;
    }).join("\n");
  }

  function buildTree(flat) {
    var root = { children: [] };
    var stack = [{ node: root, level: -1 }];
    for (var i = 0; i < flat.length; i++) {
      var item = flat[i];
      var node = { id: item.id, text: item.text, children: [] };
      while (stack[stack.length - 1].level >= item.level) stack.pop();
      stack[stack.length - 1].node.children.push(node);
      stack.push({ node: node, level: item.level });
    }
    return root.children;
  }

  function collectLeafIds(node, out) {
    if (node.children.length === 0) { out.push(node.id); return out; }
    for (var i = 0; i < node.children.length; i++) collectLeafIds(node.children[i], out);
    return out;
  }

  function leafIdsOf(lines) {
    var tree = buildTree(lines);
    var leaves = [];
    for (var i = 0; i < tree.length; i++) collectLeafIds(tree[i], leaves);
    return leaves;
  }

  function nodeState(node, checked) {
    var leaves = collectLeafIds(node, []);
    var done = 0;
    for (var i = 0; i < leaves.length; i++) if (checked[leaves[i]]) done++;
    if (done === 0) return "false";
    if (done === leaves.length) return "true";
    return "mixed";
  }

  function progress(lines, checked) {
    var leaves = leafIdsOf(lines);
    var done = 0;
    for (var i = 0; i < leaves.length; i++) if (checked[leaves[i]]) done++;
    var total = leaves.length;
    return { done: done, total: total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
  }

  function unfinishedLeafTexts(lines, checked, limit) {
    var leafSet = {};
    leafIdsOf(lines).forEach(function (id) { leafSet[id] = true; });
    var out = [];
    for (var i = 0; i < lines.length && out.length < limit; i++) {
      if (leafSet[lines[i].id] && !checked[lines[i].id]) out.push(lines[i].text);
    }
    return out;
  }

  // Unchecked leaves plus every ancestor they need for context, as fresh lines.
  function remainingLines(lines, checked) {
    var keep = {};
    function walk(node) {
      if (node.children.length === 0) {
        if (!checked[node.id]) keep[node.id] = true;
        return !!keep[node.id];
      }
      var any = false;
      for (var i = 0; i < node.children.length; i++) if (walk(node.children[i])) any = true;
      if (any) keep[node.id] = true;
      return any;
    }
    buildTree(lines).forEach(walk);
    return lines.filter(function (l) { return keep[l.id]; }).map(function (l) {
      return { id: util.uid(), text: l.text, level: l.level };
    });
  }

  // Carries per-line flags (checked, collapsed) across a re-parse by matching unchanged text.
  function remapByText(oldLines, newLines, oldFlags) {
    var oldIdByText = {};
    oldLines.forEach(function (l) { oldIdByText[l.text] = l.id; });
    var out = {};
    newLines.forEach(function (nl) {
      var oldId = oldIdByText[nl.text];
      if (oldId && oldFlags[oldId]) out[nl.id] = true;
    });
    return out;
  }

  CN.parser = {
    parseText: parseText,
    linesToText: linesToText,
    buildTree: buildTree,
    collectLeafIds: collectLeafIds,
    nodeState: nodeState,
    progress: progress,
    unfinishedLeafTexts: unfinishedLeafTexts,
    remainingLines: remainingLines,
    remapByText: remapByText
  };
  if (typeof module !== "undefined" && module.exports) module.exports = CN.parser;
})(typeof window !== "undefined" ? window : globalThis);
