// ===== Export Options =====
(function() {
  window.toggleExportDropdown = function() {
    var dropdown = document.getElementById("exportDropdown");
    var btn = document.getElementById("exportBtn");
    var isOpen = dropdown.classList.contains("open");
    document.querySelectorAll(".export-dropdown").forEach(function(d) { d.classList.remove("open"); });
    if (!isOpen) {
      dropdown.classList.add("open");
      btn.setAttribute("aria-expanded", "true");
      setTimeout(function() {
        document.addEventListener("click", closeExportDropdown, { once: true });
      }, 0);
    } else {
      btn.setAttribute("aria-expanded", "false");
    }
  };

  function closeExportDropdown(e) {
    var dropdown = document.getElementById("exportDropdown");
    var btn = document.getElementById("exportBtn");
    var wrapper = document.querySelector(".export-wrapper");
    if (!wrapper.contains(e.target)) {
      dropdown.classList.remove("open");
      btn.setAttribute("aria-expanded", "false");
    }
  }

  window.exportAsJSON = function() {
    var data = {
      conversation: {
        id: currentConversationId,
        title: document.querySelector(".topbar-model-label")?.textContent || "Conversation",
        exported: new Date().toISOString(),
      },
      messages: agentHistory.map(function(msg) {
        return { role: msg.role, content: msg.content, timestamp: msg.timestamp || null };
      }),
    };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "dubu-conversation-" + Date.now() + ".json";
    a.click();
    URL.revokeObjectURL(url);
    showToast("Exported as JSON", "success", 2000);
  };

  window.copyConversationToClipboard = async function() {
    var text = agentHistory.map(function(msg) {
      var role = msg.role === "user" ? "You" : "Dubu AI";
      return "**" + role + ":**\n" + msg.content;
    }).join("\n\n---\n\n");
    try {
      await navigator.clipboard.writeText(text);
      showToast("Conversation copied to clipboard", "success", 2000);
    } catch (e) {
      showToast("Failed to copy to clipboard", "error");
    }
  };

  document.addEventListener("keydown", function(e) {
    if (e.key === "Escape") {
      document.querySelectorAll(".export-dropdown").forEach(function(d) { d.classList.remove("open"); });
      var btn = document.getElementById("exportBtn");
      if (btn) btn.setAttribute("aria-expanded", "false");
    }
  });
})();
