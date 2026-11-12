const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const manifest = JSON.parse(read("manifest.json"));

// ---------- manifest ----------

test("the toolbar icon opens a side panel, not a popup", () => {
  assert.equal(manifest.action.default_popup, undefined);
  assert.equal(manifest.side_panel.default_path, "panel.html");
  assert.ok(fs.existsSync(path.join(ROOT, manifest.side_panel.default_path)));
  assert.ok(manifest.permissions.includes("sidePanel"));
});

test("reading web pages is an optional permission asked for on first use", () => {
  assert.deepEqual(manifest.optional_host_permissions, ["http://*/*", "https://*/*"]);
  assert.equal(manifest.host_permissions, undefined);            // nothing is granted at install time
  ["activeTab", "scripting", "storage"].forEach((p) => assert.ok(manifest.permissions.includes(p), p));
  assert.equal(manifest.background.service_worker, "background.js");
  assert.ok(fs.existsSync(path.join(ROOT, "background.js")));
});

test("panel.html hands over to the app in panel mode without inline scripts", () => {
  const html = read("panel.html");
  assert.match(html, /<meta http-equiv="refresh" content="0; url=index\.html\?panel=1">/);
  assert.doesNotMatch(html, /<script/i);                          // extension pages forbid inline scripts
});

// ---------- boot.js decides the mode ----------

function boot(search, withChrome = true) {
  const classes = new Set();
  const attrs = {};
  const window = {
    document: { documentElement: { classList: { add: (...c) => c.forEach((x) => classes.add(x)), contains: (c) => classes.has(c) }, setAttribute: (k, v) => { attrs[k] = v; } } },
    localStorage: { getItem: () => null },
    location: { search },
    chrome: withChrome ? { runtime: { id: "abc" } } : undefined
  };
  vm.runInNewContext(read("js/boot.js"), { window });
  return classes;
}

test("?panel=1 is the compact layout with a fluid width; the old ?popup=1 still works; the website is neither", () => {
  assert.deepEqual([...boot("?panel=1")].sort(), ["is-extension", "is-panel", "is-popup"]);
  assert.deepEqual([...boot("?popup=1")].sort(), ["is-extension", "is-popup"]);
  assert.deepEqual([...boot("", false)], []);
});

// ---------- background.js ----------

// Objects made inside a vm sandbox have another prototype, so compare them as plain JSON.
const plain = (value) => JSON.parse(JSON.stringify(value));

function worker({ sidePanel, openFails = false, windows = [], base = { id: 1, left: 100, top: 20, width: 1400, height: 900 } }) {
  const calls = { behavior: [], opened: [], created: [], updated: [] };
  const listeners = {};
  const chrome = {
    runtime: { getURL: (p) => "chrome-extension://abc/" + p, onMessage: { addListener: (f) => { listeners.message = f; } }, onInstalled: { addListener: (f) => { listeners.installed = f; } } },
    action: { onClicked: { addListener: (f) => { listeners.clicked = f; } } },
    windows: {
      getAll: (o, cb) => cb(windows),
      getLastFocused: (o, cb) => cb(base),
      create: (o) => { calls.created.push(o); },
      update: (id, o) => { calls.updated.push([id, o]); }
    },
    tabs: { captureVisibleTab: (winId, o, cb) => cb("data:image/png;base64,AAAA") }
  };
  if (sidePanel) {
    chrome.sidePanel = {
      setPanelBehavior: (o) => { calls.behavior.push(o); return Promise.resolve(); },
      open: (o) => { calls.opened.push(o); return openFails ? Promise.reject(new Error("no")) : Promise.resolve(); }
    };
  }
  vm.runInNewContext(read("background.js"), { chrome });
  return { calls, listeners };
}

test("with a side panel API, the icon click is handed to the side panel", () => {
  const { calls, listeners } = worker({ sidePanel: true });
  assert.deepEqual(plain(calls.behavior), [{ openPanelOnActionClick: true }]);
  listeners.installed();
  assert.equal(calls.behavior.length, 2);                         // harmless to set again on install
  assert.ok(listeners.clicked, "a click handler exists for when the panel can't take over");
  listeners.clicked({ id: 5 });
  assert.deepEqual(plain(calls.opened), [{ tabId: 5 }]);
  assert.equal(calls.created.length, 0);
});

test("if opening the side panel fails, the narrow window is the fallback", async () => {
  const { calls, listeners } = worker({ sidePanel: true, openFails: true });
  listeners.clicked({ id: 5 });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(calls.created.length, 1);
});

test("without a side panel API, a narrow window docks to the right edge of the browser window", () => {
  const { calls, listeners } = worker({ sidePanel: false });
  assert.deepEqual(plain(calls.behavior), []);
  listeners.clicked({ id: 5 });
  assert.deepEqual(plain(calls.created), [{
    url: "chrome-extension://abc/panel.html", type: "popup", width: 440, focused: true,
    height: 900, top: 20, left: 100 + 1400 - 440
  }]);
});

test("the window fallback is reused when it is already open, whichever page it has handed over to", () => {
  const { calls, listeners } = worker({ sidePanel: false, windows: [{ id: 9, tabs: [{ url: "chrome-extension://abc/index.html?panel=1" }] }] });
  listeners.clicked({ id: 5 });
  assert.equal(calls.created.length, 0);
  assert.deepEqual(plain(calls.updated), [[9, { focused: true }]]);
  // a popup window of some other extension is not ours
  const other = worker({ sidePanel: false, windows: [{ id: 9, tabs: [{ url: "chrome-extension://zzz/index.html" }] }] });
  other.listeners.clicked({ id: 5 });
  assert.equal(other.calls.created.length, 1);
});

test("screenshots are only taken for the extension's own scripts running in a tab", () => {
  const { listeners } = worker({ sidePanel: true });
  let reply = null;
  assert.equal(listeners.message({ type: "cn-capture" }, { tab: { windowId: 3 } }, (r) => { reply = r; }), true);
  assert.deepEqual(plain(reply), { dataUrl: "data:image/png;base64,AAAA" });
  assert.equal(listeners.message({ type: "cn-capture" }, {}, () => {}), false);               // not from a tab
  assert.equal(listeners.message({ type: "something-else" }, { tab: { windowId: 3 } }, () => {}), false);
  assert.equal(listeners.message(null, { tab: { windowId: 3 } }, () => {}), false);
});
