(function (root) {
  "use strict";
  var CN = root.CN = root.CN || {};
  var util = CN.util;
  var parser = CN.parser;
  var store = CN.store;

  var CARET_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

  var elTreeRoot = root.document.getElementById("tree-root");
  var elTitle = root.document.getElementById("detail-title");
  var elBar = root.document.getElementById("detail-bar");
  var elFrac = root.document.getElementById("detail-frac");
  var elPct = root.document.getElementById("detail-pct");
  var elStamp = root.document.getElementById("stamp-done");

  function activeList() { return store.getList(CN.app.activeId()); }

  function render() {
    var list = activeList();
    if (!list) return;
    if (root.document.activeElement !== elTitle) elTitle.value = list.title;

    elTreeRoot.innerHTML = "";
    parser.buildTree(list.lines).forEach(function (node) {
      elTreeRoot.appendChild(renderNode(node, 0, list));
    });

    var p = parser.progress(list.lines, list.checked);
    elBar.style.width = p.pct + "%";
    elFrac.textContent = p.done + " / " + p.total;
    elPct.textContent = p.pct + "%";
    elStamp.hidden = !(p.total > 0 && p.done === p.total);
  }

  function renderNode(node, depth, list) {
    var li = root.document.createElement("li");
    var isLeaf = node.children.length === 0;
    var st = isLeaf ? (list.checked[node.id] ? "true" : "false") : parser.nodeState(node, list.checked);
    var collapsed = !isLeaf && !!list.collapsed[node.id];

    var row = root.document.createElement("div");
    row.className = "item-row";
    row.setAttribute("data-leaf", isLeaf ? "1" : "0");
    row.setAttribute("data-checked", st === "true" ? "true" : "false");
    if (depth > 0) row.style.paddingLeft = (depth * 22) + "px";

    var chk = root.document.createElement("button");
    chk.type = "button";
    chk.className = "chk";
    chk.setAttribute("role", "checkbox");
    chk.setAttribute("aria-checked", st);
    chk.setAttribute("aria-label", node.text);
    chk.addEventListener("click", function () { toggleChecked(list, node); });
    row.appendChild(chk);

    var txt = root.document.createElement("span");
    txt.className = "item-text";
    txt.textContent = node.text;
    txt.addEventListener("click", function () { toggleChecked(list, node); });
    row.appendChild(txt);

    if (!isLeaf) row.appendChild(renderCaret(list, node, collapsed));
    li.appendChild(row);

    if (!isLeaf && !collapsed) {
      var ul = root.document.createElement("ul");
      node.children.forEach(function (child) { ul.appendChild(renderNode(child, depth + 1, list)); });
      li.appendChild(ul);
    }
    return li;
  }

  function renderCaret(list, node, collapsed) {
    var btn = root.document.createElement("button");
    btn.type = "button";
    btn.className = "caret-btn";
    btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
    btn.setAttribute("aria-label", collapsed ? "하위 항목 펼치기" : "하위 항목 접기");
    if (collapsed) {
      var leaves = parser.collectLeafIds(node, []);
      var done = leaves.filter(function (id) { return list.checked[id]; }).length;
      var count = root.document.createElement("span");
      count.className = "num";
      count.textContent = done + "/" + leaves.length;
      btn.appendChild(count);
    }
    btn.insertAdjacentHTML("beforeend", CARET_SVG);
    btn.addEventListener("click", function () {
      if (list.collapsed[node.id]) delete list.collapsed[node.id];
      else list.collapsed[node.id] = true;
      store.commit(list);
      render();
    });
    return btn;
  }

  function toggleChecked(list, node) {
    var leaves = parser.collectLeafIds(node, []);
    var allDone = leaves.length > 0 && leaves.every(function (id) { return list.checked[id]; });
    leaves.forEach(function (id) {
      if (allDone) delete list.checked[id];
      else list.checked[id] = true;
    });
    store.commit(list);
    render();
  }

  function carryOver() {
    var list = activeList();
    if (!list) return;
    var lines = parser.remainingLines(list.lines, list.checked);
    if (!lines.length) { util.toast("남은 항목이 없어요. 다 끝냈어요!"); return; }
    var title = util.todayLabel();
    if (title === list.title) title += " (이어서)";
    var next = { id: util.uid(), title: title, lines: lines, checked: {}, collapsed: {}, createdAt: Date.now() };
    store.addList(next);
    CN.app.openDetail(next.id);
    util.toast("남은 " + parser.progress(lines, {}).total + "개로 새 체크리스트를 만들었어요");
  }

  root.document.getElementById("btn-carry-over").addEventListener("click", carryOver);

  root.document.getElementById("btn-edit-list").addEventListener("click", function () {
    var list = activeList();
    if (list) CN.input.openEdit(list);
  });

  root.document.getElementById("btn-reset").addEventListener("click", function () {
    var list = activeList();
    if (!list || !root.confirm("모든 체크를 초기화할까요?")) return;
    list.checked = {};
    store.commit(list);
    render();
  });

  root.document.getElementById("btn-delete").addEventListener("click", function () {
    var list = activeList();
    if (!list || !root.confirm('"' + list.title + '"을(를) 삭제할까요?')) return;
    store.removeList(list.id);
    CN.app.showList();
  });

  elTitle.addEventListener("input", function () {
    var list = activeList();
    if (!list) return;
    list.title = elTitle.value;
    store.commit(list);
  });
  elTitle.addEventListener("blur", function () {
    var list = activeList();
    if (!list || list.title.trim()) return;
    list.title = util.todayLabel();
    elTitle.value = list.title;
    store.commit(list);
  });

  CN.viewDetail = { render: render };
})(window);
