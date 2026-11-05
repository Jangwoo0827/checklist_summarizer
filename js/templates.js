(function (root) {
  "use strict";
  var CN = root.CN = root.CN || {};
  var util = CN.util;
  var store = CN.store;

  // "템플릿 저장": names the current editor text and stores it as a reusable template.
  var doc = root.document;
  var elTitle = doc.getElementById("title-input");
  var elText = doc.getElementById("text-input");
  var dialog = doc.getElementById("template-dialog");
  var elName = doc.getElementById("template-name");
  var elNote = doc.getElementById("template-note");
  var elError = doc.getElementById("template-error");

  function showError(message) {
    elError.textContent = message || "";
    elError.hidden = !message;
  }

  function updateNote() {
    var name = elName.value.trim();
    var exists = name && store.templates.some(function (t) { return t.name === name; });
    elNote.textContent = exists ? "같은 이름의 템플릿이 있어요. 저장하면 새 내용으로 바뀌어요." : "";
  }

  function openSave() {
    if (!elText.value.trim()) {
      util.toast("저장할 할 일 목록을 먼저 적어주세요");
      elText.focus();
      return;
    }
    var title = elTitle.value.trim();
    // The default title is today's date, which makes a poor template name.
    elName.value = title && title !== util.todayLabel() ? title : "";
    showError("");
    updateNote();
    dialog.showModal();
    elName.focus();
    elName.select();
  }

  function save() {
    var name = elName.value.trim();
    if (!name) { showError("템플릿 이름을 적어주세요."); elName.focus(); return; }
    store.saveTemplate(name, elText.value.replace(/\s+$/, ""));
    dialog.close();
    util.toast("'" + name + "' 템플릿으로 저장했어요");
  }

  doc.getElementById("btn-save-template").addEventListener("click", openSave);
  doc.getElementById("template-save").addEventListener("click", save);
  elName.addEventListener("input", function () { showError(""); updateNote(); });
  elName.addEventListener("keydown", function (e) {
    if (e.isComposing || e.keyCode === 229) return; // Korean IME is still composing
    if (e.key === "Enter") { e.preventDefault(); save(); }
  });
  Array.prototype.forEach.call(dialog.querySelectorAll("[data-close-dialog]"), function (btn) {
    btn.addEventListener("click", function () { dialog.close(); });
  });
  dialog.addEventListener("click", function (e) {
    if (e.target === dialog) dialog.close(); // backdrop click
  });

  CN.templates = { openSave: openSave };
})(window);
