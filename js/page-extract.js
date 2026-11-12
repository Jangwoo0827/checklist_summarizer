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

  // Lifts copy protection so the text can be selected with the mouse again, like the "Allow Copy"
  // extensions do. Runs in the page's own JavaScript world (chrome.scripting world "MAIN"), because
  // handlers the page assigned (document.oncopy = ...) are invisible to an isolated content script.
  //   * forces user-select: text on everything,
  //   * clears onselectstart / oncopy / oncontextmenu / ... handlers (properties and attributes),
  //   * stops copy / cut / selectstart / contextmenu / dragstart events before the page's own handlers see them,
  //   * switches off empty, transparent layers laid over the text (the page's "shield").
  CN.pageUnlock = function pageUnlock() {
    if (window.__cnUnlocked) return { already: true };
    window.__cnUnlocked = true;

    var style = document.createElement("style");
    style.textContent = "*, *::before, *::after { -webkit-user-select: text !important; user-select: text !important; " +
      "-webkit-touch-callout: default !important; }";
    (document.head || document.documentElement).appendChild(style);

    var HANDLERS = ["onselectstart", "oncopy", "oncut", "onpaste", "oncontextmenu", "ondragstart", "onselect", "ondrag"];
    function clear(target) {
      HANDLERS.forEach(function (name) {
        try { target[name] = null; } catch (e) {}
        if (target.removeAttribute) target.removeAttribute(name);
      });
    }
    [window, document, document.documentElement, document.body].forEach(function (t) { if (t) clear(t); });
    Array.prototype.forEach.call(document.querySelectorAll("[" + HANDLERS.join("],[") + "]"), clear);

    // Our listeners run first (capture phase on window) and keep the page's handlers from seeing these.
    ["copy", "cut", "selectstart", "contextmenu", "dragstart", "select"].forEach(function (type) {
      window.addEventListener(type, function (e) { e.stopImmediatePropagation(); }, true);
    });

    // Shields: elements with no text of their own that sit on top of text. Probe a grid of points.
    function hasText(el) { return (el.innerText || el.textContent || "").trim().length > 0; }
    var shields = 0;
    var COLS = 8, ROWS = 10;
    for (var pass = 0; pass < 3; pass++) {            // a page can stack several layers
      var found = false;
      for (var r = 0; r < ROWS; r++) {
        for (var c = 0; c < COLS; c++) {
          var x = (c + 0.5) * window.innerWidth / COLS;
          var y = (r + 0.5) * window.innerHeight / ROWS;
          var stack = document.elementsFromPoint(x, y);
          for (var i = 0; i < stack.length; i++) {
            var el = stack[i];
            if (el === document.documentElement || el === document.body) break;
            if (hasText(el)) break;                    // reached real content: nothing above it to remove
            if (el.tagName === "IMG" || el.tagName === "CANVAS" || el.tagName === "VIDEO" || el.tagName === "SVG" ||
                el.tagName === "svg" || el.tagName === "IFRAME" || el.tagName === "INPUT" || el.tagName === "TEXTAREA") continue;
            var below = stack.slice(i + 1).some(function (other) { return other !== document.documentElement && other !== document.body && hasText(other); });
            if (!below) continue;                      // an empty box with no text under it is harmless
            el.style.setProperty("pointer-events", "none", "important");
            shields++;
            found = true;
            break;
          }
        }
      }
      if (!found) break;
    }

    var note = document.createElement("div");
    note.textContent = "선택·복사 방지를 풀었어요. 가져올 글을 드래그해서 선택한 뒤, 확장 프로그램 아이콘을 눌러 \"페이지\"를 고르세요.";
    note.setAttribute("style", "all:initial;position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;" +
      "max-width:min(560px,calc(100vw - 24px));box-sizing:border-box;padding:12px 18px;border-radius:12px;background:#23261f;" +
      "color:#ede9df;font:600 14px/1.5 sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.4);pointer-events:none");
    document.documentElement.appendChild(note);
    setTimeout(function () { if (note.parentNode) note.parentNode.removeChild(note); }, 7000);
    return { already: false, shields: shields };
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
    // Copy-protected pages often lay an empty, transparent layer over their text. When the element under
    // the pointer holds no text, look at what is stacked beneath it.
    function hasText(el) { return (el.innerText || el.textContent || "").trim().length > 0; }
    function targetAt(e) {
      var el = e.target;
      if (el && el.nodeType === 1 && !hasText(el) && document.elementsFromPoint) {
        var stack = document.elementsFromPoint(e.clientX, e.clientY);
        for (var i = 0; i < stack.length; i++) {
          if (!ui.contains(stack[i]) && hasText(stack[i])) { el = stack[i]; break; }
        }
      }
      return blockOf(el);
    }
    function blockOf(el) {
      while (el && el !== document.body && el !== document.documentElement && INLINE.test(el.tagName)) el = el.parentElement;
      return el === document.documentElement ? null : el;
    }

    // ---- events (capture phase, so the page's own handlers and links don't fire) ----
    function onMove(e) {
      if (ui.contains(e.target)) return;
      climbed = [];
      setHover(targetAt(e));
    }
    function onClick(e) {
      if (ui.contains(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      // The hovered block (which ArrowUp may have widened), unless the click landed somewhere else.
      var under = targetAt(e);
      var el = hover && under && hover.contains(under) ? hover : under;
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

  // Region mode, for pages whose text can't be selected or read at all (text drawn as an image or canvas,
  // copy protection). The user drags a rectangle over what they want; the extension's background worker
  // screenshots the visible tab, the crop is saved as an image, and the popup reads it with OCR the next
  // time it opens.
  CN.pageRegion = function pageRegion() {
    if (window.__cnPicking) return;
    window.__cnPicking = true;

    var GREEN = "#2f9e7d";
    var layer = document.createElement("div");
    layer.setAttribute("style", "all:initial;position:fixed;inset:0;z-index:2147483646;cursor:crosshair;background:rgba(0,0,0,.18)");
    var box = document.createElement("div");
    box.setAttribute("style", "all:initial;position:fixed;display:none;z-index:2147483647;pointer-events:none;box-sizing:border-box;" +
      "border:2px solid " + GREEN + ";background:rgba(47,158,125,.18)");
    var bar = document.createElement("div");
    bar.textContent = "가져올 영역을 드래그하세요 · Esc 취소";
    bar.setAttribute("style", "all:initial;position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;" +
      "padding:10px 16px;border-radius:12px;background:#23261f;color:#ede9df;font:600 14px/1.4 sans-serif;" +
      "box-shadow:0 10px 30px rgba(0,0,0,.4);pointer-events:none");
    document.documentElement.appendChild(layer);
    document.documentElement.appendChild(box);
    document.documentElement.appendChild(bar);

    var x0 = 0, y0 = 0, dragging = false, rect = null;

    function notice(message) {
      var n = document.createElement("div");
      n.textContent = message;
      n.setAttribute("style", "all:initial;position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;" +
        "padding:12px 18px;border-radius:12px;background:#23261f;color:#ede9df;font:600 14px/1.4 sans-serif;" +
        "box-shadow:0 10px 30px rgba(0,0,0,.4)");
      document.documentElement.appendChild(n);
      setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, 4500);
    }
    function cleanup() {
      document.removeEventListener("keydown", onKey, true);
      [layer, box, bar].forEach(function (el) { if (el.parentNode) el.parentNode.removeChild(el); });
    }
    function exit() { cleanup(); window.__cnPicking = false; }

    function draw(x1, y1) {
      rect = { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
      box.style.display = "block";
      box.style.left = rect.x + "px";
      box.style.top = rect.y + "px";
      box.style.width = rect.w + "px";
      box.style.height = rect.h + "px";
    }
    layer.addEventListener("mousedown", function (e) {
      e.preventDefault();
      dragging = true;
      x0 = e.clientX;
      y0 = e.clientY;
      draw(x0, y0);
    });
    layer.addEventListener("mousemove", function (e) { if (dragging) draw(e.clientX, e.clientY); });
    layer.addEventListener("mouseup", function (e) {
      if (!dragging) return;
      dragging = false;
      draw(e.clientX, e.clientY);
      if (rect.w < 12 || rect.h < 12) { box.style.display = "none"; rect = null; return; }   // a stray click
      capture(rect);
    });
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); exit(); }
    }
    document.addEventListener("keydown", onKey, true);

    function capture(r) {
      // Take our own overlay out of the picture, give the page two frames to repaint, then screenshot.
      cleanup();
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          setTimeout(function () {
            try {
              chrome.runtime.sendMessage({ type: "cn-capture" }, function (reply) {
                if (!reply || !reply.dataUrl) { exit(); notice("화면을 캡처하지 못했어요. 확장 프로그램을 새로고침한 뒤 다시 해보세요."); return; }
                var img = new Image();
                img.onload = function () {
                  // The screenshot is in device pixels, the rectangle in CSS pixels.
                  var sx = img.naturalWidth / window.innerWidth;
                  var sy = img.naturalHeight / window.innerHeight;
                  var canvas = document.createElement("canvas");
                  canvas.width = Math.max(1, Math.round(r.w * sx));
                  canvas.height = Math.max(1, Math.round(r.h * sy));
                  canvas.getContext("2d").drawImage(img, r.x * sx, r.y * sy, r.w * sx, r.h * sy, 0, 0, canvas.width, canvas.height);
                  var image = canvas.toDataURL("image/png");
                  chrome.storage.local.set({ cnPending: { image: image, url: location.href, at: Date.now() } }, function () {
                    exit();
                    notice("가져왔어요! 확장 프로그램 아이콘을 누르면 영역의 글자를 읽어서 채워 드려요.");
                  });
                };
                img.onerror = function () { exit(); notice("캡처한 화면을 열지 못했어요."); };
                img.src = reply.dataUrl;
              });
            } catch (err) {
              exit();
              notice("이 페이지에서는 화면을 캡처할 수 없어요.");
            }
          }, 80);
        });
      });
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
