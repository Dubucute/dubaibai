// ===== Authentication Module =====
(function() {
  window.currentUser = null;

  window.checkAuthStatus = async function () {
    var token = localStorage.getItem("dubu_session_token");
    var email = localStorage.getItem("dubu_user_email");

    if (token && email) {
      try {
        var resp = await fetch("/api/auth/session", {
          headers: { "X-Session-Token": token },
        });
        if (resp.ok) {
          var data = await resp.json();
          if (data.authenticated) {
            window.currentUser = data.user;
            updateAuthUI();
            return;
          }
        }
        localStorage.removeItem("dubu_session_token");
        localStorage.removeItem("dubu_user_email");
        localStorage.removeItem("dubu_user_id");
      } catch (e) {
        window.currentUser = { email: email };
        updateAuthUI();
      }
    }
    updateAuthUI();
  };

  function updateAuthUI() {
    var btnLabel = document.getElementById("authBtnLabel");
    var userName = document.getElementById("sbUserName");
    var userStatus = document.getElementById("sbUserStatus");

    if (window.currentUser) {
      if (btnLabel) btnLabel.textContent = "Account";
      if (userName) userName.textContent = window.currentUser.email || "User";
      if (userStatus) userStatus.textContent = "Signed in";
      loadSidebarProfile();
    } else {
      if (btnLabel) btnLabel.textContent = "Sign In";
      if (userName) userName.textContent = "Guest";
      if (userStatus) userStatus.textContent = "NVIDIA NIM";
      resetSidebarAvatar();
    }
  }

  async function loadSidebarProfile() {
    var token = localStorage.getItem("dubu_session_token");
    if (!token) return;
    try {
      var resp = await fetch("/api/auth/profile", {
        headers: { "X-Session-Token": token },
      });
      if (!resp.ok) return;
      var data = await resp.json();
      var profile = data.profile;

      var displayName = profile.displayName || profile.username;
      var userName = document.getElementById("sbUserName");
      if (userName && displayName) {
        userName.textContent = displayName;
      }

      var avatarEl = document.querySelector(".sb-avatar");
      if (avatarEl && profile.avatarUrl) {
        avatarEl.innerHTML = '<img src="' + escHtml(profile.avatarUrl) + '" alt="Avatar" style="width:100%;height:100%;border-radius:50%;object-fit:cover">';
      } else if (avatarEl) {
        var initial = (displayName || window.currentUser?.email || "?").charAt(0).toUpperCase();
        avatarEl.innerHTML = '<span style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:13px;color:var(--accent)">' + initial + "</span>";
      }
    } catch (e) {
      // Silent — keep default avatar
    }
  }

  function resetSidebarAvatar() {
    var avatarEl = document.querySelector(".sb-avatar");
    if (avatarEl) {
      avatarEl.innerHTML = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="8" stroke="currentColor" stroke-width="1.3"/><circle cx="9" cy="7" r="2.5" stroke="currentColor" stroke-width="1.3"/><path d="M4 15c0-2.8 2.2-5 5-5s5 2.2 5 5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
    }
  }

  window.handleAuthClick = function () {
    if (window.currentUser) {
      window.location.href = "account.html";
    } else {
      window.location.href = "auth.html";
    }
  };

  window.signOut = function () {
    localStorage.removeItem("dubu_session_token");
    localStorage.removeItem("dubu_user_email");
    localStorage.removeItem("dubu_user_id");
    window.currentUser = null;
    updateAuthUI();
    showToast("Signed out", "info", 2000);
  };
})();
