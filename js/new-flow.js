(function (root) {
  "use strict";
  var CN = root.CN = root.CN || {};
  var util = CN.util;
  var store = CN.store;

  // The "새 체크리스트 만들기" screens, as cards:
  //   1. where the text comes from:  기본 (type it) / 페이지 (the web page being viewed, extension only)
  //   2. which template to use:      템플릿 없이 / each saved template
  //   (page) then goes straight to live mode (live.js); click-to-pick and region OCR are buttons there
  // When a template is chosen for imported text, a preview shows exactly what goes where before it is
  // applied. The same preview serves "템플릿에 합치기" in the editor.
  var doc = root.document;
  var dialog = doc.getElementById("new-dialog");
  var elTitle = doc.getElementById("new-title");
  var elDesc = doc.getElementById("new-desc");
  var elCards = doc.getElementById("new-cards");
  var elBack = doc.getElementById("new-back");

  var preview = doc.getElementById("preview-dialog");
  var pvTitle = doc.getElementById("preview-title");
  var pvDesc = doc.getElementById("preview-desc");
  var pvList = doc.getElementById("preview-list");
  var pvSummary = doc.getElementById("preview-summary");
  var pvApply = doc.getElementById("preview-apply");
  var pvAlt = doc.getElementById("preview-alt");

  // ---------- generic card screen ----------

  function card(label, sub, onClick, extraClass) {
    var b = doc.createElement("button");
    b.type = "button";
    b.className = "fill-choice" + (extraClass ? " " + extraClass : "");
    var strong = doc.createElement("strong");
    strong.textContent = label;
    b.appendChild(strong);
    if (sub) {
      var span = doc.createElement("span");
      span.textContent = sub;
      b.appendChild(span);
    }
    b.addEventListener("click", onClick);
    return b;
  }

  function screen(title, desc, cards, goBack) {
    elTitle.textContent = title;
    elDesc.textContent = desc || "";
    elDesc.hidden = !desc;
    elCards.innerHTML = "";
    cards.forEach(function (c) { elCards.appendChild(c); });
    elBack.hidden = !goBack;
    elBack.onclick = goBack || null;
    if (!dialog.open) dialog.showModal();
  }

  function templateSummary(tpl) {
    return tpl.text.split("\n").filter(function (l) { return l.trim(); }).slice(0, 3).join("   /   ");
  }

  // ---------- steps ----------

  function open() {
    if (CN.pageImport.available()) showSource();
    else if (store.templates.length) showTemplates("basic", null);
    else CN.input.openNew();
  }

  function showSource() {
    screen("어떻게 시작할까요?", "", [
      card("기본", "빈 체크리스트에 직접 적어요", function () { showTemplates("basic", showSource); }),
      card("페이지", "지금 보고 있는 웹페이지에서 글을 가져와요", function () { showTemplates("page", showSource); })
    ], null);
  }

  function showTemplates(source, goBack) {
    if (!store.templates.length) { proceed(source, null, goBack); return; }
    var page = source === "page";
    var cards = [card("템플릿 없이", page ? "가져온 글을 그대로 새 체크리스트로 만들어요" : "빈 체크리스트로 시작해요", function () {
      proceed(source, null, function () { showTemplates(source, goBack); });
    })];
    store.templates.forEach(function (tpl) {
      cards.push(card(tpl.name, templateSummary(tpl), function () {
        proceed(source, tpl, function () { showTemplates(source, goBack); });
      }));
    });
    screen(page ? "가져온 글을 템플릿에 채울까요?" : "템플릿으로 시작할까요?",
      page ? "템플릿을 고르면 가져온 글이 위에서부터 순서대로 템플릿의 빈칸(___)에 하나씩 들어가요. 넣기 전에 미리 볼 수 있어요."
           : "템플릿을 고르면 틀이 입력 화면에 채워지고, 빈칸부터 쓸 수 있어요.",
      cards, goBack);
  }

  function proceed(source, tpl, goBack) {
    if (source === "basic") {
      dialog.close();
      if (tpl) CN.input.useTemplate(tpl); else CN.input.openNew();
      return;
    }
    CN.pageImport.prepare().then(function (ctx) {
      if (ctx.needsAccess) { showAccess(source, tpl, goBack); return; }
      if (ctx.error) { dialog.close(); util.toast(ctx.error); return; }
      // No second question: the page is unlocked for selecting and the editor follows the selection live.
      dialog.close();
      CN.live.start(ctx.tab, tpl, ctx.selection);
    });
  }

  // First use: the browser asks once for permission to read web pages.
  function showAccess(source, tpl, goBack) {
    screen("웹페이지를 읽으려면 허용이 필요해요",
      "브라우저가 \"모든 사이트의 데이터 읽기\" 허용을 한 번 물어봐요. 허용하면 어떤 웹페이지에서든 글을 가져올 수 있고, 페이지를 옮겨 다녀도 다시 묻지 않아요. 평소에는 아무것도 읽지 않고, 가져오기를 누를 때만 지금 보는 페이지를 읽어요.",
      [card("허용하고 계속", "브라우저의 허용 창이 떠요", function () {
        // Called straight from the click: the browser only shows its prompt for a user gesture.
        CN.pageImport.requestAccess().then(function (granted) {
          if (granted) proceed(source, tpl, goBack);
          else util.toast("허용하지 않으면 페이지에서 글을 가져올 수 없어요");
        });
      })], goBack);
  }

  // ---------- delivering text into the editor ----------

  // Imported list text, with or without a template. `message` replaces the default toast.
  function deliver(listText, templateId, message) {
    var tpl = templateId ? store.getTemplate(templateId) : null;
    var done = message || "페이지에서 가져왔어요. 틀린 곳이 있으면 고쳐주세요";
    if (!tpl) {
      CN.input.openNewWithList(listText);
      util.toast(done);
      return;
    }
    showPreview(tpl, listText, {
      applyLabel: "적용하기",
      altLabel: "템플릿 없이 그대로 넣기",
      onApply: function (result) {
        CN.input.openNewWithList(result.text);
        util.toast("\"" + tpl.name + "\" 템플릿에 채웠어요. 비어 있는 곳은 Tab으로 이어서 채워요");
      },
      // Closing the preview must not lose what was imported.
      onAlt: function () {
        CN.input.openNewWithList(listText);
        util.toast(done);
      }
    });
  }

  // "템플릿에 합치기": the editor's own text goes into a template.
  function fillEditor() {
    var text = CN.input.getText();
    if (!text.trim()) {
      util.toast("합칠 글을 먼저 적거나 붙여넣어 주세요");
      return;
    }
    if (!store.templates.length) {
      util.toast("저장해 둔 템플릿이 없어요. 먼저 \"템플릿 저장\"으로 틀을 만들어 주세요");
      return;
    }
    var cards = store.templates.map(function (tpl) {
      return card(tpl.name, templateSummary(tpl), function () {
        showPreview(tpl, text, {
          applyLabel: "적용하기",
          altLabel: null,
          onApply: function (result) {
            CN.input.replaceText(result.text);
            util.toast("\"" + tpl.name + "\" 템플릿에 채웠어요. 비어 있는 곳은 Tab으로 이어서 채워요");
          },
          onAlt: null
        });
      });
    });
    screen("어느 템플릿에 채울까요?", "지금 입력 화면에 있는 글이 위에서부터 순서대로 템플릿의 빈칸(___)에 하나씩 들어가요. 넣기 전에 미리 볼 수 있어요.", cards, null);
  }

  // ---------- preview ----------

  var KIND = {
    filled: { tag: "채움", cls: "pv-filled" },
    blank: { tag: "비어 있음", cls: "pv-blank" },
    inserted: { tag: "끼워 넣음", cls: "pv-inserted" },
    kept: { tag: "틀 그대로", cls: "pv-kept" }
  };

  function showPreview(tpl, incoming, cfg) {
    var result = CN.templateFill.explain(tpl.text, incoming);
    var counts = { filled: 0, blank: 0, inserted: 0, kept: 0 };

    pvTitle.textContent = "이렇게 채워져요";
    pvDesc.textContent = "\"" + tpl.name + "\" 템플릿에 넣으면 아래처럼 돼요. 색과 이름으로 어느 줄이 어떻게 됐는지 보여줘요.";
    pvList.innerHTML = "";
    result.lines.forEach(function (line) {
      var kind = KIND[line.kind] || KIND.kept;
      counts[line.kind] = (counts[line.kind] || 0) + 1;
      var row = doc.createElement("div");
      row.className = "pv-row " + kind.cls;
      var text = doc.createElement("div");
      text.className = "pv-text";
      text.style.paddingLeft = (line.level * 18) + "px";
      text.textContent = line.text;
      var meta = doc.createElement("div");
      meta.className = "pv-meta";
      var tag = doc.createElement("span");
      tag.className = "pv-tag " + kind.cls;
      tag.textContent = kind.tag;
      meta.appendChild(tag);
      if (line.note) {
        var note = doc.createElement("span");
        note.className = "pv-note";
        note.textContent = line.note;
        meta.appendChild(note);
      }
      row.appendChild(text);
      row.appendChild(meta);
      pvList.appendChild(row);
    });

    var parts = [];
    if (counts.filled) parts.push(counts.filled + "줄 채움");
    if (counts.inserted) parts.push(counts.inserted + "줄 끼워 넣음");
    if (counts.blank) parts.push(counts.blank + "줄 비어 있음");
    pvSummary.textContent = parts.join(" · ") + (counts.blank ? ". 비어 있는 곳은 적용한 뒤 Tab으로 이어서 채울 수 있어요." : "");

    var decided = false;
    function finish(handler) {
      return function () {
        decided = true;
        preview.close();
        if (handler) handler(result);
      };
    }
    pvApply.textContent = cfg.applyLabel;
    pvApply.onclick = finish(cfg.onApply);
    pvAlt.hidden = !cfg.altLabel;
    pvAlt.textContent = cfg.altLabel || "";
    pvAlt.onclick = finish(cfg.onAlt);
    // Esc / backdrop: same as the alternative, so nothing the user brought in is lost.
    preview.onclose = function () {
      if (!decided && cfg.onAlt) cfg.onAlt(result);
    };
    if (dialog.open) dialog.close();
    preview.showModal();
  }

  Array.prototype.forEach.call(dialog.querySelectorAll("[data-close-dialog]"), function (btn) {
    btn.addEventListener("click", function () { dialog.close(); });
  });
  dialog.addEventListener("click", function (e) { if (e.target === dialog) dialog.close(); });

  CN.newFlow = {
    open: open, deliver: deliver, fillEditor: fillEditor,
    close: function () { if (dialog.open) dialog.close(); }
  };
})(window);
