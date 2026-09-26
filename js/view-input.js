(function (root) {
  "use strict";
  var CN = root.CN = root.CN || {};
  var util = CN.util;
  var parser = CN.parser;
  var store = CN.store;
  var ocr = CN.ocr;

  var doc = root.document;
  var elTitle = doc.getElementById("title-input");
  var elText = doc.getElementById("text-input");
  var elBuild = doc.getElementById("btn-build");
  var tabBtnText = doc.getElementById("tab-btn-text");
  var tabBtnImage = doc.getElementById("tab-btn-image");
  var panelText = doc.getElementById("panel-text");
  var panelImage = doc.getElementById("panel-image");
  var elModel = doc.getElementById("model-select");
  var elModelHint = doc.getElementById("model-hint");
  var elDropzone = doc.getElementById("dropzone");
  var elDropzoneEmpty = doc.getElementById("dropzone-empty");
  var elFile = doc.getElementById("file-input");
  var elPreview = doc.getElementById("preview-img");
  var elRecognize = doc.getElementById("btn-recognize");
  var elStop = doc.getElementById("btn-stop");
  var elStream = doc.getElementById("stream-preview");
  var elStatus = doc.getElementById("recognize-status");

  var MODEL_HINT = elModelHint.textContent;

  var editingListId = null;
  var imageBase64 = null;
  var running = null; // AbortController while a recognition is in flight
  var modelsLoaded = false;

  // ---------- open / close ----------
  function openNew() {
    editingListId = null;
    elBuild.textContent = "체크리스트 만들기";
    elTitle.value = util.todayLabel();
    elText.value = "";
    resetImage();
    setTab("text");
    CN.app.showInput();
  }

  function openEdit(list) {
    editingListId = list.id;
    elBuild.textContent = "체크리스트 수정하기";
    elTitle.value = list.title;
    elText.value = parser.linesToText(list.lines);
    resetImage();
    setTab("text");
    CN.app.showInput();
  }

  function cancel() {
    stopRecognition();
    var back = editingListId || CN.app.activeId();
    editingListId = null;
    if (back && store.getList(back)) CN.app.openDetail(back);
    else CN.app.showList();
  }

  function build() {
    var newLines = parser.parseText(elText.value);
    if (!newLines.length) {
      util.toast("할 일을 한 줄 이상 적어주세요");
      elText.focus();
      return;
    }
    var title = elTitle.value.trim() || util.todayLabel();
    var list = editingListId && store.getList(editingListId);
    if (list) {
      list.checked = parser.remapByText(list.lines, newLines, list.checked);
      list.collapsed = parser.remapByText(list.lines, newLines, list.collapsed);
      list.title = title;
      list.lines = newLines;
      store.commit(list);
    } else {
      list = { id: util.uid(), title: title, lines: newLines, checked: {}, collapsed: {}, createdAt: Date.now() };
      store.addList(list);
    }
    editingListId = null;
    CN.app.openDetail(list.id);
  }

  // ---------- tabs ----------
  function setTab(name) {
    var isText = name === "text";
    panelText.hidden = !isText;
    panelImage.hidden = isText;
    tabBtnText.classList.toggle("active", isText);
    tabBtnText.setAttribute("aria-selected", String(isText));
    tabBtnImage.classList.toggle("active", !isText);
    tabBtnImage.setAttribute("aria-selected", String(!isText));
    if (!isText && !modelsLoaded) loadModels();
  }

  // ---------- models ----------
  function fillModels(names, selected) {
    elModel.innerHTML = "";
    names.forEach(function (name) {
      var opt = doc.createElement("option");
      opt.value = name;
      opt.textContent = name;
      elModel.appendChild(opt);
    });
    elModel.value = selected;
  }

  function loadModels() {
    var preferred = ocr.preferredModel();
    fillModels([preferred], preferred);
    ocr.listVisionModels().then(function (names) {
      modelsLoaded = true;
      if (!names.length) {
        setModelHint("사진을 읽을 수 있는 모델이 없어요. 터미널에서 'ollama pull " + ocr.DEFAULT_MODEL + "' 를 먼저 실행해주세요.", true);
        return;
      }
      var pick = names.filter(function (n) { return n === preferred || n === preferred + ":latest"; })[0] ||
        names.filter(function (n) { return n.indexOf(ocr.DEFAULT_MODEL) === 0; })[0] ||
        names[0];
      fillModels(names, pick);
      setModelHint(MODEL_HINT, false);
    }).catch(function () {
      setModelHint("Ollama에 연결할 수 없어요. Ollama가 켜져 있는지, OLLAMA_ORIGINS=* 설정을 했는지 확인해주세요.", true);
    });
  }

  function setModelHint(text, isError) {
    elModelHint.textContent = text;
    elModelHint.classList.toggle("is-error", isError);
  }

  elModel.addEventListener("change", function () { ocr.setPreferredModel(elModel.value); });

  // ---------- image ----------
  function resetImage() {
    stopRecognition();
    imageBase64 = null;
    elFile.value = "";
    elPreview.hidden = true;
    elPreview.removeAttribute("src");
    elDropzoneEmpty.hidden = false;
    elRecognize.disabled = true;
    elStream.hidden = true;
    elStream.textContent = "";
    showStatus("", "");
  }

  function acceptImageFile(file, autoStart) {
    if (!file || !/^image\//.test(file.type)) {
      showStatus("이미지 파일만 올릴 수 있어요.", "error");
      return;
    }
    stopRecognition();
    setTab("image");
    showStatus("이미지 준비 중...", "loading");
    ocr.prepareImage(file).then(function (prepared) {
      imageBase64 = prepared.base64;
      elPreview.src = prepared.previewUrl;
      elPreview.hidden = false;
      elDropzoneEmpty.hidden = true;
      elRecognize.disabled = false;
      showStatus("", "");
      if (autoStart) startRecognition();
    }).catch(function (err) {
      showStatus(err.message, "error");
    });
  }

  function showStatus(msg, kind) {
    if (!msg) { elStatus.hidden = true; elStatus.textContent = ""; return; }
    elStatus.hidden = false;
    elStatus.className = "status-msg" + (kind ? " is-" + kind : "");
    elStatus.textContent = msg;
    if (kind === "loading") elStatus.insertAdjacentHTML("afterbegin", '<span class="spinner"></span>');
  }

  // Recognized text is appended so a photo can add to what's already typed (or to a list being edited).
  function insertRecognized(text) {
    if (!text) return;
    var current = elText.value.replace(/\s+$/, "");
    elText.value = current ? current + "\n" + text : text;
  }

  function startRecognition() {
    if (!imageBase64) { showStatus("먼저 이미지를 선택해주세요.", "error"); return; }
    if (running) return;
    var controller = new AbortController();
    running = controller;
    var model = elModel.value || ocr.preferredModel();
    elRecognize.hidden = true;
    elStop.hidden = false;
    elStream.textContent = "";
    elStream.hidden = false;
    showStatus(model + " 모델로 읽는 중... (처음엔 모델을 불러오느라 조금 걸려요)", "loading");

    ocr.recognize({
      model: model,
      base64: imageBase64,
      signal: controller.signal,
      onText: function (text) {
        elStream.textContent = text;
        elStream.scrollTop = elStream.scrollHeight;
      }
    }).then(function (result) {
      if (!result.text) throw new Error("이미지에서 목록을 찾지 못했어요. 더 선명한 사진으로 시도해보세요.");
      insertRecognized(result.text);
      elStream.hidden = true;
      showStatus("", "");
      setTab("text");
      util.toast("인식 완료 · " + result.seconds.toFixed(1) + "초 — 내용을 확인하고 필요하면 고쳐주세요");
    }).catch(function (err) {
      if (err.name === "AbortError") {
        if (err.partialText) {
          insertRecognized(err.partialText);
          showStatus("중지했어요. 읽은 데까지는 텍스트 칸에 넣어뒀어요.", "ok");
        } else {
          showStatus("중지했어요.", "");
        }
        return;
      }
      var msg = err.message;
      if (!msg || err instanceof TypeError) {
        msg = "Ollama 서버에 연결할 수 없어요. Ollama가 켜져 있는지, OLLAMA_ORIGINS=* 설정을 했는지 확인해주세요.";
      }
      showStatus(msg, "error");
    }).finally(function () {
      if (running === controller) running = null;
      elRecognize.hidden = false;
      elStop.hidden = true;
    });
  }

  function stopRecognition() {
    if (running) running.abort();
  }

  // ---------- Tab key indentation in the textarea ----------
  elText.addEventListener("keydown", function (e) {
    if (e.key !== "Tab") return;
    e.preventDefault();
    var value = elText.value;
    var pos = elText.selectionStart;
    var lineStart = value.lastIndexOf("\n", pos - 1) + 1;
    if (e.shiftKey) {
      var m = value.slice(lineStart).match(/^(\t| {1,4})/);
      if (!m) return;
      elText.value = value.slice(0, lineStart) + value.slice(lineStart + m[0].length);
      elText.selectionStart = elText.selectionEnd = Math.max(lineStart, pos - m[0].length);
    } else {
      var indent = "    ";
      elText.value = value.slice(0, pos) + indent + value.slice(elText.selectionEnd);
      elText.selectionStart = elText.selectionEnd = pos + indent.length;
    }
  });

  // ---------- wiring ----------
  tabBtnText.addEventListener("click", function () { setTab("text"); });
  tabBtnImage.addEventListener("click", function () { setTab("image"); });
  doc.getElementById("btn-cancel-new").addEventListener("click", cancel);
  elBuild.addEventListener("click", build);
  elRecognize.addEventListener("click", startRecognition);
  elStop.addEventListener("click", stopRecognition);

  elDropzone.addEventListener("click", function () { elFile.click(); });
  elDropzone.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); elFile.click(); }
  });
  elDropzone.addEventListener("dragover", function (e) { e.preventDefault(); elDropzone.classList.add("drag-over"); });
  elDropzone.addEventListener("dragleave", function () { elDropzone.classList.remove("drag-over"); });
  elDropzone.addEventListener("drop", function (e) {
    e.preventDefault();
    elDropzone.classList.remove("drag-over");
    acceptImageFile(e.dataTransfer.files && e.dataTransfer.files[0], false);
  });
  elFile.addEventListener("change", function () {
    acceptImageFile(elFile.files && elFile.files[0], false);
  });

  CN.input = {
    openNew: openNew,
    openEdit: openEdit,
    acceptImageFile: acceptImageFile
  };
})(window);
