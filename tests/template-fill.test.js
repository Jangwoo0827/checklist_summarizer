const test = require("node:test");
const assert = require("node:assert/strict");

require("../js/util.js");
require("../js/markers.js");
const fill = require("../js/template-fill.js");

// What the academy page gives (already in list format).
const HOMEWORK = [
  "1. 단어 3,4",
  "2. 낭독: 37회 선행 16일 금요일 밤까지",
  "3. 기출로 적중 해커스 중학 영문법 3학년:",
  "    1) 본책 409p 워크북 212p 까지",
  "    해설지 보고 오답",
  "4. Reading: Reading Expert 유닛 14오답"
].join("\n");

test("items fill the blanks one by one, in order", () => {
  const out = fill.apply("1. 단어 ___\n2. 낭독 ___\n3. 기출 ___\n4. Reading ___", HOMEWORK);
  assert.equal(out, [
    "1. 단어 단어 3,4",                                    // the item's own text goes in, name and all
    "2. 낭독 낭독: 37회 선행 16일 금요일 밤까지",
    "3. 기출 기출로 적중 해커스 중학 영문법 3학년:",
    "    1) 본책 409p 워크북 212p 까지",
    "    해설지 보고 오답",
    "4. Reading Reading: Reading Expert 유닛 14오답"
  ].join("\n"));
});

test("a template written for plain values gets exactly what it asks for", () => {
  assert.equal(fill.apply("1. 단어 ___\n2. 낭독 ___\n3. 기출 ___", "3,4\n37회 선행\n영문법 3학년"),
    "1. 단어 3,4\n2. 낭독 37회 선행\n3. 기출 영문법 3학년");
});

test("order matters, names do not: the first item goes into the first blank whatever it says", () => {
  assert.equal(fill.apply("1. 영작 ___\n2. 단어 ___", "1. 단어: 3,4\n2. 영작: 5쪽"), "1. 영작 단어: 3,4\n2. 단어 영작: 5쪽");
});

test("the template's own numbering wins over the incoming numbers", () => {
  assert.equal(fill.apply("1) 영어 ___\n2) 수학 ___", "7. A\n9. B"), "1) 영어 A\n2) 수학 B");
});

test("a line with several blanks takes several items", () => {
  assert.equal(fill.apply("1. ___ 과 ___", "국어\n수학"), "1. 국어 과 수학");
});

test("sub-items come along, right under the line their parent filled", () => {
  const out = fill.apply("1. 영어 ___\n2. 수학 ___", "1. 기출\n    1) 본책\n    2) 워크북\n2. 단어");
  assert.equal(out, "1. 영어 기출\n    1) 본책\n    2) 워크북\n2. 수학 단어");
});

test("sub-items sit one level under the template line, even in a nested template", () => {
  const out = fill.apply("1. 영어\n    1) 기출 ___", "1. 문법\n    1) 본책");
  assert.equal(out, "1. 영어\n    1) 기출 문법\n        1) 본책");
});

test("fewer items than blanks: the rest stay blank", () => {
  assert.equal(fill.apply("1. 단어 ___\n2. 낭독 ___\n3. 영작 ___", "3,4\n37회"), "1. 단어 3,4\n2. 낭독 37회\n3. 영작 ___");
});

test("more items than blanks: the rest is added at the end, numbering on", () => {
  assert.equal(fill.apply("1. 단어 ___\n2. 낭독 ___", "A\nB\nC\nD"), "1. 단어 A\n2. 낭독 B\n3. C\n4. D");
  // numbered items come with their children and take the template's numbering style
  assert.equal(fill.apply("1) 단어 ___", "1. A\n2. B\n    1) b1\n3. C"), "1) 단어 A\n2) B\n    1) b1\n3) C");
});

test("lines without a blank stay exactly as they are", () => {
  assert.equal(fill.apply("1. 준비물 확인\n2. 단어 ___", "5,6"), "1. 준비물 확인\n2. 단어 5,6");
});

test("a template with no blank at all just gets the items added below it", () => {
  assert.equal(fill.apply("1. 준비물\n2. 복습", "A\nB"), "1. 준비물\n2. 복습\n3. A\n4. B");
});

test("empty input falls back sensibly", () => {
  assert.equal(fill.apply("1. 단어 ___", ""), "1. 단어 ___");
  assert.equal(fill.apply("", "1. 단어 3,4"), "1. 단어 3,4");
});

test("explain() reports what happened to every line", () => {
  const r = fill.explain("1. 준비물 확인\n2. 단어 ___\n3. 영작 ___", "A");
  assert.equal(r.text, "1. 준비물 확인\n2. 단어 A\n3. 영작 ___");
  assert.deepEqual(r.lines.map((l) => l.kind), ["kept", "filled", "blank"]);
  assert.match(r.lines[1].note, /순서대로/);
  assert.match(r.lines[2].note, /모자라/);          // says why it is still blank

  const more = fill.explain("1. 단어 ___", "A\nB");
  assert.deepEqual(more.lines.map((l) => l.kind), ["filled", "inserted"]);
  assert.match(more.lines[1].note, /맨 아래/);
});

test("explain() marks sub-items as part of their parent and keeps levels", () => {
  const t = "1. 단어 ___\n2. 기출 ___";
  const i = "1. 단어 3,4\n2. 기출\n    1) 본책";
  const r = fill.explain(t, i);
  assert.equal(r.text, fill.apply(t, i));
  assert.deepEqual(r.lines.map((l) => [l.level, l.kind]), [[0, "filled"], [0, "filled"], [1, "filled"]]);
});

test("tidy() makes a plain list's numbering sequential when several selections each brought their own", () => {
  assert.equal(fill.tidy("1. 단어\n1. 낭독\n1. 기출"), "1. 단어\n2. 낭독\n3. 기출");
  assert.equal(fill.tidy("1. A\n    1) b1\n1. B\n    1) b2\n    1) b3"), "1. A\n    1) b1\n2. B\n    1) b2\n    2) b3");
  assert.equal(fill.tidy("3,4\n37회"), "3,4\n37회");                 // unnumbered lines stay as they are
});

test("tidy() renumbers the numbered lines even when unnumbered lines are mixed in", () => {
  assert.equal(fill.tidy("1. 단어\n1. 낭독\n3,4 쪽"), "1. 단어\n2. 낭독\n3,4 쪽");
  assert.equal(fill.tidy("1. 단어\n3,4 쪽\n1. 낭독"), "1. 단어\n3,4 쪽\n2. 낭독");
  assert.equal(fill.tidy("1. A\n1) b"), "1. A\n1) b");           // a different style is left alone
});
