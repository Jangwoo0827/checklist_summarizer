const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { VERSION, PATCH_NOTES } = require("../js/version.js");
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8"));

const parse = (v) => v.split(".").map(Number);
const compare = (a, b) => {
  const x = parse(a), y = parse(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
};

test("the extension manifest and the app report the same version", () => {
  assert.equal(manifest.version, VERSION);
});

test("the newest patch note is the current version", () => {
  assert.equal(PATCH_NOTES[0].version, VERSION);
});

test("patch notes are well-formed, newest first, with no repeated version", () => {
  const seen = new Set();
  PATCH_NOTES.forEach((note, i) => {
    assert.match(note.version, /^\d+\.\d+\.\d+$/, note.version);   // Chrome only accepts dotted numbers
    assert.match(note.date, /^\d{4}-\d{2}-\d{2}$/, note.version);
    assert.ok(note.items.length > 0 && note.items.every((t) => typeof t === "string" && t.trim()), note.version);
    assert.ok(!seen.has(note.version), "duplicate " + note.version);
    seen.add(note.version);
    if (i > 0) {
      assert.ok(compare(PATCH_NOTES[i - 1].version, note.version) > 0, note.version + " should be older than " + PATCH_NOTES[i - 1].version);
      assert.ok(PATCH_NOTES[i - 1].date >= note.date, note.version + " date");
    }
  });
});

test("the README names the current version", () => {
  const readme = fs.readFileSync(path.join(__dirname, "..", "README.md"), "utf8");
  assert.ok(readme.includes("v" + VERSION), "README should mention v" + VERSION);
});
