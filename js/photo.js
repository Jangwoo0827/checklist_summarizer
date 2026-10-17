(function (root) {
  "use strict";
  var CN = root.CN = root.CN || {};
  var util = CN.util;

  // Homework photo → text, entirely in the browser with Tesseract (Korean + English).
  // The engine files are bundled in vendor/tesseract (extensions may not load remote code);
  // the language data is downloaded once from jsDelivr and then cached by the browser.
  var TARGET_SIDE = 2400;
  var MAX_SCALE = 3;
  var doc = root.document;
  var elText = doc.getElementById("text-input");
  var elButton = doc.getElementById("btn-photo");
  var elLabel = doc.getElementById("photo-label");
  var elFile = doc.getElementById("photo-input");
  var view = doc.getElementById("view-input");
  var busy = false;
  var workerPromise = null;

  function isPopup() { return doc.documentElement.classList.contains("is-popup"); }

  function setLabel(text) { elLabel.textContent = text; }

  function setBusy(on) {
    busy = on;
    elButton.disabled = on;
    setLabel(on ? "읽는 중…" : "사진에서 읽기");
    view.classList.toggle("is-reading", on);
  }

  function getWorker() {
    if (!workerPromise) {
      var base = new URL("vendor/tesseract/", root.location.href).href;
      workerPromise = root.Tesseract.createWorker("kor+eng", 1, {
        workerPath: base + "worker.min.js",
        corePath: base + "tesseract-core-simd-lstm.wasm.js",
        workerBlobURL: false,
        logger: function (m) {
          if (!busy) return;
          if (m.status === "recognizing text") setLabel("읽는 중 " + Math.round(m.progress * 100) + "%");
          else if (/loading/.test(m.status)) setLabel("준비 중…");
        }
      }).then(function (worker) {
        // PSM 4 ("one column of text") read these lists best in our tests, well ahead of the default.
        // debug_file silences Tesseract's chatter ("Estimating resolution as …"), which Chrome
        // otherwise lists as warnings on the extension's error page.
        return worker.setParameters({ tessedit_pageseg_mode: "4", debug_file: "/dev/null" })
          .then(function () { return worker; });
      });
      workerPromise.catch(function () { workerPromise = null; });
    }
    return workerPromise;
  }

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("사진을 열 수 없어요.")); };
      img.src = url;
    });
  }

  function grayscale(img) {
    var canvas = doc.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    var ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    var data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    var gray = new Uint8ClampedArray(canvas.width * canvas.height);
    for (var i = 0, p = 0; i < gray.length; i++, p += 4) {
      gray[i] = (data[p] * 299 + data[p + 1] * 587 + data[p + 2] * 114) / 1000;
    }
    return { w: canvas.width, h: canvas.height, px: gray };
  }

  // Table screenshots put classes side by side; Tesseract would read straight across and mix them.
  // Find full-height vertical rules and return the x-ranges between them.
  function columns(g) {
    var rules = [];
    for (var x = 0; x < g.w; x++) {
      var dark = 0;
      for (var y = 0; y < g.h; y++) if (g.px[y * g.w + x] < 100) dark++;
      if (dark > g.h * 0.6) rules.push(x);
    }
    var cuts = [0];
    rules.forEach(function (x, i) {
      if (i === 0 || x - rules[i - 1] > 2) cuts.push(x);
    });
    cuts.push(g.w);
    var ranges = [];
    for (var i = 0; i + 1 < cuts.length; i++) {
      var a = cuts[i] + 3, b = cuts[i + 1] - 3;
      if (b - a >= g.w * 0.15) ranges.push([a, b]);
    }
    return ranges.length ? ranges : [[0, g.w]];
  }

  // Crops one column and upscales small screenshots (Tesseract reads small Korean text badly).
  function prepare(g, range) {
    var cw = range[1] - range[0];
    var scale = Math.min(MAX_SCALE, TARGET_SIDE / Math.max(cw, g.h));
    var src = doc.createElement("canvas");
    src.width = cw;
    src.height = g.h;
    var sctx = src.getContext("2d");
    var srcData = sctx.createImageData(cw, g.h);
    for (var y = 0; y < g.h; y++) {
      for (var x = 0; x < cw; x++) {
        var v = g.px[y * g.w + range[0] + x], p = (y * cw + x) * 4;
        srcData.data[p] = srcData.data[p + 1] = srcData.data[p + 2] = v;
        srcData.data[p + 3] = 255;
      }
    }
    sctx.putImageData(srcData, 0, 0);

    var out = doc.createElement("canvas");
    out.width = Math.round(cw * scale);
    out.height = Math.round(g.h * scale);
    var ctx = out.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, 0, 0, out.width, out.height);
    return out;
  }

  // Flattens Tesseract's blocks → paragraphs → lines, keeping each line's position and first word.
  function ocrLines(data) {
    var lines = [];
    (data.blocks || []).forEach(function (b) {
      b.paragraphs.forEach(function (p) {
        p.lines.forEach(function (l) {
          var w = l.words[0];
          lines.push({
            text: l.text.trim(),
            x0: l.bbox.x0, x1: l.bbox.x1, h: l.bbox.y1 - l.bbox.y0,
            first: w ? { text: w.text, x0: w.bbox.x0, x1: w.bbox.x1 } : null
          });
        });
      });
    });
    return lines;
  }

  function insertText(text) {
    var current = elText.value.replace(/\s+$/, "");
    elText.focus();
    if (current) elText.setSelectionRange(elText.value.length, elText.value.length);
    else elText.select();
    var chunk = current ? "\n" + text : text;
    // execCommand keeps Ctrl+Z able to undo the insertion.
    if (!doc.execCommand("insertText", false, chunk)) elText.value = current ? current + chunk : text;
  }

  function read(file) {
    if (busy || !file || !/^image\//.test(file.type)) return;
    if (root.location.protocol === "file:") {
      util.toast("파일로 열면 사진 인식이 안 돼요. 웹사이트나 확장 프로그램에서 써주세요");
      return;
    }
    setBusy(true);
    var columnCount = 1;
    Promise.all([loadImage(file), getWorker()]).then(function (res) {
      var g = grayscale(res[0]);
      var ranges = columns(g);
      columnCount = ranges.length;
      var worker = res[1];
      var texts = [];
      return ranges.reduce(function (chain, range) {
        return chain.then(function () {
          var canvas = prepare(g, range);
          return worker.recognize(canvas, {}, { blocks: true }).then(function (r) {
            texts.push(CN.ocrText.clean(ocrLines(r.data), canvas.width));
          });
        });
      }, Promise.resolve()).then(function () { return texts; });
    }).then(function (texts) {
      var text = texts.filter(Boolean).join("\n\n");
      if (!text) { util.toast("사진에서 글자를 찾지 못했어요"); return; }
      insertText(text);
      util.toast(columnCount > 1
        ? "칸이 " + columnCount + "개라 차례로 넣었어요. 필요 없는 칸은 지우고, 틀린 글자는 고쳐주세요"
        : "사진을 읽었어요. 틀린 글자가 있으면 고쳐주세요");
    }).catch(function (err) {
      console.error(err);
      util.toast("사진을 읽지 못했어요. 인터넷 연결을 확인해 주세요");
    }).then(function () { setBusy(false); });
  }

  function imageFrom(items) {
    for (var i = 0; items && i < items.length; i++) {
      var f = items[i].getAsFile ? (items[i].kind === "file" ? items[i].getAsFile() : null) : items[i];
      if (f && /^image\//.test(f.type)) return f;
    }
    return null;
  }

  elButton.addEventListener("click", function () {
    // A file picker steals focus and closes the extension popup, so pick the photo in a full tab instead.
    if (isPopup() && root.chrome && root.chrome.tabs) {
      root.chrome.tabs.create({ url: root.chrome.runtime.getURL("index.html") });
      root.close();
      return;
    }
    elFile.click();
  });
  elFile.addEventListener("change", function () {
    read(elFile.files[0]);
    elFile.value = "";
  });

  doc.addEventListener("paste", function (e) {
    if (view.hidden) return;
    var file = imageFrom(e.clipboardData && e.clipboardData.items);
    if (!file) return;
    e.preventDefault();
    read(file);
  });

  view.addEventListener("dragover", function (e) {
    if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, "Files") >= 0) {
      e.preventDefault();
      view.classList.add("is-dropping");
    }
  });
  view.addEventListener("dragleave", function (e) {
    if (!view.contains(e.relatedTarget)) view.classList.remove("is-dropping");
  });
  view.addEventListener("drop", function (e) {
    view.classList.remove("is-dropping");
    var file = imageFrom(e.dataTransfer && e.dataTransfer.files);
    if (!file) return;
    e.preventDefault();
    read(file);
  });
})(window);
