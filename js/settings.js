(function (root) {
  "use strict";
  var CN = root.CN = root.CN || {};
  var markers = CN.markers;

  // Preferences: which marker Tab/Enter use at each indent level, and whether a drag reorder
  // renumbers its siblings. They live in the store so they sync with the account like lists do.
  var LEVELS = 3; // first level, second level, third level and deeper
  var SAMPLE_WORD = "일지";

  function defaults() { return { markers: ["dot", "paren", "paren"], renumber: true }; }

  // Fills gaps and drops unknown values, so an old or hand-edited saved copy can't break typing.
  function normalize(raw) {
    var s = defaults();
    if (raw && Array.isArray(raw.markers)) {
      for (var i = 0; i < LEVELS; i++) {
        var id = raw.markers[i];
        if (markers.STYLES.some(function (st) { return st.id === id; })) s.markers[i] = id;
      }
    }
    if (raw && typeof raw.renumber === "boolean") s.renumber = raw.renumber;
    return s;
  }

  function get() { return normalize(CN.store.settings); }

  function set(patch) {
    var next = get();
    if (patch.markers) next.markers = patch.markers.slice(0, LEVELS);
    if (typeof patch.renumber === "boolean") next.renumber = patch.renumber;
    CN.store.saveSettings(next);
  }

  // Style id for a line indented `width` columns (4 columns = one level).
  function styleFor(width) {
    return get().markers[Math.min(Math.floor(width / 4), LEVELS - 1)];
  }

  function markerLevelOf(line) { return markers.levelOfMarker(line, get().markers); }

  // ---------- dialog ----------

  function optionLabel(id) {
    return id === "none" ? "번호 없음" : markers.sample(id) + SAMPLE_WORD;
  }

  function previewText() {
    var m = get().markers;
    var rows = [
      markers.sample(m[0], 1) + SAMPLE_WORD,
      markers.sample(m[0], 2) + SAMPLE_WORD,
      "    " + markers.sample(m[1], 1) + SAMPLE_WORD,
      "    " + markers.sample(m[1], 2) + SAMPLE_WORD,
      "        " + markers.sample(m[2], 1) + SAMPLE_WORD
    ];
    return rows.join("\n");
  }

  var refreshDialog = function () {};

  function init() {
    var doc = root.document;
    var dialog = doc.getElementById("settings-dialog");
    var open = doc.getElementById("btn-settings");
    if (!dialog || !open) return;
    var selects = [0, 1, 2].map(function (i) { return doc.getElementById("marker-level-" + i); });
    var elRenumber = doc.getElementById("setting-renumber");
    var elPreview = doc.getElementById("marker-preview");

    selects.forEach(function (select) {
      markers.STYLES.forEach(function (st) {
        var option = doc.createElement("option");
        option.value = st.id;
        option.textContent = optionLabel(st.id);
        select.appendChild(option);
      });
    });

    // Also called when settings arrive from another device while the dialog is open.
    function show() {
      var now = get();
      selects.forEach(function (select, i) { select.value = now.markers[i]; });
      elRenumber.checked = now.renumber;
      elPreview.textContent = previewText();
    }
    refreshDialog = function () { if (dialog.open) show(); };

    selects.forEach(function (select) {
      select.addEventListener("change", function () {
        set({ markers: selects.map(function (s) { return s.value; }) });
        elPreview.textContent = previewText();
      });
    });
    elRenumber.addEventListener("change", function () { set({ renumber: elRenumber.checked }); });

    open.addEventListener("click", function () {
      show();
      dialog.showModal();
    });
    Array.prototype.forEach.call(dialog.querySelectorAll("[data-close-dialog]"), function (btn) {
      btn.addEventListener("click", function () { dialog.close(); });
    });
    dialog.addEventListener("click", function (e) {
      if (e.target === dialog) dialog.close(); // backdrop click
    });
  }

  CN.settings = {
    init: init,
    get: get,
    set: set,
    styleFor: styleFor,
    markerLevelOf: markerLevelOf,
    refresh: function () { refreshDialog(); }
  };
})(window);
