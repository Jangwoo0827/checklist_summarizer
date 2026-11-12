(function (root) {
  "use strict";
  var CN = root.CN = root.CN || {};

  // Drag-to-reorder for the checklist tree. An item (with its children) can be moved among its
  // siblings by its handle; the nesting never changes. Pointer events make it work with a mouse,
  // a finger or a pen. The handle also takes ArrowUp/ArrowDown for keyboard users.
  var EDGE_PX = 70;
  var SCROLL_STEP = 14;
  var MIN_DRAG_PX = 4; // a tiny wobble is a click, not a drag

  var doc = root.document;

  function siblingsOf(li) {
    return Array.prototype.filter.call(li.parentElement.children, function (el) { return el.tagName === "LI"; });
  }

  // attach(handle, li, onMove): onMove(id, beforeId) is called with the id of the sibling the item
  // should now sit before, or null for the end of the group.
  function attach(handle, li, onMove) {
    handle.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      start(e, handle, li, onMove);
    });

    handle.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      var sibs = siblingsOf(li);
      var i = sibs.indexOf(li);
      var beforeId;
      if (e.key === "ArrowUp") {
        if (i === 0) return;
        beforeId = sibs[i - 1].getAttribute("data-id");
      } else {
        if (i === sibs.length - 1) return;
        beforeId = i + 2 < sibs.length ? sibs[i + 2].getAttribute("data-id") : null;
      }
      e.preventDefault();
      onMove(li.getAttribute("data-id"), beforeId);
    });
  }

  function start(e, handle, li, onMove) {
    var startY = e.clientY;
    var startScroll = root.scrollY;
    var pointerY = e.clientY;
    var moved = false;
    var frame = 0;
    var target = null;
    var group = li.parentElement;

    var line = doc.createElement("div");
    line.className = "drop-line";
    line.hidden = true;
    doc.body.appendChild(line);

    try { handle.setPointerCapture(e.pointerId); } catch (err) {}

    // Where the item would land: before the first other sibling whose middle is below the pointer.
    function findTarget() {
      var others = siblingsOf(li).filter(function (el) { return el !== li; });
      for (var i = 0; i < others.length; i++) {
        var r = others[i].getBoundingClientRect();
        if (pointerY < r.top + r.height / 2) return { before: others[i], y: r.top };
      }
      var last = others.length ? others[others.length - 1].getBoundingClientRect() : li.getBoundingClientRect();
      return { before: null, y: last.bottom };
    }

    function update() {
      var dy = pointerY - startY + (root.scrollY - startScroll);
      if (!moved && Math.abs(dy) < MIN_DRAG_PX) return;
      if (!moved) {
        moved = true;
        li.classList.add("is-dragging");
        doc.body.classList.add("is-sorting");
      }
      li.style.transform = "translateY(" + dy + "px)";
      target = findTarget();
      var box = group.getBoundingClientRect();
      line.hidden = false;
      line.style.top = target.y - 1 + "px";
      line.style.left = box.left + "px";
      line.style.width = box.width + "px";
    }

    // Keep scrolling while the pointer rests near the top or bottom edge.
    function autoScroll() {
      frame = 0;
      if (!moved) return;
      var step = pointerY < EDGE_PX ? -SCROLL_STEP : pointerY > root.innerHeight - EDGE_PX ? SCROLL_STEP : 0;
      if (step) {
        root.scrollBy(0, step);
        update();
        frame = root.requestAnimationFrame(autoScroll);
      }
    }

    function onMoveEvent(ev) {
      pointerY = ev.clientY;
      update();
      if (moved && !frame) frame = root.requestAnimationFrame(autoScroll);
    }

    function finish(commit) {
      handle.removeEventListener("pointermove", onMoveEvent);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onCancel);
      if (frame) root.cancelAnimationFrame(frame);
      try { handle.releasePointerCapture(e.pointerId); } catch (err) {}
      line.remove();
      li.classList.remove("is-dragging");
      li.style.transform = "";
      doc.body.classList.remove("is-sorting");
      if (!commit || !moved || !target) return;
      // Dropping where it already sits is not a move.
      if (target.before === li.nextElementSibling) return;
      onMove(li.getAttribute("data-id"), target.before ? target.before.getAttribute("data-id") : null);
    }
    function onUp() { finish(true); }
    function onCancel() { finish(false); }

    handle.addEventListener("pointermove", onMoveEvent);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onCancel);
  }

  CN.dragSort = { attach: attach };
})(window);
