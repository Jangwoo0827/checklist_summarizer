(function (root) {
  "use strict";
  var CN = root.CN = root.CN || {};
  var store = CN.store;

  var doc = root.document;
  var views = {
    list: doc.getElementById("view-list"),
    input: doc.getElementById("view-input"),
    detail: doc.getElementById("view-detail")
  };
  var current = "list";
  var activeId = null;

  function show(name) {
    current = name;
    Object.keys(views).forEach(function (key) { views[key].hidden = key !== name; });
    root.scrollTo(0, 0);
  }

  function showList() {
    activeId = null;
    CN.viewList.render();
    show("list");
  }

  function openDetail(id) {
    activeId = id;
    CN.viewDetail.render();
    show("detail");
  }

  // Re-render whatever is on screen after data changed underneath (e.g. from another device).
  function refresh() {
    CN.viewList.render();
    if (current === "detail") {
      if (store.getList(activeId)) CN.viewDetail.render();
      else showList();
    }
  }

  CN.app = {
    activeId: function () { return activeId; },
    showList: showList,
    showInput: function () { show("input"); },
    openDetail: openDetail,
    refresh: refresh
  };

  store.load();
  CN.theme.init();
  CN.account.init();
  CN.sync.onRemoteChange(refresh);
  doc.getElementById("btn-new").addEventListener("click", CN.input.openNew);
  doc.getElementById("btn-back").addEventListener("click", showList);
  // In the extension popup, offer to open the same page full-size in a tab.
  var expand = doc.getElementById("btn-expand");
  if (doc.documentElement.classList.contains("is-popup") && root.chrome && root.chrome.tabs) {
    expand.hidden = false;
    expand.addEventListener("click", function () {
      root.chrome.tabs.create({ url: root.chrome.runtime.getURL("index.html") });
      root.close();
    });
  }
  showList();
  CN.sync.init();
})(window);
