(function (root) {
  "use strict";
  var CN = root.CN = root.CN || {};
  var util = CN.util;
  var parser = CN.parser;
  var store = CN.store;

  var PREVIEW_COUNT = 3;
  var DONE_OPEN_KEY = "checklist_note_done_open_v1";

  var doc = root.document;
  var elCardList = doc.getElementById("card-list");
  var elEmptyState = doc.getElementById("empty-state");
  var elDoneSection = doc.getElementById("done-section");
  var elDoneToggle = doc.getElementById("done-toggle");
  var elDoneCount = doc.getElementById("done-count");
  var elDoneList = doc.getElementById("done-list");

  var doneOpen = util.readString(DONE_OPEN_KEY) === "1";

  function render() {
    var active = [];
    var done = [];
    store.lists
      .slice()
      .sort(function (a, b) { return b.createdAt - a.createdAt; })
      .forEach(function (list) {
        var p = parser.progress(list.lines, list.checked);
        (p.total > 0 && p.done === p.total ? done : active).push({ list: list, progress: p });
      });

    elCardList.innerHTML = "";
    active.forEach(function (e) { elCardList.appendChild(renderCard(e.list, e.progress)); });

    elEmptyState.hidden = active.length > 0;
    elEmptyState.textContent = done.length
      ? "진행 중인 체크리스트가 없어요. 다 끝냈네요!"
      : "아직 만든 체크리스트가 없어요. 숙제나 할 일 목록을 붙여넣으면 바로 체크리스트로 바꿔드려요.";

    elDoneSection.hidden = done.length === 0;
    elDoneCount.textContent = done.length;
    elDoneToggle.setAttribute("aria-expanded", String(doneOpen));
    elDoneList.hidden = !doneOpen;
    elDoneList.innerHTML = "";
    done.forEach(function (e) { elDoneList.appendChild(renderCard(e.list, e.progress)); });
  }

  function renderCard(list, p) {
    var complete = p.total > 0 && p.done === p.total;
    var card = doc.createElement("div");
    card.className = "card" + (complete ? " is-done" : "");
    card.tabIndex = 0;
    card.setAttribute("role", "button");

    var top = doc.createElement("div");
    top.className = "card-top";
    var title = doc.createElement("span");
    title.className = "card-title";
    title.textContent = list.title;
    var date = doc.createElement("span");
    date.className = "card-date num";
    date.textContent = new Date(list.createdAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
    top.appendChild(title);
    top.appendChild(date);
    card.appendChild(top);

    var upcoming = parser.unfinishedLeafTexts(list.lines, list.checked, PREVIEW_COUNT);
    if (upcoming.length) {
      var preview = doc.createElement("ul");
      preview.className = "card-preview";
      upcoming.forEach(function (text) {
        var li = doc.createElement("li");
        li.textContent = text;
        preview.appendChild(li);
      });
      card.appendChild(preview);
    }

    var track = doc.createElement("div");
    track.className = "bar-track";
    var fill = doc.createElement("div");
    fill.className = "bar-fill";
    fill.style.width = p.pct + "%";
    track.appendChild(fill);
    card.appendChild(track);

    var bottom = doc.createElement("div");
    bottom.className = "card-bottom";
    var frac = doc.createElement("span");
    frac.className = "card-frac num";
    frac.textContent = p.done + " / " + p.total;
    var pct = doc.createElement("span");
    if (complete) {
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

  elDoneToggle.addEventListener("click", function () {
    doneOpen = !doneOpen;
    util.writeString(DONE_OPEN_KEY, doneOpen ? "1" : null);
    elDoneToggle.setAttribute("aria-expanded", String(doneOpen));
    elDoneList.hidden = !doneOpen;
  });

  CN.viewList = { render: render };
})(window);
