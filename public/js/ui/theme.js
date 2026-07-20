// ===== Theme System =====
(function() {
  var THEMES = ["dark", "light", "midnight", "slate", "emerald", "ruby"];

  window.selectTheme = function (name) {
    if (THEMES.indexOf(name) === -1) return;
    applyTheme(name);
    document.querySelectorAll(".theme-option").forEach(function(el) {
      el.classList.toggle("active", el.dataset.theme === name);
    });
    showToast("Theme: " + name.charAt(0).toUpperCase() + name.slice(1), "success", 2000);
  };

  window.toggleTheme = function () {
    var current = state.get("theme");
    var idx = THEMES.indexOf(current);
    selectTheme(THEMES[(idx + 1) % THEMES.length]);
  };

  function applyTheme(name) {
    var app = document.getElementById("app");
    THEMES.forEach(function(t) {
      document.body.classList.remove("theme-" + t);
      if (app) app.classList.remove("theme-" + t);
      document.documentElement.classList.remove("theme-" + t);
    });
    document.body.classList.add("theme-" + name);
    if (app) app.classList.add("theme-" + name);
    document.documentElement.classList.add("theme-" + name);
    state.set("theme", name);
  }

  window.syncThemePicker = function () {
    var current = state.get("theme") || "dark";
    document.querySelectorAll(".theme-option").forEach(function(el) {
      el.classList.toggle("active", el.dataset.theme === current);
    });
  };
})();
