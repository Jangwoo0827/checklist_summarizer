(function (root) {
  "use strict";
  var CN = root.CN = root.CN || {};
  var util = CN.util;
  var store = CN.store;

  // "이 페이지에서 가져오기" (extension popup only).
  //   * Text selected on the page is imported at once.
  //   * Otherwise the user chooses how: click to pick blocks on the page, or drag a region and read it
  //     with OCR (for text that can't be selected or read: images, canvas, copy protection).
  // Clicking the page closes the popup, so what the page collects is saved to chrome.storage.local
  // and imported the next time the popup opens (importPending). A template, if one is chosen, is
  // filled with whatever comes in.
  var PENDING_KEY = "cnPending";
  var PENDING_MAX_AGE_MS = 30 * 60 * 1000;
  var TEMPLATE_PREF_KEY = "checklist_note_import_tpl_v1";

  var doc = root.document;
  var chromeApi = root.chrome;
  var button = doc.getElementById("btn-import");
  var elTemplateRow = doc.getElementById("import-template-row");
  var elTemplate = doc.getElementById("import-template");
  var dialog = doc.getElementById("import-dialog");

  function inPopup() {
    return doc.documentElement.classList.contains("is-popup") && chromeApi && chromeApi.scripting && chromeApi.tabs && chromeApi.storage;
  }

  // ---------- template to fill ----------

  function renderTemplateChoice() {
    var saved = util.readString(TEMPLATE_PREF_KEY) || "";
    elTemplateRow.hidden = store.templates.length === 0;
    elTemplate.innerHTML = "";
    var none = doc.createElement("option");
    none.value = "";
    none.textContent = "템플릿 없이 가져오기";
    elTemplate.appendChild(none);
    store.templates.forEach(function (tpl) {
      var option = doc.createElement("option");
      option.value = tpl.id;
      option.textContent = "\"" + tpl.name + "\" 템플릿에 채우기";
      elTemplate.appendChild(option);
    });
    elTemplate.value = store.getTemplate(saved) ? saved : "";
  }

  function chosenTemplate() {
    return elTemplate.value ? store.getTemplate(elTemplate.value) : null;
  }

  // Pours list text into the chosen template (or returns it unchanged).
  function withTemplate(listText) {
    var tpl = chosenTemplate();
    return tpl ? CN.templateFill.apply(tpl.text, listText) : listText;
  }

  // ---------- reading the page ----------

  function activeTab() {
    return new Promise(function (resolve) {
      chromeApi.tabs.query({ active: true, currentWindow: true }, function (tabs) { resolve(tabs && tabs[0]); });
    });
  }

  function inject(tabId, func, allFrames) {
    return chromeApi.scripting.executeScript({ target: { tabId: tabId, allFrames: !!allFrames }, func: func });
  }

  // A selection may be inside a frame of the page, so look in all of them (frames we have no access
  // to are skipped; if that makes the whole call fail, fall back to the top frame).
  function readSelection(tabId) {
    return inject(tabId, CN.pageSelection, true).catch(function () {
      return inject(tabId, CN.pageSelection, false);
    }).then(function (results) {
      var found = (results || []).map(function (r) { return r && r.result; }).filter(function (t) { return t && t.trim(); });
      return found.length ? found[0] : "";
    });
  }

  function importList(listText, message) {
    CN.input.openNewWithList(withTemplate(listText));
    util.toast(message || "페이지에서 가져왔어요. 틀린 곳이 있으면 고쳐주세요");
  }

  function importPageText(raw) {
    importList(CN.pageText.toList(raw, CN.settings.styleFor));
  }

  // Starts a mode on the page, then closes the popup so the page is clear.
  function startOnPage(tabId, func) {
    inject(tabId, func, false).then(function () { root.close(); }).catch(function (err) {
      console.error(err);
      util.toast("이 페이지에서는 쓸 수 없어요");
    });
  }

  function run() {
    activeTab().then(function (tab) {
      if (!tab || !/^https?:/.test(tab.url || "")) {
        util.toast("이 페이지에서는 쓸 수 없어요. 일반 웹페이지에서 눌러주세요");
        return null;
      }
      return readSelection(tab.id).then(function (selected) {
        if (selected) { importPageText(selected); return null; }
        // Nothing selected: let the user choose how.
        doc.getElementById("import-pick").onclick = function () { dialog.close(); startOnPage(tab.id, CN.pagePick); };
        doc.getElementById("import-region").onclick = function () { dialog.close(); startOnPage(tab.id, CN.pageRegion); };
        dialog.showModal();
        return null;
      });
    }).catch(function (err) {
      console.error(err);
      util.toast("이 페이지에서는 글을 가져올 수 없어요");
    });
  }

  // ---------- what the page saved ----------

  function importImage(dataUrl) {
    CN.input.openNewWithList("");
    util.toast("영역의 글자를 읽는 중이에요. 처음에는 조금 걸려요");
    return root.fetch(dataUrl).then(function (r) { return r.blob(); }).then(function (blob) {
      return CN.photo.recognize(new root.File([blob], "region.png", { type: "image/png" }));
    }).then(function (result) {
      if (!result.text) { util.toast("영역에서 글자를 찾지 못했어요. 영역을 조금 더 크게 잡아보세요"); return; }
      CN.input.openNewWithList(withTemplate(result.text));
      util.toast("영역을 읽었어요. 틀린 글자가 있으면 고쳐주세요");
    }).catch(function (err) {
      console.error(err);
      util.toast("영역을 읽지 못했어요. 인터넷 연결을 확인해 주세요");
    });
  }

  function importPending() {
    chromeApi.storage.local.get(PENDING_KEY, function (items) {
      var pending = items && items[PENDING_KEY];
      if (!pending) return;
      chromeApi.storage.local.remove(PENDING_KEY);
      if (Date.now() - pending.at > PENDING_MAX_AGE_MS) return;
      if (pending.image) importImage(pending.image);
      else if (pending.text) importPageText(pending.text);
    });
  }

  function init() {
    if (!button || !inPopup()) return;
    button.hidden = false;
    renderTemplateChoice();
    elTemplate.addEventListener("change", function () { util.writeString(TEMPLATE_PREF_KEY, elTemplate.value); });
    button.addEventListener("click", run);
    Array.prototype.forEach.call(dialog.querySelectorAll("[data-close-dialog]"), function (btn) {
      btn.addEventListener("click", function () { dialog.close(); });
    });
    importPending();
  }

  CN.pageImport = {
    init: init,
    // Templates can change under us when another device syncs.
    refresh: function () { if (button && !button.hidden) renderTemplateChoice(); }
  };
})(window);
