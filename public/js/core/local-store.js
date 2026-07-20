// ===== Local Conversation Store (Guest Users) =====
// Stores conversations in localStorage for unauthenticated users.
// Provides the same API shape as AgentAPI conversation methods.
// Authenticated users still use the server-side DB store.

const STORAGE_KEY = "dubu_local_conversations";

// ── Helpers ──

function generateId() {
  return crypto.randomUUID?.() || "conv_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
}

function loadAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveAll(convs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(convs));
  } catch (e) {
    // localStorage full — silently fail
    console.warn("LocalStore: failed to save, storage may be full");
  }
}

// ── Public API ──

window.LocalStore = {
  /** List all conversations, newest first */
  async listConversations() {
    const convs = loadAll();
    return convs
      .sort((a, b) => b.updated - a.updated)
      .map(function(c) {
        return {
          id: c.id,
          title: c.title || "New Chat",
          model: c.model || null,
          created: c.created,
          updated: c.updated,
          msgCount: (c.messages || []).length,
          preview:
            c.messages && c.messages.length > 0 && c.messages[c.messages.length - 1]?.content
              ? c.messages[c.messages.length - 1].content.slice(0, 80)
              : "",
        };
      });
  },

  /** Get a single conversation with full messages */
  async getConversation(id) {
    const convs = loadAll();
    return convs.find(function(c) { return c.id === id; }) || null;
  },

  /** Create a new conversation */
  async createConversation(title, model) {
    const id = generateId();
    const now = Date.now();
    const convo = {
      id: id,
      title: title || "New Chat",
      model: model || null,
      messages: [],
      created: now,
      updated: now,
    };
    const convs = loadAll();
    convs.push(convo);
    saveAll(convs);
    return convo;
  },

  /** Add a message to a conversation */
  async addMessage(convoId, message) {
    const convs = loadAll();
    var found = false;
    for (var i = 0; i < convs.length; i++) {
      if (convs[i].id === convoId) {
        var c = convs[i];
        c.messages.push({
          role: message.role,
          content: message.content,
          model: message.model || null,
          timestamp: Date.now(),
        });
        c.updated = Date.now();
        // Auto-generate title from first user message
        if (c.messages.length === 1 && message.role === "user") {
          c.title = message.content.slice(0, 50) + (message.content.length > 50 ? "..." : "");
        } else if (c.title === "New Chat" && message.role === "user") {
          c.title = message.content.slice(0, 50) + (message.content.length > 50 ? "..." : "");
        }
        found = true;
        break;
      }
    }
    if (!found) return null;
    saveAll(convs);
    return convs[i];
  },

  /** Delete a conversation */
  async deleteConversation(id) {
    var convs = loadAll();
    convs = convs.filter(function(c) { return c.id !== id; });
    saveAll(convs);
  },

  /** Generate a title for a conversation using its messages */
  async generateTitle(conversationId) {
    var convo = await this.getConversation(conversationId);
    if (!convo || !convo.messages || convo.messages.length === 0) return null;
    // Use the first user message content as the title
    var firstUser = convo.messages.find(function(m) { return m.role === "user"; });
    if (!firstUser) return null;
    var title = firstUser.content.slice(0, 50);
    if (firstUser.content.length > 50) title += "...";
    // Update the stored conversation's title
    var convs = loadAll();
    for (var i = 0; i < convs.length; i++) {
      if (convs[i].id === conversationId) {
        convs[i].title = title;
        break;
      }
    }
    saveAll(convs);
    return title;
  },
};
