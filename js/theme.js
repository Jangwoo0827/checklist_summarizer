(function (root) {
  "use strict";
  var CN = root.CN = root.CN || {};
  var util = CN.util;

  var THEME_KEY = "checklist_note_theme_v1";
  var ORDER = ["system", "light", "dark"];
  var LABELS = { system: "시스템 설정 따름", light: "라이트 모드", dark: "다크 모드" };
  var ICONS = {
    system: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor" stroke="none"/></svg>',
    light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>'
  };

  var mode = "system";
  var button = null;

  function apply() {
    if (mode === "system") root.document.documentElement.removeAttribute("data-theme");
    else root.document.documentElement.setAttribute("data-theme", mode);
    if (!button) return;
    button.innerHTML = ICONS[mode];
    button.title = LABELS[mode] + " · 눌러서 바꾸기";
    button.setAttribute("aria-label", "테마: " + LABELS[mode]);
  }

  function init() {
    var saved = util.readString(THEME_KEY);
    mode = ORDER.indexOf(saved) !== -1 ? saved : "system";
    button = root.document.getElementById("btn-theme");
    apply();
    button.addEventListener("click", function () {
      mode = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
      util.writeString(THEME_KEY, mode === "system" ? null : mode);
      apply();
      util.toast(LABELS[mode]);
    });
  }

  CN.theme = { init: init };
})(window);
