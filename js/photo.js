(function (root) {
  "use strict";
  var CN = root.CN = root.CN || {};
  var util = CN.util;

  // Homework photo → text, through the read-homework Edge Function (it holds the Gemini key).
  var MAX_SIDE = 1600;
  var doc = root.document;
  var elText = doc.getElementById("text-input");
  var elButton = doc.getElementById("btn-photo");
  var elLabel = doc.getElementById("photo-label");
  var elFile = doc.getElementById("photo-input");
  var view = doc.getElementById("view-input");
  var busy = false;

  function isPopup() { return doc.documentElement.classList.contains("is-popup"); }

  // Shrinks big phone photos so the upload stays small; text is still readable at 1600px.
  function toJpegBase64(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
        var canvas = doc.createElement("canvas");
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", 0.88).split(",")[1]);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("사진을 열 수 없어요.")); };
      img.src = url;
    });
  }

  function setBusy(on) {
    busy = on;
    elButton.disabled = on;
    elLabel.textContent = on ? "읽는 중…" : "사진에서 읽기";
    view.classList.toggle("is-reading", on);
  }

  function insertText(text) {
    var current = elText.value.replace(/\s+$/, "");
    elText.focus();
    elText.setSelectionRange(elText.value.length, elText.value.length);
    // execCommand keeps Ctrl+Z able to undo the insertion.
    var chunk = (current ? "\n" : "") + text;
    if (!current) elText.select();
    if (!doc.execCommand("insertText", false, current ? chunk : text)) elText.value = current ? current + chunk : text;
  }

  function signedIn() {
    if (CN.sync.active()) return true;
    util.toast("로그인하면 사진 인식을 쓸 수 있어요");
    return false;
  }

  function read(file) {
    if (busy || !file || !/^image\//.test(file.type) || !signedIn()) return;
    setBusy(true);
    toJpegBase64(file).then(function (image) {
      return CN.sync.callFunction("read-homework", { image: image, mimeType: "image/jpeg" });
    }).then(function (res) {
      var text = String(res.text || "").trim();
      if (!text) { util.toast("사진에서 할 일을 찾지 못했어요"); return; }
      insertText(text);
      util.toast("사진을 읽었어요. 틀린 곳이 있으면 고쳐주세요");
    }).catch(function (err) {
      util.toast(err.message || "사진을 읽지 못했어요");
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
    if (!signedIn()) return;
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
