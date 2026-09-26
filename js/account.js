(function (root) {
  "use strict";
  var CN = root.CN = root.CN || {};
  var util = CN.util;
  var sync = CN.sync;

  var doc = root.document;
  var dialog = doc.getElementById("account-dialog");
  var elChipLabel = doc.getElementById("account-label");
  var elDot = doc.getElementById("sync-dot");
  var elFooter = doc.getElementById("footer-note");
  var secSignedOut = doc.getElementById("account-signed-out");
  var secSignedIn = doc.getElementById("account-signed-in");
  var secUnconfigured = doc.getElementById("account-unconfigured");
  var elIdInput = doc.getElementById("account-id-input");
  var elError = doc.getElementById("account-error");
  var elLogin = doc.getElementById("account-login");
  var elCurrentId = doc.getElementById("account-current-id");
  var elLastSync = doc.getElementById("account-last-sync");

  function timeLabel(ts) {
    if (!ts) return "아직 동기화한 적 없음";
    return new Date(ts).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  }

  function refresh() {
    var s = sync.state;
    var signedIn = sync.active();
    elChipLabel.textContent = signedIn ? s.userId : "동기화";
    elDot.setAttribute("data-status", signedIn ? s.status : "off");

    if (!sync.configured()) elFooter.textContent = "체크 상태는 이 브라우저에 자동 저장돼요";
    else if (!signedIn) elFooter.textContent = "지금은 이 브라우저에만 저장돼요 · 오른쪽 위 ‘동기화’로 다른 기기와 연결할 수 있어요";
    else if (s.status === "syncing") elFooter.textContent = "동기화 중…";
    else if (s.status === "error") elFooter.textContent = "동기화하지 못했어요 · 바뀐 내용은 이 기기에 저장돼 있고 연결되면 다시 올라가요";
    else elFooter.textContent = "‘" + s.userId + "’ 아이디로 동기화됨 · " + timeLabel(s.lastSync);

    elCurrentId.textContent = s.userId || "";
    elLastSync.textContent = s.status === "error" && s.error
      ? "마지막 오류: " + s.error.message
      : "마지막 동기화: " + timeLabel(s.lastSync);
  }

  function open() {
    secUnconfigured.hidden = sync.configured();
    secSignedOut.hidden = !sync.configured() || sync.active();
    secSignedIn.hidden = !sync.active();
    elError.hidden = true;
    refresh();
    dialog.showModal();
    if (!secSignedOut.hidden) elIdInput.focus();
  }

  function login() {
    elError.hidden = true;
    elLogin.disabled = true;
    elLogin.textContent = "연결하는 중...";
    sync.login(elIdInput.value).then(function () {
      dialog.close();
      util.toast("‘" + sync.state.userId + "’ 아이디로 연결했어요");
      CN.app.refresh();
    }).catch(function (err) {
      elError.textContent = err instanceof TypeError
        ? "동기화 서버에 연결할 수 없어요. 인터넷 연결을 확인해주세요."
        : err.message;
      elError.hidden = false;
    }).finally(function () {
      elLogin.disabled = false;
      elLogin.textContent = "연결하기";
    });
  }

  function logout() {
    var ok = root.confirm("이 기기에서 체크리스트를 지우고 연결을 끊을까요?\n서버에는 그대로 남아서, 같은 아이디로 다시 연결하면 돌아와요.");
    if (!ok) return;
    sync.logout();
    dialog.close();
    CN.app.showList();
    util.toast("연결을 끊었어요");
  }

  function init() {
    doc.getElementById("btn-account").addEventListener("click", open);
    elLogin.addEventListener("click", login);
    elIdInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); login(); }
    });
    doc.getElementById("account-logout").addEventListener("click", logout);
    doc.getElementById("account-sync-now").addEventListener("click", function () {
      sync.syncNow().then(refresh);
    });
    Array.prototype.forEach.call(dialog.querySelectorAll("[data-close-dialog]"), function (btn) {
      btn.addEventListener("click", function () { dialog.close(); });
    });
    dialog.addEventListener("click", function (e) {
      if (e.target === dialog) dialog.close(); // backdrop click
    });
    sync.onStatus(refresh);
    refresh();
  }

  CN.account = { init: init, isOpen: function () { return dialog.open; } };
})(window);
