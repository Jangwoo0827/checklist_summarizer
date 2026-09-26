(function (root) {
  "use strict";
  var CN = root.CN = root.CN || {};
  var parser = CN.parser;
  var store = CN.store;

  var PREVIEW_COUNT = 3;

  var elCardList = root.document.getElementById("card-list");
  var elEmptyState = root.document.getElementById("empty-state");

  function render() {
    elCardList.innerHTML = "";
    elEmptyState.hidden = store.lists.length > 0;
    store.lists
      .slice()
      .sort(function (a, b) { return b.createdAt - a.createdAt; })
      .forEach(function (list) { elCardList.appendChild(renderCard(list)); });
  }

  function renderCard(list) {
    var p = parser.progress(list.lines, list.checked);

    var card = root.document.createElement("div");
    card.className = "card";
    card.tabIndex = 0;
    card.setAttribute("role", "button");

    var top = root.document.createElement("div");
    top.className = "card-top";
    var title = root.document.createElement("span");
    title.className = "card-title";
    title.textContent = list.title;
    var date = root.document.createElement("span");
    date.className = "card-date num";
    date.textContent = new Date(list.createdAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
    top.appendChild(title);
    top.appendChild(date);
    card.appendChild(top);

    var upcoming = parser.unfinishedLeafTexts(list.lines, list.checked, PREVIEW_COUNT);
    if (upcoming.length) {
      var preview = root.document.createElement("ul");
      preview.className = "card-preview";
      upcoming.forEach(function (text) {
        var li = root.document.createElement("li");
        li.textContent = text;
        preview.appendChild(li);
      });
      card.appendChild(preview);
    }

    var track = root.document.createElement("div");
    track.className = "bar-track";
    var fill = root.document.createElement("div");
    fill.className = "bar-fill";
    fill.style.width = p.pct + "%";
    track.appendChild(fill);
    card.appendChild(track);

    var bottom = root.document.createElement("div");
    bottom.className = "card-bottom";
    var frac = root.document.createElement("span");
    frac.className = "card-frac num";
    frac.textContent = p.done + " / " + p.total;
    var pct = root.document.createElement("span");
    if (p.total > 0 && p.done === p.total) {
      pct.className = "card-done";
      pct.textContent = "완료 ✓";
    } else {
      pct.className = "card-pct num";
      pct.textContent = p.pct + "%";
    }
    bottom.appendChild(frac);
    bottom.appendChild(pct);
    card.appendChild(bottom);

    card.addEventListener("click", function () { CN.app.openDetail(list.id); });
    card.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); CN.app.openDetail(list.id); }
    });
    return card;
  }

  CN.viewList = { render: render };
})(window);
