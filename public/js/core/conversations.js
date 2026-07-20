// ===== Conversation Management =====
(function() {
  // ── Load conversation list into sidebar ──
  window.loadConversationList = function () {
    AgentAPI.listConversations()
      .then(function(list) {
        conversations = list;
        renderConversationList();
      })
      .catch(function(e) {
        console.warn("Failed to load conversations:", e.message);
      });
  };

  function renderConversationList() {
    var list = document.getElementById("convList");
    if (!list) return;
    if (conversations.length === 0) {
      list.innerHTML = '<div style="padding:16px 10px;font-size:11px;color:var(--text-muted);text-align:center">No conversations yet</div>';
      return;
    }
    list.innerHTML = conversations.map(function(conv) {
      var active = conv.id === currentConversationId ? "active" : "";
      var title = conv.title || "New Chat";
      return '<div class="conv-item ' + active + '" onclick="selectConversation(\'' + conv.id + '\')" title="' + escHtml(title) + '"><span class="conv-item-title">' + escHtml(title) + '</span><button class="conv-item-del" onclick="event.stopPropagation();deleteConversation(\'' + conv.id + '\')" title="Delete conversation" aria-label="Delete ' + escHtml(title) + '"><svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg></button></div>';
    }).join("");
  }

  window.selectConversation = async function (id, silent) {
    if (silent === undefined) silent = false;
    try {
      var convo = await AgentAPI.getConversation(id);
      if (!convo) {
        if (!silent) showToast("Conversation not found", "error");
        // Clean up stale localStorage ID so it's not retried
        if (localStorage.getItem("dubu_last_convo_id") === id) {
          localStorage.removeItem("dubu_last_convo_id");
        }
        return;
      }
      currentConversationId = convo.id;
      localStorage.setItem("dubu_last_convo_id", convo.id);

      // Restore messages
      agentHistory = (convo.messages || []).map(function(m) {
        return { role: m.role, content: m.content, timestamp: m.timestamp };
      });

      // Rebuild DOM
      var container = document.getElementById("agentMessages");
      container.innerHTML = "";
      for (var i = 0; i < agentHistory.length; i++) {
        var msg = agentHistory[i];
        var author = msg.role === "user" ? "You" : "Dubu AI";
        addMessage(msg.role, msg.content, author);
      }
      if (agentHistory.length === 0) showWelcomeMessage();
      scrollToBottom(container);
      renderConversationList();
    } catch (e) {
      if (!silent) showToast("Failed to load conversation", "error");
    }
  };

  window.deleteConversation = async function (id) {
    try {
      await AgentAPI.deleteConversation(id);
      if (currentConversationId === id) {
        currentConversationId = null;
        localStorage.removeItem("dubu_last_convo_id");
      }
      loadConversationList();
      showToast("Conversation deleted", "info", 1500);
    } catch (e) {
      showToast("Failed to delete", "error");
    }
  };

  // ── Create new conversation ──
  window.createNewConversation = async function () {
    try {
      var convo = await AgentAPI.createConversation("New Chat");
      currentConversationId = convo.id;
      localStorage.setItem("dubu_last_convo_id", convo.id);
      return convo;
    } catch (e) {
      console.warn("Failed to create conversation:", e.message);
      return null;
    }
  };

  // ── Auto-generate conversation title ──
  window.autoGenerateTitle = function () {
    if (agentHistory.length !== 2) return;
    if (!currentConversationId) return;
    AgentAPI.generateConversationTitle(currentConversationId)
      .then(function(title) {
        if (title) loadConversationList();
      })
      .catch(function() {
        // Silent — not critical
      });
  };

  // ── Show welcome message ──
  window.showWelcomeMessage = function () {
    var container = document.getElementById("agentMessages");
    container.innerHTML = '<div class="msg msg-agent"><div class="msg-avatar"><svg width="28" height="28" viewBox="0 0 28 28" fill="none"><rect width="28" height="28" rx="8" fill="currentColor" opacity="0.15"/><path d="M14 6L8 10v8l6 4 6-4v-8l-6-4z" fill="currentColor" opacity="0.4"/><circle cx="14" cy="14" r="3.5" fill="currentColor"/></svg></div><div class="msg-body"><div class="msg-name">Dubu AI</div><div class="msg-content"><p style="font-size:15px;font-weight:600;margin-bottom:8px">Welcome to Dubu AI</p><p style="color:var(--text-secondary);margin-bottom:12px">I use the full NVIDIA NIM model catalog with automatic model selection and fallback. Just tell me what you need.</p><div class="capabilities"><div class="cap">Chat &amp; Q&A</div><div class="cap">Code &amp; Programming</div><div class="cap">Image Generation</div><div class="cap">Vision Analysis</div><div class="cap">Deep Reasoning</div><div class="cap">Translation</div><div class="cap">Web Search</div><div class="cap">File Analysis</div></div></div></div></div>';
  };

  // ── Sidebar conversation search ──
  window.filterConversations = function (query) {
    var q = query.toLowerCase().trim();
    var items = document.querySelectorAll(".conv-item");
    items.forEach(function(item) {
      var title = item.querySelector(".conv-item-title");
      if (title) {
        var text = title.textContent.toLowerCase();
        item.style.display = (!q || text.indexOf(q) !== -1) ? "" : "none";
      }
    });
  };

  // ── Auto-restore conversation on load ──
  window.autoRestoreConversation = async function () {
    var lastId = localStorage.getItem("dubu_last_convo_id");
    if (lastId) {
      try {
        await selectConversation(lastId, true);
        // Only return if the conversation was actually loaded
        if (currentConversationId) return;
      } catch (e) {
        localStorage.removeItem("dubu_last_convo_id");
      }
    }
    // Fallback: load the most recent from list
    try {
      var list = await AgentAPI.listConversations();
      if (list.length > 0) {
        await selectConversation(list[0].id, true);
      }
    } catch (e) {
      // No conversations yet
    }
  };

  // ── Save current conversation (export as Markdown) ──
  window.exportConversation = function () {
    var text = agentHistory.map(function(msg) {
      var role = msg.role === "user" ? "You" : "Dubu AI";
      return "## " + role + "\n\n" + msg.content;
    }).join("\n\n---\n\n");
    var blob = new Blob([text], { type: "text/markdown" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "dubu-conversation-" + Date.now() + ".md";
    a.click();
    URL.revokeObjectURL(url);
    showToast("Exported as Markdown", "success", 2000);
  };
})();
