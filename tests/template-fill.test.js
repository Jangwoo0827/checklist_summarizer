const test = require("node:test");
const assert = require("node:assert/strict");

require("../js/util.js");
require("../js/markers.js");
const fill = require("../js/template-fill.js");

// What the academy page gives for one class (already in list format).
const HOMEWORK = [
  "1. 단어 3,4",
  "2. 낭독: 37회 선행 16일 금요일 밤까지",
  "3. 기출로 적중 해커스 중학 영문법 3학년:",
  "    1) 본책 409p 워크북 212p 까지",
  "    해설지 보고 오답",
  "4. Reading: Reading Expert 유닛 14오답",
  "5. TOEFL listening:",
  "    1) 106,107p 딕테이션 수정"
].join("\n");

test("items with the same name replace the template's blanks, children included", () => {
  const template = "1. 단어 ___\n2. 낭독: ___회 선행\n3. 기출 ___\n4. Reading ___\n5. TOEFL listening ___";
  assert.equal(fill.apply(template, HOMEWORK), HOMEWORK);
});

test("the template decides the order, whatever order the page used", () => {
  const template = "1. Reading ___\n2. 단어 ___";
  const out = fill.apply(template, "1. 단어 3,4\n2. Reading: Expert 유닛 14\n3. 낭독: 37회");
  assert.equal(out, "1. Reading: Expert 유닛 14\n2. 단어 3,4\n3. 낭독: 37회");
});

test("a template line without a match keeps its blank for the user to fill", () => {
  const out = fill.apply("1. 단어 ___\n2. 영작 ___", "1. 단어 3,4");
  assert.equal(out, "1. 단어 3,4\n2. 영작 ___");
});

test("lines without blanks stay exactly as they are", () => {
  const out = fill.apply("1. 준비물 확인\n2. 단어 ___", "1. 단어 5,6");
  assert.equal(out, "1. 준비물 확인\n2. 단어 5,6");
});

test("leftover blanks are filled in order by the leftover items", () => {
  const out = fill.apply("1. 영어 ___\n2. 수학 ___", "3,4\n10쪽");
  assert.equal(out, "1. 영어 3,4\n2. 수학 10쪽");
  assert.equal(fill.apply("1. ___ 과 ___", "국어\n수학"), "1. 국어 과 수학");
});

test("items nobody asked for are added at the end, numbered on from the template", () => {
  const out = fill.apply("1. 단어 ___\n2. 낭독 ___", "1. 단어 3,4\n2. 낭독: 37회\n3. 기출: 영문법\n4. TOEFL: 106p");
  assert.equal(out, "1. 단어 3,4\n2. 낭독: 37회\n3. 기출: 영문법\n4. TOEFL: 106p");
  const shifted = fill.apply("1. 단어 ___", "1. 낭독: 37회\n2. 기출: 영문법");
  assert.equal(shifted, "1. 단어 ___\n2. 낭독: 37회\n3. 기출: 영문법");
});

test("children keep their nesting when they move under a template line", () => {
  const out = fill.apply("1. 영어\n    1) 기출 ___", "1. 기출: 영문법\n    1) 본책 409p\n    2) 워크북 212p");
  assert.equal(out, "1. 영어\n    1) 기출: 영문법\n        1) 본책 409p\n        2) 워크북 212p");
});

test("empty input falls back sensibly", () => {
  assert.equal(fill.apply("1. 단어 ___", ""), "1. 단어 ___");
  assert.equal(fill.apply("", "1. 단어 3,4"), "1. 단어 3,4");
});

test("a numbered item never fills another item's blank", () => {
  assert.equal(fill.apply("1. 단어 ___", "1. 낭독: 37회"), "1. 단어 ___\n2. 낭독: 37회");
  assert.equal(fill.apply("1. 단어 ___\n2. 낭독 ___", "3,4\n2. 낭독: 37회"), "1. 단어 3,4\n2. 낭독: 37회");
});

// ---- a slot that needs more lines than the template has ----

test("a template with one 기출 line grows when the page has two, right below it", () => {
  const template = "1. 단어 ___\n2. 기출 ___\n3. Reading ___";
  const incoming = "1. 단어 3,4\n2. 기출: 문법 3학년\n3. 기출: 어휘 2학년\n4. Reading: Expert 유닛 14";
  assert.equal(fill.apply(template, incoming), [
    "1. 단어 3,4",
    "2. 기출: 문법 3학년",
    "3. 기출: 어휘 2학년",       // the extra line stays inside the format, not at the bottom
    "4. Reading: Expert 유닛 14" // and later lines were renumbered
  ].join("\n"));
});

test("extra lines keep their children and the template's numbering style", () => {
  const out = fill.apply("1) 기출 ___\n2) 단어 ___", "1. 기출: A\n    1) 본책 409p\n2. 기출: B\n    1) 워크북 212p\n3. 단어: 3,4");
  assert.equal(out, "1) 기출: A\n    1) 본책 409p\n2) 기출: B\n    1) 워크북 212p\n3) 단어: 3,4");
});

test("more plain values than blanks become sub-items of the last filled line", () => {
  assert.equal(fill.apply("1. 영어 ___", "A\nB\nC"), "1. 영어 A\n    B\n    C");
  assert.equal(fill.apply("1. 영어 ___\n2. 수학 ___", "A\nB\nC\nD"), "1. 영어 A\n2. 수학 B\n    C\n    D");
});

test("a nested slot grows at its own level", () => {
  const out = fill.apply("1. 영어\n    1) 기출 ___\n2. 수학 ___", "1. 기출: A\n2. 기출: B\n3. 수학: C");
  assert.equal(out, "1. 영어\n    1) 기출: A\n    2) 기출: B\n2. 수학: C");
});

// ---- the preview needs to know what happened to each line ----

test("explain() reports what happened to every line", () => {
  const r = fill.explain("1. 준비물 확인\n2. 단어 ___\n3. 영작 ___\n4. 기출 ___", "1. 단어 3,4\n2. 기출: A\n3. 기출: B\n4. TOEFL: 106p");
  assert.equal(r.text, "1. 준비물 확인\n2. 단어 3,4\n3. 영작 ___\n4. 기출: A\n5. 기출: B\n6. TOEFL: 106p");
  assert.deepEqual(r.lines.map((l) => l.kind), ["kept", "filled", "blank", "filled", "inserted", "inserted"]);
  assert.match(r.lines[1].note, /단어/);                 // which slot it went into
  assert.match(r.lines[2].note, /비어/);                 // why it is still blank
  assert.match(r.lines[4].note, /기출.*아래/);           // the extra 기출 line says where and why
  assert.match(r.lines[5].note, /맨 아래/);              // nothing matched TOEFL
  assert.deepEqual(r.lines.map((l) => l.level), [0, 0, 0, 0, 0, 0]);
});

test("explain() text equals apply() text, and sub-items are marked as part of their parent", () => {
  const t = "1. 단어 ___\n2. 기출 ___";
  const i = "1. 단어 3,4\n2. 기출: 영문법\n    1) 본책 409p";
  const r = fill.explain(t, i);
  assert.equal(r.text, fill.apply(t, i));
  assert.deepEqual(r.lines.map((l) => [l.level, l.kind]), [[0, "filled"], [0, "filled"], [1, "filled"]]);
});
