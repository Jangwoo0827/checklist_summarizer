// These two functions run INSIDE the web page the user is looking at (chrome.scripting.executeScript
// runs them there), so each one must be fully self-contained: no references to anything outside
// its own body, only window / document and the chrome.* APIs.
(function (root) {
  "use strict";
  var CN = root.CN = root.CN || {};

  // The text the user has selected on the page ("" when nothing is selected).
  CN.pageSelection = function pageSelection() {
    try {
      return String(window.getSelection ? window.getSelection() : "");
    } catch (e) {
      return "";
    }
  };

  // Click-to-pick mode. The page gets a small bar on top; hovering outlines the block under the
  // pointer, a click picks it (click again to unpick, several can be picked), Enter or the bar's
  // button finishes, Esc cancels. The picked text is saved to chrome.storage.local for the popup to
  // import the next time it opens (clicking the page closes the popup, so it can't be handed over directly).
  CN.pagePick = function pagePick() {
    if (window.__cnPicking) return;
    window.__cnPicking = true;

    var GREEN = "#2f9e7d";
    var INLINE = /^(A|SPAN|B|I|U|EM|STRONG|FONT|SMALL|LABEL|SUP|SUB|IMG|CODE|MARK|BR|S|DEL)$/;
    var picked = [];
    var hover = null;
    var climbed = [];      // what ArrowUp passed through, so ArrowDown can go back
    var saved = [];        // [element, outline, outlineOffset] to restore on exit

    // ---- the bar ----
    var ui = document.createElement("div");
    ui.setAttribute("style", "all:initial;position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;" +
      "display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:12px;background:#23261f;color:#ede9df;" +
      "font:600 14px/1.4 -apple-system,'Malgun Gothic','Apple SD Gothic Neo',sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.4);" +
      "max-width:calc(100vw - 24px);box-sizing:border-box;cursor:default");
    var label = document.createElement("span");
    label.setAttribute("style", "all:initial;font:inherit;color:inherit");
    var hint = document.createElement("span");
    hint.setAttribute("style", "all:initial;font:500 12px/1.4 sans-serif;color:#9c9a8c");
    hint.textContent = "↑ 범위 넓히기 · Enter 완료 · Esc 취소";
    function button(text, primary) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = text;
      b.setAttribute("style", "all:initial;font:700 13px/1 sans-serif;cursor:pointer;padding:8px 12px;border-radius:8px;" +
        (primary ? "background:#86c2ab;color:#12211b" : "background:#3a3d33;color:#ede9df"));
      return b;
    }
    var done = button("가져오기", true);
    var cancel = button("취소", false);
    ui.appendChild(label);
    ui.appendChild(hint);
    ui.appendChild(done);
    ui.appendChild(cancel);
    document.documentElement.appendChild(ui);

    function refreshLabel(message) {
      label.textContent = message || (picked.length
        ? "선택했어요 (" + picked.length + "개) · 더 고르거나 완료를 누르세요"
        : "가져올 글을 클릭하세요");
    }
    refreshLabel();

    // ---- highlighting ----
    function outline(el, css) {
      if (!saved.some(function (s) { return s[0] === el; })) saved.push([el, el.style.outline, el.style.outlineOffset]);
      el.style.outline = css;
      el.style.outlineOffset = "-2px";
    }
    function restore(el) {
      for (var i = 0; i < saved.length; i++) {
        if (saved[i][0] === el) { el.style.outline = saved[i][1]; el.style.outlineOffset = saved[i][2]; saved.splice(i, 1); return; }
      }
    }
    function paint(el) {
      if (picked.indexOf(el) >= 0) outline(el, "3px solid " + GREEN);
      else if (el === hover) outline(el, "2px dashed " + GREEN);
      else restore(el);
    }
    function setHover(el) {
      var old = hover;
      hover = el;
      if (old && old !== el) paint(old);
      if (el) paint(el);
    }
    function blockOf(el) {
      while (el && el !== document.body && el !== document.documentElement && INLINE.test(el.tagName)) el = el.parentElement;
      return el === document.documentElement ? null : el;
    }

    // ---- events (capture phase, so the page's own handlers and links don't fire) ----
    function onMove(e) {
      if (ui.contains(e.target)) return;
      climbed = [];
      setHover(blockOf(e.target));
    }
    function onClick(e) {
      if (ui.contains(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      // The hovered block (which ArrowUp may have widened), unless the click landed somewhere else.
      var el = hover && hover.contains(e.target) ? hover : blockOf(e.target);
      if (!el) return;
      var at = picked.indexOf(el);
      if (at >= 0) picked.splice(at, 1);
      else picked.push(el);
      paint(el);
      refreshLabel();
    }
    function swallow(e) {
      if (!ui.contains(e.target)) { e.preventDefault(); e.stopPropagation(); }
    }
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); exit(); }
      else if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); finish(); }
      else if (e.key === "ArrowUp" && hover && hover.parentElement && hover.parentElement !== document.body) {
        e.preventDefault();
        climbed.push(hover);
        setHover(hover.parentElement);
      } else if (e.key === "ArrowDown" && climbed.length) {
        e.preventDefault();
        setHover(climbed.pop());
      }
    }
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("mousedown", swallow, true);
    document.addEventListener("mouseup", swallow, true);
    document.addEventListener("keydown", onKey, true);

    function exit() {
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("mousedown", swallow, true);
      document.removeEventListener("mouseup", swallow, true);
      document.removeEventListener("keydown", onKey, true);
      saved.slice().forEach(function (s) { restore(s[0]); });
      if (ui.parentNode) ui.parentNode.removeChild(ui);
      window.__cnPicking = false;
    }

    function notice(message) {
      var n = document.createElement("div");
      n.textContent = message;
      n.setAttribute("style", "all:initial;position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;" +
        "padding:12px 18px;border-radius:12px;background:#23261f;color:#ede9df;font:600 14px/1.4 sans-serif;" +
        "box-shadow:0 10px 30px rgba(0,0,0,.4)");
      document.documentElement.appendChild(n);
      setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, 4500);
    }

    function finish() {
      if (!picked.length) { refreshLabel("먼저 가져올 글을 클릭하세요"); return; }
      // In page order, and never both a block and something inside it.
      var els = picked.slice().sort(function (a, b) { return a.compareDocumentPosition(b) & 4 ? -1 : 1; });
      els = els.filter(function (el) { return !els.some(function (o) { return o !== el && o.contains(el); }); });
      var text = els.map(function (el) { return (el.innerText || el.textContent || "").replace(/ /g, " ").trim(); })
        .filter(Boolean).join("\n");
      exit();
      if (!text) { notice("선택한 곳에 글이 없어요"); return; }
      var ok = "가져왔어요! 확장 프로그램 아이콘을 누르면 체크리스트 입력 화면에 채워져 있어요.";
      try {
        chrome.storage.local.set({ cnPending: { text: text, url: location.href, at: Date.now() } }, function () { notice(ok); });
      } catch (err) {
        // No storage access: fall back to the clipboard so the text isn't lost.
        try { navigator.clipboard.writeText(text); notice("복사했어요. 체크리스트 입력 칸에 붙여넣으세요."); } catch (e2) { notice("글을 저장하지 못했어요."); }
      }
    }
    done.addEventListener("click", finish);
    cancel.addEventListener("click", exit);
  };
})(typeof window !== "undefined" ? window : globalThis);
