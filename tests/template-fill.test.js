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
