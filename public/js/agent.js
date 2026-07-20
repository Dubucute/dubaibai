// ===== Unified Agent API Client =====
// Communicates with the orchestrator server using SSE streaming
// With improved error handling, timeout protection, and connection management

// ── Auth Helper: Get session token for API requests ──
function getSessionToken() {
  return localStorage.getItem("dubu_session_token") || "";
}

// ── Common headers helper ──
function authHeaders(extra = {}) {
  const token = getSessionToken();
  if (token) {
    return { ...extra, "X-Session-Token": token };
  }
  return extra;
}

window.AgentAPI = {
  /**
   * Send a request to the unified agent orchestrator.
   * @param {string} message - User message
   * @param {Array} history - Previous messages
   * @param {object} context - Additional context (images, docs, etc.)
   * @param {object} opts - Options (model, onUpdate, onDone, onError)
   * @returns {AbortController} - To cancel the request
   */
  send(message, history = [], context = {}, opts = {}) {
    const controller = new AbortController();
    const model = opts.model || state.get("agentModel") || undefined;

    const body = {
      message,
      history,
      context: {
        ...context,
        hasImage: context.hasImage || false,
        imageData: context.imageData || null,
      },
      model: model || undefined,
      stream: true,
    };

    // Use a timeout to prevent hanging connections
    const timeout = setTimeout(() => {
      controller.abort();
      opts.onError?.("Request timed out. The server took too long to respond.");
    }, 120000); // 2 minute timeout

    const apiKey = state.get("apiKey") || "";

    fetch("/api/agent/process", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "X-API-Key": apiKey } : {}),
        ...authHeaders(),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
      .then(async (resp) => {
        clearTimeout(timeout);

        if (!resp.ok) {
          let errMsg;
          try {
            const errText = await resp.text();
            errMsg = errText.slice(0, 200);
          } catch {
            errMsg = resp.statusText;
          }

          if (resp.status === 401 || resp.status === 403) {
            opts.onError?.("Authentication failed. Please check your API key in Settings.");
          } else if (resp.status === 429) {
            opts.onError?.("Rate limit exceeded. Please wait a moment and try again.");
          } else if (resp.status >= 500) {
            opts.onError?.(`Server error (${resp.status}). The server may be experiencing issues.`);
          } else {
            opts.onError?.(`Request failed (${resp.status}): ${errMsg}`);
          }
          return;
        }

        // Read the SSE stream
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let streamActive = true;

        const readStream = async () => {
          while (streamActive) {
            try {
              const { done, value } = await reader.read();
              if (done) {
                streamActive = false;
                break;
              }

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                if (!line.startsWith("data: ")) continue;
                const raw = line.slice(6);
                if (!raw.trim()) continue;

                try {
                  const data = JSON.parse(raw);
                  if (data.type === "done") {
                    streamActive = false;
                    // onDone will be called by the .then() handler
                    return;
                  }
                  opts.onUpdate?.(data);
                } catch (e) {
                  // Skip malformed JSON lines
                }
              }
            } catch (e) {
              streamActive = false;
              if (e.name !== "AbortError") {
                opts.onError?.(e.message || "Stream read error");
              }
              return;
            }
          }
        };

        readStream().then(() => {
          opts.onDone?.();
        });
      })
      .catch((e) => {
        clearTimeout(timeout);
        if (e.name === "AbortError") {
          // Timeout or manual abort - error already handled above
          return;
        }
        if (e.message?.includes("Failed to fetch") || e.message?.includes("NetworkError")) {
          opts.onError?.(
            "Unable to connect to server. Make sure the server is running on port 3033.",
          );
        } else {
          opts.onError?.(e.message || "An unexpected error occurred");
        }
      });

    return controller;
  },

  /**
   * Execute a single tool directly (bypass agent)
   */
  async executeTool(name, args) {
    const apiKey = state.get("apiKey") || "";
    const resp = await fetch(`/api/tools/${name}/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "X-API-Key": apiKey } : {}),
        ...authHeaders(),
      },
      body: JSON.stringify({ args }),
    });

    if (!resp.ok) {
      const err = await resp.text().catch(() => resp.statusText);
      throw new Error(`Tool execution failed: ${err.slice(0, 200)}`);
    }
    return await resp.json();
  },

  /**
   * Simple chat completion (non-agent, with auto-fallback)
   */
  async chat(model, messages, opts = {}) {
    const apiKey = state.get("apiKey") || "";
    const resp = await fetch("/api/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "X-API-Key": apiKey } : {}),
        ...authHeaders(),
      },
      body: JSON.stringify({
        model: model || undefined,
        messages,
        max_tokens: opts.maxTokens || 4096,
        temperature: opts.temperature || state.get("temperature"),
        stream: opts.stream || false,
      }),
    });

    if (!resp.ok) {
      const err = await resp.text().catch(() => resp.statusText);
      throw new Error(`Chat API error: ${err.slice(0, 200)}`);
    }

    if (opts.stream) {
      return resp.body;
    }
    return await resp.json();
  },

  /**
   * Generate contextual follow-up questions using AI.
   */
  async getSuggestions(responseText) {
    try {
      const resp = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ response: responseText }),
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      return data.suggestions || null;
    } catch (e) {
      console.warn("Suggestion fetch failed:", e.message);
      return null;
    }
  },

  /**
   * Detect intent of a message (without sending to agent)
   */
  async detectIntent(message, context = {}) {
    const resp = await fetch("/api/detect", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ message, context }),
    });

    if (!resp.ok) {
      throw new Error("Intent detection failed");
    }
    return await resp.json();
  },

  // ── Conversation CRUD ──
  async listConversations() {
    const r = await fetch("/api/conversations", {
      headers: authHeaders(),
    });
    if (!r.ok) throw new Error("Failed to list conversations");
    return (await r.json()).conversations || [];
  },

  async getConversation(id) {
    const r = await fetch(`/api/conversations/${id}`, {
      headers: authHeaders(),
    });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error("Conversation not found");
    return (await r.json()).conversation;
  },

  async createConversation(title, model) {
    const r = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ title, model }),
    });
    if (!r.ok) throw new Error("Failed to create conversation");
    return (await r.json()).conversation;
  },

  async deleteConversation(id) {
    const r = await fetch(`/api/conversations/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (!r.ok) throw new Error("Failed to delete conversation");
  },

  async forkConversation(id) {
    const r = await fetch(`/api/conversations/${id}/fork`, {
      method: "POST",
      headers: authHeaders(),
    });
    if (!r.ok) throw new Error("Failed to fork conversation");
    return (await r.json()).conversation;
  },

  async conversationAddMessage(id, message) {
    const r = await fetch(`/api/conversations/${id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        role: message.role,
        content: message.content,
        model: message.model,
      }),
    });
    if (r.status === 404) {
      // Conversation was lost (serverless in-memory expired) — create a new one
      console.warn(`Conversation ${id} not found — creating new conversation`);
      try {
        const convo = await this.createConversation(message.content?.slice(0, 50) || "New Chat");
        if (convo && convo.id) {
          // Guard: another concurrent call may have already fixed the ID
          var newId = window.currentConversationId !== id
            ? window.currentConversationId
            : convo.id;
          window.currentConversationId = newId;
          localStorage.setItem("dubu_last_convo_id", newId);
          // Retry saving this message to the new conversation
          const retry = await fetch(`/api/conversations/${newId}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify({
              role: message.role,
              content: message.content,
              model: message.model,
            }),
          });
          if (retry.ok) return {};
        }
      } catch (e) {
        console.warn("Failed to recover from stale conversation:", e.message);
      }
      // Fallback: clear stale reference so next message creates fresh
      if (!window.currentConversationId || window.currentConversationId === id) {
        window.currentConversationId = null;
        localStorage.removeItem("dubu_last_convo_id");
      }
      // Message saving is best-effort on serverless — don't throw
      return {};
    }
    if (!r.ok) throw new Error("Failed to add message");
    return {};
  },

  /**
   * Generate a meaningful title for a conversation using AI.
   * Call this after the first exchange is complete.
   */
  async generateConversationTitle(conversationId) {
    try {
      const resp = await fetch(`/api/conversations/${conversationId}/generate-title`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
      });
      if (!resp.ok) {
        console.warn("Title generation endpoint returned", resp.status);
        return null;
      }
      const data = await resp.json();
      return data.title || null;
    } catch (e) {
      console.warn("Title generation failed:", e.message);
      return null;
    }
  },

  // ── Documents ──
  async listDocuments() {
    const r = await fetch("/api/documents", {
      headers: authHeaders(),
    });
    if (!r.ok) throw new Error("Failed to list documents");
    return (await r.json()).documents || [];
  },

  async uploadDocument(file) {
    const fd = new FormData();
    fd.append("file", file);
    const token = getSessionToken();
    const r = await fetch("/api/documents/upload" + (token ? `?token=${encodeURIComponent(token)}` : ""), {
      method: "POST",
      body: fd,
    });
    if (!r.ok) throw new Error("Failed to upload document");
    return (await r.json()).document;
  },

  async addTextDocument(name, content) {
    const r = await fetch("/api/documents/text", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ name, content }),
    });
    if (!r.ok) throw new Error("Failed to add document");
    return (await r.json()).document;
  },

  async deleteDocument(id) {
    const r = await fetch(`/api/documents/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (!r.ok) throw new Error("Failed to delete document");
  },

  // ── Filesystem ──
  async writeFile(filepath, content, overwrite = false) {
    const r = await fetch("/api/filesystem/write", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ filepath, content, overwrite }),
    });
    const data = await r.json();
    if (!data.success) throw new Error(data.error || "Failed to write file");
    return data;
  },

  async createFolder(folderpath) {
    const r = await fetch("/api/filesystem/create-dir", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ folderpath }),
    });
    const data = await r.json();
    if (!data.success) throw new Error(data.error || "Failed to create folder");
    return data;
  },

  async listFiles(dirpath = ".", maxDepth = 2) {
    const r = await fetch("/api/filesystem/list", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ dirpath, maxDepth }),
    });
    return await r.json();
  },

  async readFile(filepath) {
    const r = await fetch("/api/filesystem/read", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ filepath }),
    });
    const data = await r.json();
    if (!data.success) throw new Error(data.error || "Failed to read file");
    return data;
  },
};
