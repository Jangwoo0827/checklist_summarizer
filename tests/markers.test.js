const test = require("node:test");
const assert = require("node:assert/strict");

require("../js/util.js");
const parser = require("../js/parser.js");
const markers = require("../js/markers.js");

const defaults = (width) => (width === 0 ? "dot" : "paren");

test("every marker style can be previewed and read back", () => {
  const expected = {
    dot: "1. ", paren: "1) ", parens: "(1) ", dash: "1- ", under: "1_ ", space: "1 ",
    circle: "① ", letter: "a) ", bullet: "- ", bullet2: "• ", none: ""
  };
  markers.STYLES.forEach((s) => assert.equal(markers.sample(s.id), expected[s.id], s.id));
  markers.STYLES.filter((s) => s.re).forEach((s) => {
    const p = markers.parseLine(markers.sample(s.id) + "일지", () => s.id);
    assert.equal(p.rest, "일지", s.id);
    assert.equal(p.styleId, s.id);
  });
});

test("Enter continues the numbering of whatever style the line uses", () => {
  const next = (line, styleFor = defaults) => markers.parseLine(line, styleFor).next;
  assert.equal(next("2. 낭독"), "3. ");
  assert.equal(next("    1) 워크북"), "2) ");
  assert.equal(next("    (3) 일지"), "(4) ");
  assert.equal(next("    1- 일지"), "2- ");
  assert.equal(next("    1_ 일지"), "2_ ");
  assert.equal(next("    3 일지", () => "space"), "4 ");
  assert.equal(next("    ① 일지"), "② ");
  assert.equal(next("    a) 일지"), "b) ");
  assert.equal(next("    - 일지"), "- ");
});

test("a leading number is only a marker when the 'space' style is chosen", () => {
  assert.equal(markers.parseLine("100 문제 풀기", defaults).marker, "");
  assert.equal(markers.parseLine("100 문제 풀기", () => "space").marker, "100");
  assert.equal(markers.parseLine("1.5kg 사기", defaults).marker, "");
  assert.equal(markers.parseLine("3.독해", defaults).rest, "독해");
});

test("new lists start in the style chosen for their level", () => {
  const styleFor = (w) => ["dot", "dash", "circle"][Math.min(w / 4, 2)];
  assert.equal(markers.markerFor([""], 0, 0, styleFor), "1. ");
  assert.equal(markers.markerFor(["1. 영어", ""], 1, 4, styleFor), "1- ");
  assert.equal(markers.markerFor(["1. 영어", "    1- 단어", ""], 2, 8, styleFor), "① ");
  // siblings already there win: keep counting
  assert.equal(markers.markerFor(["1. 영어", "    1- 단어", "    2- 독해", ""], 3, 4, styleFor), "3- ");
  assert.equal(markers.markerFor(["1. 영어", "    1- 단어", "2. 수학", ""], 3, 4, styleFor), "1- ");
  // "none" means no marker at all
  assert.equal(markers.markerFor(["1. 영어", ""], 1, 4, () => "none"), "");
});

test("renumber fixes a reordered numbered group and leaves other groups alone", () => {
  assert.deepEqual(markers.renumber(["2. 낭독", "1. 단어 3,4", "3. 기출"]), ["1. 낭독", "2. 단어 3,4", "3. 기출"]);
  assert.deepEqual(markers.renumber(["2) 가", "1) 나"]), ["1) 가", "2) 나"]);
  assert.deepEqual(markers.renumber(["3.독해", "1.맵"]), ["1.독해", "2.맵"]);
  assert.deepEqual(markers.renumber(["b) 가", "a) 나"]), ["a) 가", "b) 나"]);
  assert.deepEqual(markers.renumber(["② 가", "① 나"]), ["① 가", "② 나"]);
  assert.equal(markers.renumber(["1. 가", "나"]), null);          // not every item is numbered
  assert.equal(markers.renumber(["1. 가", "2) 나"]), null);        // mixed styles
  assert.equal(markers.renumber(["- 가", "- 나"]), null);          // bullets have no numbers
  assert.equal(markers.renumber(["1. 가"]), null);
});

test("marker settings decide the level of unindented text, otherwise the defaults do", () => {
  const ids = ["paren", "dot", "paren"];
  const levels = (text) => parser.parseText(text, (l) => markers.levelOfMarker(l, ids)).map((l) => l.level);
  assert.deepEqual(levels("1) 영어\n1. 단어\n2. 독해\n2) 수학"), [0, 1, 1, 0]);
  // markers the settings don't mention fall back to the built-in table
  assert.deepEqual(parser.parseText("1. 문법\n1) 맵\na) 상세", (l) => markers.levelOfMarker(l, ["dot", "dash"])).map((l) => l.level), [0, 1, 2]);
  // and with no hook the behaviour is unchanged
  assert.deepEqual(parser.parseText("1. 문법\n1) 맵").map((l) => l.level), [0, 1]);
});

const L = (id, level) => ({ id, text: id, level });
const order = (r) => r.lines.map((l) => l.id).join(",");

test("moveSibling moves an item with its children and keeps the nesting", () => {
  const lines = [L("a", 0), L("a1", 1), L("a2", 1), L("b", 0), L("c", 0), L("c1", 1)];
  let r = parser.moveSibling(lines, "a", "c");
  assert.equal(order(r), "b,a,a1,a2,c,c1");
  assert.deepEqual(r.groupIds, ["b", "a", "c"]);
  assert.deepEqual(r.lines.map((l) => l.level), [0, 0, 1, 1, 0, 1]);
  r = parser.moveSibling(lines, "a", null);
  assert.equal(order(r), "b,c,c1,a,a1,a2");
  r = parser.moveSibling(lines, "c", "a");
  assert.equal(order(r), "c,c1,a,a1,a2,b");
  // only siblings are reordered, so a child stays inside its parent
  r = parser.moveSibling(lines, "a2", "a1");
  assert.equal(order(r), "a,a2,a1,b,c,c1");
  assert.deepEqual(r.groupIds, ["a2", "a1"]);
});

test("moveSibling does nothing for a no-op or unknown target, and keeps the original line objects", () => {
  const lines = [L("a", 0), L("b", 0), L("c", 0)];
  assert.equal(parser.moveSibling(lines, "a", "b"), null);   // already right before b
  assert.equal(parser.moveSibling(lines, "c", null), null);  // already last
  assert.equal(parser.moveSibling(lines, "a", "nope"), null);
  assert.equal(parser.moveSibling(lines, "nope", "a"), null);
  lines[1].extra = "kept";
  assert.equal(parser.moveSibling(lines, "a", null).lines[0].extra, "kept");
});

test("moveSibling handles levels that skip a step, like the tree builder does", () => {
  const lines = [L("a", 0), L("a1", 2), L("a2", 1), L("b", 0)];
  const r = parser.moveSibling(lines, "a1", null);
  assert.equal(order(r), "a,a2,a1,b");
  assert.deepEqual(r.lines.map((l) => l.level), [0, 1, 2, 0]);
});
