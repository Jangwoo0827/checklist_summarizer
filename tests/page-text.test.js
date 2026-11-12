const test = require("node:test");
const assert = require("node:assert/strict");

require("../js/util.js");
const markers = require("../js/markers.js");
const pageText = require("../js/page-text.js");

// The two columns of the academy's homework table, as the page's text reads (blank lines between items).
const CLASS_22B = [
  "1. 단어 3,4", "", "2. 낭독 :  37회 선행 16일 금요일 밤까지", "",
  "3. 기출로 적중 해커스 중학 영문법 3학년 :", "① 본책 409p 워크북 212p  까지", "해설지 보고 오답", "",
  "4. Reading : Reading Expert 유닛 14오답", "", "5. TOEFL listening :", "① 106,107p 딕테이션 수정"
].join("\n");

const CLASS_2C = [
  "1. 단어 24,25", "", "2. 낭독 : 37회 선행 16일 금요일 밤까지", "",
  "3.기출로 적중 해커스 중학영문법 2학년 :", "① 워크북 230p 까지 풀기", "",
  "4. Reading : Reading Voyage 유닛 14오답", "", "5. TOEFL listening :", "① 106,107p 딕테이션 수정"
].join("\n");

test("a homework table cell becomes a clean nested list", () => {
  assert.equal(pageText.toList(CLASS_22B), [
    "1. 단어 3,4",
    "2. 낭독: 37회 선행 16일 금요일 밤까지",
    "3. 기출로 적중 해커스 중학 영문법 3학년:",
    "    1) 본책 409p 워크북 212p 까지",
    "    해설지 보고 오답",
    "4. Reading: Reading Expert 유닛 14오답",
    "5. TOEFL listening:",
    "    1) 106,107p 딕테이션 수정"
  ].join("\n"));
});

test("'3.기출로' (no space after the dot) and the other column read just as well", () => {
  assert.equal(pageText.toList(CLASS_2C), [
    "1. 단어 24,25",
    "2. 낭독: 37회 선행 16일 금요일 밤까지",
    "3. 기출로 적중 해커스 중학영문법 2학년:",
    "    1) 워크북 230p 까지 풀기",
    "4. Reading: Reading Voyage 유닛 14오답",
    "5. TOEFL listening:",
    "    1) 106,107p 딕테이션 수정"
  ].join("\n"));
});

test("circled numbers keep their number as a sub-item marker", () => {
  assert.equal(pageText.toList("1. 영어\n② 둘째\n③ 셋째"), "1. 영어\n    2) 둘째\n    3) 셋째");
});

test("a heading above the first numbered item is dropped, plain text without numbers is kept", () => {
  assert.equal(pageText.toList("오늘의 숙제\n1. 단어\n2. 독해"), "1. 단어\n2. 독해");
  assert.equal(pageText.toList("준비물: 공책\n색연필"), "준비물: 공책\n색연필");
  assert.equal(pageText.toList(""), "");
  assert.equal(pageText.toList("1. 단어\n\n  \n2."), "1. 단어");           // empty items are dropped
});

test("a loose line sits under the item it follows", () => {
  assert.equal(pageText.toList("1. 영어\n※ 늦지 않기\n2. 수학"), "1. 영어\n    ※ 늦지 않기\n2. 수학");
});

test("the marker styles chosen in settings are applied", () => {
  const styleFor = (width) => (width === 0 ? "paren" : "circle");
  assert.equal(pageText.toList("1. 단어\n① 둘\n② 셋", styleFor), "1) 단어\n    ① 둘\n    ② 셋");
  assert.equal(pageText.toList("1. 단어\n① 둘", () => "none"), "단어\n    둘");
  assert.ok(markers.STYLES.length > 5);
});

test("board titles lose their trailing comment count; numbered homework text is left alone", () => {
  assert.equal(
    pageText.toList("[화목]3AA가 수업 - 11월 12일 목요일까지 숙제 [0]\n[월금]3AAA1 수업 - 11월 13일 금요일까지 숙제 [2]"),
    "[화목]3AA가 수업 - 11월 12일 목요일까지 숙제\n[월금]3AAA1 수업 - 11월 13일 금요일까지 숙제"
  );
  assert.equal(pageText.toList("1. 문제집 [2]\n2. 단어"), "1. 문제집 [2]\n2. 단어");
  assert.equal(pageText.toList("[1]"), "[1]");                       // a line that is only a count stays
});

// ---- live selecting: a new selection is a new item, the same selection growing is the same item ----

const start = { blocks: [], current: "" };
const step = (state, text) => pageText.accumulate(state, text);

test("the first selection becomes the current item; empty reports change nothing", () => {
  assert.deepEqual(step(start, "3,4"), { blocks: [], current: "3,4" });
  assert.deepEqual(step(start, "   "), start);
  assert.deepEqual(step({ blocks: ["a"], current: "b" }, ""), { blocks: ["a"], current: "b" });
});

test("dragging to make the same selection bigger updates the current item, it does not start a new one", () => {
  let s = step(start, "37");
  s = step(s, "37회");
  s = step(s, "37회 선행 16일");
  assert.deepEqual(s, { blocks: [], current: "37회 선행 16일" });
});

test("shrinking or re-dragging the same text also updates the current item", () => {
  let s = step(start, "37회 선행 16일");
  s = step(s, "37회 선행");
  assert.deepEqual(s, { blocks: [], current: "37회 선행" });
});

test("selecting something else makes the previous item final and starts the next one", () => {
  let s = step(start, "3,4");
  s = step(s, "37");                 // somewhere else: item 2 begins
  s = step(s, "37회 선행");           // and grows
  s = step(s, "영문법");              // somewhere else again: item 3
  assert.deepEqual(s, { blocks: ["3,4", "37회 선행"], current: "영문법" });
});

test("line breaks and spacing do not make the same selection look different", () => {
  let s = step(start, "1. 단어\n2. 낭독");
  s = step(s, "1. 단어  2. 낭독\n");   // the browser reports the same text with other whitespace
  assert.deepEqual(s, { blocks: [], current: "1. 단어\n2. 낭독" });
  s = step(s, "1. 단어 2. 낭독 3. 기출"); // grows
  assert.equal(s.blocks.length, 0);
});

test("the input state is left untouched", () => {
  const original = { blocks: ["a"], current: "b" };
  step(original, "c");
  assert.deepEqual(original, { blocks: ["a"], current: "b" });
});
