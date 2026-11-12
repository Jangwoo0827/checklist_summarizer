// Cache busting for GitHub Pages. Browsers keep js/css files for ~10 minutes, so a fresh index.html
// can end up running old scripts. This appends ?v=<hash of the file> to every local script and
// stylesheet reference in index.html: the URL changes exactly when the file does.
//
//   node tools/stamp.js          rewrites index.html (run it before every commit)
//   node tools/stamp.js --check  exits 1 if index.html is out of date
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..");
const REFERENCE = /(<script src="|<link rel="stylesheet" href=")([^"?]+)(?:\?v=[0-9a-f]+)?"/g;

// Line endings are normalised so Windows (CRLF) and Pages (LF) agree on the hash.
function hashFile(file) {
  const text = fs.readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
  return crypto.createHash("sha1").update(text).digest("hex").slice(0, 8);
}

function stamp(html) {
  return html.replace(REFERENCE, (match, prefix, file) => {
    if (/^(https?:)?\/\//.test(file)) return match; // remote files are not ours to version
    return prefix + file + "?v=" + hashFile(file) + '"';
  });
}

module.exports = { stamp, hashFile };

if (require.main === module) {
  const indexPath = path.join(ROOT, "index.html");
  const html = fs.readFileSync(indexPath, "utf8");
  const next = stamp(html.replace(/\r\n/g, "\n"));
  if (process.argv.includes("--check")) {
    if (next !== html.replace(/\r\n/g, "\n")) {
      console.error("index.html is out of date: run `node tools/stamp.js`");
      process.exit(1);
    }
  } else if (next !== html.replace(/\r\n/g, "\n")) {
    fs.writeFileSync(indexPath, next);
    console.log("index.html stamped");
  } else {
    console.log("index.html already up to date");
  }
}
