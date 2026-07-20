// ===== Toast Notification System =====
(function() {
  window.showToast = function (message, type, duration) {
    if (type === undefined) type = "info";
    if (duration === undefined) duration = 4000;
    var container = document.getElementById("toastContainer");
    var icons = {
      success:
        '<svg class="toast-icon" viewBox="0 0 16 16" fill="none"><path d="M5 8l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      error:
        '<svg class="toast-icon" viewBox="0 0 16 16" fill="none"><path d="M6 6l4 4M10 6l-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
      warning:
        '<svg class="toast-icon" viewBox="0 0 16 16" fill="none"><path d="M8 5v3M8 10.5v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
      info: '<svg class="toast-icon" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.3"/></svg>',
    };
    var toast = document.createElement("div");
    toast.className = "toast " + type;
    toast.innerHTML = (icons[type] || icons.info) + '<span class="toast-message">' + escHtml(message) + '</span><button class="toast-close" onclick="dismissToast(this.parentElement)">\u2715</button>';
    container.appendChild(toast);
    if (duration > 0) setTimeout(function() { dismissToast(toast); }, duration);
  };

  window.dismissToast = function (toast) {
    if (!toast || toast.classList.contains("removing")) return;
    toast.classList.add("removing");
    setTimeout(function() { toast.remove(); }, 200);
  };
})();
