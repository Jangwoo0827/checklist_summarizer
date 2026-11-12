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

const ocrText = require("../js/ocr-text.js");

test("OCR cleanup drops headers and noise, indents sub-items, joins wrapped lines", () => {
  const raw = [
    "BNET CMM OS", "5:00~7:30", "22B", "", "1. 단어 3,4", "",
    "2. 낭독 : 37회 선행 16일 금요일 밤까지", "3. 기출로 적중 해커스 중학 영문법 3학년 ：",
    "① 본책 409p 워크북 212p 까지", "", "해설지 보고 오답", "",
    "4. Reading : Reading Expert 유닛 14오", "답", "", "브", "", "5. TOEFL listening :"
  ].join("\n");
  assert.equal(ocrText.clean(raw), [
    "1. 단어 3,4",
    "2. 낭독: 37회 선행 16일 금요일 밤까지",
    "3. 기출로 적중 해커스 중학 영문법 3학년:",
    "    1) 본책 409p 워크북 212p 까지",
    "    해설지 보고 오답",
    "4. Reading: Reading Expert 유닛 14오",
    "5. TOEFL listening:"
  ].join("\n"));
});

test("OCR misreads of circled numbers still become sub-items", () => {
  assert.equal(ocrText.clean("3. 영문법\n1 본책 409p\n1° 106,107p 수정\n(2) 해설"),
    "3. 영문법\n    1) 본책 409p\n    1) 106,107p 수정\n    2) 해설");
});

test("OCR positions: circled numbers, page-number fixes, hanging indents and wrapped words", () => {
  const L = (x0, x1, h, text, fw) => ({ x0, x1, h, text, first: { text: text.split(" ")[0], x0, x1: x0 + fw } });
  const lines = [
    L(360, 630, 45, "5:00~7:30", 270), L(442, 548, 45, "22B", 106),
    L(28, 274, 53, "1. 단어 3,4", 36),
    L(25, 945, 49, "3. 기출로 적중 해커스 중학 영문법 3학년", 39),
    L(25, 762, 57, "0) 본책 4096 워크북 2121 까지", 49),
    L(87, 467, 49, "해 설지 보고 오답", 42),
    L(23, 955, 57, "4. Reading : Reading Expert 유닛 14오", 41),
    L(27, 72, 26, "답", 45), L(32, 64, 20, "=", 32),
    L(25, 516, 51, "5. TOEFL listening :", 39),
    L(25, 600, 50, "그) 106,107p 딕테이션 수정", 49)
  ];
  assert.equal(ocrText.clean(lines, 984), [
    "1. 단어 3,4",
    "3. 기출로 적중 해커스 중학 영문법 3학년",
    "    1) 본책 409p 워크북 212p 까지 해 설지 보고 오답",
    "4. Reading: Reading Expert 유닛 14오답",
    "5. TOEFL listening:",
    "    1) 106,107p 딕테이션 수정"
  ].join("\n"));
});

test("templates merge like lists: newest wins, tombstones win over older copies", () => {
  const merged = store.mergeDocs(
    { lists: [], templates: [{ id: "t1", name: "old", updatedAt: 1, createdAt: 1 }, { id: "t2", name: "gone", updatedAt: 2, createdAt: 2 }], deleted: {} },
    { lists: [], templates: [{ id: "t1", name: "new", updatedAt: 5, createdAt: 1 }], deleted: { t2: 9 } }
  );
  assert.deepEqual(merged.templates.map((t) => [t.id, t.name]), [["t1", "new"]]);
});

test("a document from before templates existed merges and compares cleanly", () => {
  const old = { lists: [{ id: "a", updatedAt: 1, createdAt: 1 }], deleted: {} };
  const merged = store.mergeDocs(old, { lists: [], templates: [{ id: "t", name: "n", updatedAt: 1, createdAt: 1 }], deleted: {} });
  assert.equal(merged.templates.length, 1);
  assert.equal(store.docKey(old), store.docKey({ lists: old.lists, templates: [], deleted: {} }));
});

test("settings sync: the newest copy wins, and a missing copy never erases the other", () => {
  const older = { markers: ["dot", "paren", "paren"], renumber: true, updatedAt: 5 };
  const newer = { markers: ["dash", "paren", "circle"], renumber: false, updatedAt: 9 };
  assert.deepEqual(store.mergeDocs({ lists: [], settings: older, deleted: {} }, { lists: [], settings: newer, deleted: {} }).settings, newer);
  assert.deepEqual(store.mergeDocs({ lists: [], settings: newer, deleted: {} }, { lists: [], settings: older, deleted: {} }).settings, newer);
  assert.deepEqual(store.mergeDocs({ lists: [], settings: older, deleted: {} }, { lists: [], deleted: {} }).settings, older);
  assert.deepEqual(store.mergeDocs({ lists: [], deleted: {} }, { lists: [], settings: newer, deleted: {} }).settings, newer);
  assert.equal(store.mergeDocs({ lists: [], deleted: {} }, { lists: [], deleted: {} }).settings, null);
  // settings saved before sync existed have no updatedAt and lose to a stamped copy
  const legacy = { markers: ["paren", "paren", "paren"], renumber: true };
  assert.deepEqual(store.mergeDocs({ lists: [], settings: legacy, deleted: {} }, { lists: [], settings: older, deleted: {} }).settings, older);
});

test("docKey notices a settings change but treats 'no settings' consistently", () => {
  const base = { lists: [], templates: [], deleted: {} };
  assert.notEqual(store.docKey(base), store.docKey({ ...base, settings: { markers: ["dot"], renumber: true, updatedAt: 1 } }));
  assert.equal(store.docKey(base), store.docKey({ ...base, settings: null }));
  assert.equal(store.docKey({ lists: [], deleted: {} }), store.docKey(base));
});

test("a list keeps its memo through a merge", () => {
  const merged = store.mergeDocs(
    { lists: [{ id: "x", note: "old", updatedAt: 1, createdAt: 1 }], deleted: {} },
    { lists: [{ id: "x", note: "준비물: 공책\n두 번째 줄", updatedAt: 9, createdAt: 1 }], deleted: {} }
  );
  assert.equal(merged.lists[0].note, "준비물: 공책\n두 번째 줄");
});
