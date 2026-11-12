const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { stamp, hashFile } = require("../tools/stamp.js");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8").replace(/\r\n/g, "\n");

test("index.html references every local script and stylesheet with an up-to-date ?v= stamp", () => {
  // If this fails, run: node tools/stamp.js
  assert.equal(stamp(html), html);
});

test("every local script and stylesheet actually carries a stamp", () => {
  const refs = [...html.matchAll(/(?:<script src="|<link rel="stylesheet" href=")([^"]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length > 10, "found the script tags");
  refs.forEach((ref) => assert.match(ref, /\?v=[0-9a-f]{8}$/, ref));
});

test("a changed file changes its URL; identical content keeps it", () => {
  const sample = '<script src="js/util.js"></script>';
  assert.equal(stamp(sample), '<script src="js/util.js?v=' + hashFile("js/util.js") + '"></script>');
  assert.equal(stamp(stamp(sample)), stamp(sample));                       // idempotent
  assert.equal(stamp('<script src="https://cdn.example.com/x.js"></script>'), '<script src="https://cdn.example.com/x.js"></script>');
});
