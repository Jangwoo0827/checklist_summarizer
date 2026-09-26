const test = require("node:test");
const assert = require("node:assert/strict");

require("../js/util.js");
const parser = require("../js/parser.js");
const store = require("../js/store.js");

const levels = (text) => parser.parseText(text).map((l) => [l.text, l.level]);

test("markers set levels, including '3.독해' with no space after the period", () => {
  assert.deepEqual(levels("2. 문법\n1) 주교재\n3.독해\n1) 맵\n4. 듣기"), [
    ["2. 문법", 0], ["1) 주교재", 1], ["3.독해", 0], ["1) 맵", 1], ["4. 듣기", 0]
  ]);
});

test("leading tabs/4-spaces nest deeper than the marker alone", () => {
  assert.deepEqual(levels("3. 독해\n    1) 맵\n        1) 246~251 풀기\n\t\t2) 해석"), [
    ["3. 독해", 0], ["1) 맵", 1], ["1) 246~251 풀기", 2], ["2) 해석", 2]
  ]);
});

test("decimals are not mistaken for section numbers", () => {
  assert.deepEqual(levels("1) 준비물\n1.5킬로 사오기"), [["1) 준비물", 1], ["1.5킬로 사오기", 1]]);
});

test("linesToText round-trips through parseText", () => {
  const text = "3. 독해\n    1) 맵\n        1) 246~251 풀기\n4. 듣기";
  assert.equal(parser.linesToText(parser.parseText(text)), text);
});

test("remainingLines keeps unchecked leaves and their ancestors only", () => {
  const lines = parser.parseText("1. 문법\n1) 주교재\n2) 워크북\n2. 듣기\n1) 딕테이션");
  const checked = { [lines[1].id]: true, [lines[4].id]: true };
  const left = parser.remainingLines(lines, checked);
  assert.deepEqual(left.map((l) => [l.text, l.level]), [["1. 문법", 0], ["2) 워크북", 1]]);
  assert.ok(left.every((l, i) => l.id !== lines[i].id), "carried lines get fresh ids");
});

test("remapByText keeps checks on unchanged lines after an edit", () => {
  const before = parser.parseText("1. 문법\n2. 워크북");
  const after = parser.parseText("1. 문법\n2. 워크북 (수정)\n3. 새 항목");
  const remapped = parser.remapByText(before, after, { [before[0].id]: true, [before[1].id]: true });
  assert.deepEqual(Object.keys(remapped), [after[0].id]);
});

test("progress counts leaves only", () => {
  const lines = parser.parseText("1. 문법\n1) 주교재\n2) 워크북\n2. 듣기");
  assert.deepEqual(parser.progress(lines, { [lines[1].id]: true }), { done: 1, total: 3, pct: 33 });
});

test("mergeDocs keeps the newer copy of each list and honors tombstones", () => {
  const a = {
    lists: [{ id: "x", title: "old", updatedAt: 1, createdAt: 1 }, { id: "y", title: "local only", updatedAt: 5, createdAt: 2 }],
    deleted: {}
  };
  const b = {
    lists: [{ id: "x", title: "new", updatedAt: 9, createdAt: 1 }, { id: "z", title: "deleted elsewhere", updatedAt: 3, createdAt: 3 }],
    deleted: { z: 4 }
  };
  const merged = store.mergeDocs(a, b);
  assert.deepEqual(merged.lists.map((l) => [l.id, l.title]), [["x", "new"], ["y", "local only"]]);
  assert.deepEqual(merged.deleted, { z: 4 });
});

test("a list edited after its deletion survives the merge", () => {
  const merged = store.mergeDocs(
    { lists: [{ id: "x", updatedAt: 10, createdAt: 1 }], deleted: {} },
    { lists: [], deleted: { x: 5 } }
  );
  assert.deepEqual(merged.lists.map((l) => l.id), ["x"]);
});

test("docKey ignores key order (Postgres jsonb reorders keys)", () => {
  const one = { lists: [{ id: "a", title: "t", checked: { p: true, q: true } }], deleted: { z: 1 } };
  const two = { deleted: { z: 1 }, lists: [{ checked: { q: true, p: true }, title: "t", id: "a" }] };
  assert.equal(store.docKey(one), store.docKey(two));
});
