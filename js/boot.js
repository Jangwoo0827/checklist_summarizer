// Runs in <head> before CSS paints: applies the saved theme and marks popup mode.
// Kept as a file (not inline) because Chrome extension pages forbid inline scripts.
(function (root) {
  var html = root.document.documentElement;
  try {
    var savedTheme = root.localStorage.getItem("checklist_note_theme_v1");
    if (savedTheme === "light" || savedTheme === "dark") html.setAttribute("data-theme", savedTheme);
  } catch (e) {}
  if (/[?&]popup=1/.test(root.location.search)) html.classList.add("is-popup");
  if (root.chrome && root.chrome.runtime && root.chrome.runtime.id) html.classList.add("is-extension");
})(window);
