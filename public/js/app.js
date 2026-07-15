// ===== Dubu AI — DeepSeek-style Frontend =====
// Features: file upload, web search toggle, deep think toggle,
// collapsible reasoning blocks, clean message rendering

let currentAgentRequest = null;
let agentHistory = [];
let currentConversationId = null;
let conversations = [];
let webSearchEnabled = false;
let deepThinkEnabled = false;
let attachedFiles = [];
let imageGallery = []; // { url, prompt, model, timestamp }
let loadedModels = []; // Dynamically fetched from server /api/models

// ── Model icon & group helpers ──
function getModelIcon(modelId, info) {
  return "";
}

function getModelGroup(info) {
  if (!info || !info.capabilities) return "Other";
  const caps = info.capabilities;
  if (caps.includes("vision") || caps.includes("image_understanding") || caps.includes("video"))
    return "Vision";
  if (caps.includes("text_to_image") || caps.includes("image_generation")) return "Image Gen";
  if (caps.includes("embedding") || caps.includes("retrieval")) return "Embeddings";
  if (
    caps.includes("content_safety") ||
    caps.includes("jailbreak_detect") ||
    caps.includes("topic_control")
  )
    return "Safety";
  if (caps.includes("code") && !caps.includes("chat")) return "Code";
  if (caps.includes("finance")) return "Finance";
  if (caps.includes("medical")) return "Medical";
  if (caps.includes("writing") || caps.includes("creative")) return "Creative";
  return (info.quality || 0) >= 7 ? "Smart" : "Fast";
}

// ── Toast Notifications ──
window.showToast = function (message, type = "info", duration = 4000) {
  const container = document.getElementById("toastContainer");
  const icons = {
    success:
      '<svg class="toast-icon" viewBox="0 0 16 16" fill="none"><path d="M5 8l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    error:
      '<svg class="toast-icon" viewBox="0 0 16 16" fill="none"><path d="M6 6l4 4M10 6l-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    warning:
      '<svg class="toast-icon" viewBox="0 0 16 16" fill="none"><path d="M8 5v3M8 10.5v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    info: '<svg class="toast-icon" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.3"/></svg>',
  };
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `${icons[type] || icons.info}<span class=\"toast-message\">${escHtml(message)}</span><button class="toast-close" onclick="dismissToast(this.parentElement)">✕</button>`;
  container.appendChild(toast);
  if (duration > 0) setTimeout(() => dismissToast(toast), duration);
};

window.dismissToast = function (toast) {
  if (!toast || toast.classList.contains("removing")) return;
  toast.classList.add("removing");
  setTimeout(() => toast.remove(), 200);
};

// ── Mobile Sidebar ──
window.toggleMobileSidebar = function () {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("mobileSidebarOverlay");
  const hamburger = document.getElementById("hamburgerBtn");
  const isOpen = sidebar.classList.toggle("mobile-open");
  overlay.classList.toggle("visible", isOpen);
  hamburger.classList.toggle("active", isOpen);
  document.body.style.overflow = isOpen ? "hidden" : "";
};

function closeMobileSidebar() {
  const sidebar = document.getElementById("sidebar");
  if (sidebar.classList.contains("mobile-open")) window.toggleMobileSidebar();
}

// ── Settings Panel ──
window.switchPanel = function (name) {
  if (name === "settings") {
    document.getElementById("settingsOverlay").classList.add("visible");
    document.getElementById("settingsPanel").classList.add("open");
    window.loadSettings?.();
    syncThemePicker();
  }
};

window.closeSettings = function () {
  document.getElementById("settingsOverlay").classList.remove("visible");
  document.getElementById("settingsPanel").classList.remove("open");
};

// ── Theme System ──
const THEMES = ["dark", "light", "midnight", "slate", "emerald", "ruby"];

window.selectTheme = function (name) {
  if (!THEMES.includes(name)) return;
  applyTheme(name);
  document
    .querySelectorAll(".theme-option")
    .forEach((el) => el.classList.toggle("active", el.dataset.theme === name));
  showToast(`Theme: ${name.charAt(0).toUpperCase() + name.slice(1)}`, "success", 2000);
};

window.toggleTheme = function () {
  const current = state.get("theme");
  const idx = THEMES.indexOf(current);
  selectTheme(THEMES[(idx + 1) % THEMES.length]);
};

function applyTheme(name) {
  const app = document.getElementById("app");
  // Remove all old theme classes — preserves non-theme classes
  THEMES.forEach(t => {
    document.body.classList.remove(`theme-${t}`);
    if (app) app.classList.remove(`theme-${t}`);
    document.documentElement.classList.remove(`theme-${t}`);
  });
  // Add the new one — elements always have a theme class, no flash
  document.body.classList.add(`theme-${name}`);
  if (app) app.classList.add(`theme-${name}`);
  document.documentElement.classList.add(`theme-${name}`);
  state.set("theme", name);
}

function syncThemePicker() {
  const current = state.get("theme") || "dark";
  document
    .querySelectorAll(".theme-option")
    .forEach((el) => el.classList.toggle("active", el.dataset.theme === current));
}

// ── Web Search Toggle ──
window.toggleWebSearch = function () {
  webSearchEnabled = !webSearchEnabled;
  document.getElementById("webSearchBtn").classList.toggle("active", webSearchEnabled);
  showToast(webSearchEnabled ? "Web Search ON" : "Web Search OFF", "info", 1500);
};

// ── Deep Think Toggle ──
window.toggleDeepThink = function () {
  deepThinkEnabled = !deepThinkEnabled;
  document.getElementById("deepThinkBtn").classList.toggle("active", deepThinkEnabled);
  showToast(deepThinkEnabled ? "Deep Reasoning ON" : "Deep Reasoning OFF", "info", 1500);
};

// ── File Upload ──
// ── Auth ──
let currentUser = null;

async function checkAuthStatus() {
  const token = localStorage.getItem("dubu_session_token");
  const email = localStorage.getItem("dubu_user_email");

  if (token && email) {
    // Verify the session with the server
    try {
      const resp = await fetch("/api/auth/session", {
        headers: { "X-Session-Token": token },
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.authenticated) {
          currentUser = data.user;
          updateAuthUI();
          return;
        }
      }
      // Token invalid — clear it
      localStorage.removeItem("dubu_session_token");
      localStorage.removeItem("dubu_user_email");
      localStorage.removeItem("dubu_user_id");
    } catch (e) {
      // Server might be down; keep cached info
      currentUser = { email };
      updateAuthUI();
    }
  }
  updateAuthUI();
}

function updateAuthUI() {
  const btnLabel = document.getElementById("authBtnLabel");
  const userName = document.getElementById("sbUserName");
  const userStatus = document.getElementById("sbUserStatus");
  if (!btnLabel || !userName || !userStatus) return;

  if (currentUser) {
    btnLabel.textContent = "Account";
    userName.textContent = currentUser.email || "User";
    userStatus.textContent = "Signed in";
  } else {
    btnLabel.textContent = "Sign In";
    userName.textContent = "Guest";
    userStatus.textContent = "NVIDIA NIM";
  }
}

window.handleAuthClick = function () {
  if (currentUser) {
    // Show a small account menu or sign out
    if (confirm("Sign out from " + currentUser.email + "?")) {
      signOut();
    }
  } else {
    window.location.href = "auth.html";
  }
};

function signOut() {
  localStorage.removeItem("dubu_session_token");
  localStorage.removeItem("dubu_user_email");
  localStorage.removeItem("dubu_user_id");
  currentUser = null;
  updateAuthUI();
  showToast("Signed out", "info", 2000);
}

window.attachFile = function () {
  document.getElementById("fileInput").click();
};

function setupFileInput() {
  const input = document.getElementById("fileInput");
  input.onchange = (e) => {
    const files = Array.from(e.target.files);
    for (const file of files) {
      if (file.size > 20 * 1024 * 1024) {
        showToast(`${file.name} is too large (max 20MB)`, "error");
        continue;
      }
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          attachedFiles.push({
            name: file.name,
            size: file.size,
            type: "image",
            data: ev.target.result,
            file,
          });
          renderAttachments();
        };
        reader.readAsDataURL(file);
      } else {
        // Read file content for text-based documents
        const reader = new FileReader();
        reader.onload = (ev) => {
          attachedFiles.push({
            name: file.name,
            size: file.size,
            type: "document",
            data: ev.target.result,
            file,
            content: ev.target.result,
          });
          renderAttachments();
        };
        reader.readAsText(file);
      }
    }
    input.value = "";
  };
}

function renderAttachments() {
  const bar = document.getElementById("attachBar");
  const list = document.getElementById("attachList");
  if (attachedFiles.length === 0) {
    bar.style.display = "none";
    return;
  }
  bar.style.display = "block";
  list.innerHTML = attachedFiles
    .map((f, i) => {
      const sizeStr = f.size < 1024 ? f.size + " B" : (f.size / 1024).toFixed(1) + " KB";
      const imgHtml =
        f.type === "image" ? `<img src="${f.data}" class="attach-chip-img" alt="">` : "";
      const iconHtml = !imgHtml
        ? `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M4 2h4l3 3v6.5a.5.5 0 01-.5.5h-6A.5.5 0 014 11.5V2z" stroke="currentColor" stroke-width="1.2"/><path d="M8 2v3h3" stroke="currentColor" stroke-width="1.2"/></svg>`
        : "";
      return `<div class="attach-chip">${imgHtml || iconHtml}<span class="attach-chip-name">${escHtml(f.name)}</span><span class="attach-chip-size">${sizeStr}</span><button class="attach-chip-remove" onclick="removeAttachment(${i})">✕</button></div>`;
    })
    .join("");
}

window.removeAttachment = function (idx) {
  attachedFiles.splice(idx, 1);
  renderAttachments();
};

// ── Drag & Drop ──
function setupDragDrop() {
  const area = document.getElementById("chatMessages");
  area.addEventListener("dragover", (e) => {
    e.preventDefault();
    area.style.background = "var(--hover-bg)";
  });
  area.addEventListener("dragleave", () => {
    area.style.background = "";
  });
  area.addEventListener("drop", (e) => {
    e.preventDefault();
    area.style.background = "";
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    const dt = new DataTransfer();
    for (const f of files) dt.items.add(f);
    document.getElementById("fileInput").files = dt.files;
    document.getElementById("fileInput").dispatchEvent(new Event("change"));
  });
}

// ── Send message ──
window.sendToAgent = async function () {
  const input = document.getElementById("agentInput");
  const msg = input.value.trim();
  if (!msg || currentAgentRequest) return;
  input.value = "";
  input.style.height = "auto";

  const btn = document.getElementById("agentSendBtn");
  btn.disabled = true;

  // Show stop button in place of send button
  const stopBtn = document.getElementById("agentStopBtn");
  if (stopBtn) {
    btn.style.display = "none";
    stopBtn.style.display = "flex";
  }

  // ── Context object ──
  // Define BEFORE /imagine parsing so the /imagine block can write to it
  const context = { hasImage: false, hasDocuments: false };

  // Check for /imagine command
  let isImagineCommand = false;
  let imaginePrompt = msg;
  let imagineModel = null;
  if (/^\/imagine\s+/i.test(msg)) {
    isImagineCommand = true;
    let rest = msg.replace(/^\/imagine\s+/i, "").trim();

    // Parse flags: --model <name> --width <num> --height <num> --steps <num>
    const modelAliases = {
      flux: "black-forest-labs/flux.1-dev",
      dev: "black-forest-labs/flux.1-dev",
      schnell: "black-forest-labs/flux.1-schnell",
      fast: "black-forest-labs/flux.1-schnell",
      klein: "black-forest-labs/flux.2-klein-4b",
      sd3: "stabilityai/stable-diffusion-3-medium",
      medium: "stabilityai/stable-diffusion-3-medium",
      sdxl: "stabilityai/stable-diffusion-xl",
      xl: "stabilityai/stable-diffusion-xl",
      gemma: "google/diffusiongemma-26b-a4b-it",
      diffusiongemma: "google/diffusiongemma-26b-a4b-it",
    };

    // --model or -m flag
    const modelMatch = rest.match(/--model\s+([a-z0-9_.-]+)|-m\s+([a-z0-9_.-]+)/i);
    const modelKey = (modelMatch?.[1] || modelMatch?.[2] || "").toLowerCase();
    imagineModel = modelAliases[modelKey] || null;
    // Remove parsed flags from the rest string
    rest = rest.replace(/--model\s+[a-z0-9_.-]+|-m\s+[a-z0-9_.-]+/gi, "").trim();

    // --width and --height flags
    const widthMatch = rest.match(/--width\s+(\d+)/i);
    if (widthMatch) {
      context.imagineWidth = parseInt(widthMatch[1]);
      rest = rest.replace(/--width\s+\d+/i, "").trim();
    }

    const heightMatch = rest.match(/--height\s+(\d+)/i);
    if (heightMatch) {
      context.imagineHeight = parseInt(heightMatch[1]);
      rest = rest.replace(/--height\s+\d+/i, "").trim();
    }

    // --steps flag
    const stepsMatch = rest.match(/--steps\s+(\d+)/i);
    if (stepsMatch) {
      context.imagineSteps = parseInt(stepsMatch[1]);
      rest = rest.replace(/--steps\s+\d+/i, "").trim();
    }

    imaginePrompt = rest;
    if (!imaginePrompt) {
      showToast(
        "Usage: /imagine [--model flux|schnell|sd3|sdxl|klein|gemma] [--width 1024] [--height 1024] [--steps 30] <prompt>",
        "warning",
        6000,
      );
      btn.disabled = false;
      // Restore send/stop buttons
      if (stopBtn) {
        stopBtn.style.display = "none";
        btn.style.display = "flex";
      }
      return;
    }
  }

  // Add user message
  const userMessage = isImagineCommand ? imaginePrompt : msg;
  addMessage("user", isImagineCommand ? `/imagine ${imaginePrompt}` : msg, "You");
  agentHistory.push({ role: "user", content: userMessage });

  // Save user message to server conversation
  if (currentConversationId) {
    AgentAPI.conversationAddMessage(currentConversationId, {
      role: "user",
      content: userMessage,
    }).catch(() => {});
  }

  // For /imagine command, force the context to indicate image generation
  if (isImagineCommand) {
    context.forceImageGeneration = true;
    if (imagineModel) context.imageModel = imagineModel;
  }

  // Collect attached files context
  const images = attachedFiles.filter((f) => f.type === "image");
  const docs = attachedFiles.filter((f) => f.type === "document");

  if (images.length > 0) {
    context.hasImage = true;
    context.imageData = images[0].data;
    context.imageDescription = images[0].name;
  }
  if (docs.length > 0) {
    context.hasDocuments = true;
    context.documentContents = docs
      .map((d) => `--- ${d.name} ---\n${d.content.slice(0, 8000)}`)
      .join("\n\n");
  }

  // Add modes to context
  context.webSearch = webSearchEnabled;
  context.deepThink = deepThinkEnabled;

  // Clear attachments after sending
  attachedFiles = [];
  renderAttachments();

  // Create thinking indicator
  const container = document.getElementById("agentMessages");
  const thinkingDiv = document.createElement("div");
  thinkingDiv.className = "msg msg-agent";
  thinkingDiv.innerHTML = `<div class="msg-avatar"><svg width="28" height="28" viewBox="0 0 28 28" fill="none"><rect width="28" height="28" rx="8" fill="currentColor" opacity="0.15"/><path d="M14 6L8 10v8l6 4 6-4v-8l-6-4z" fill="currentColor" opacity="0.4"/><circle cx="14" cy="14" r="3.5" fill="currentColor"/></svg></div><div class="msg-body"><div class="thinking-indicator"><div class="thinking-dots"><span></span><span></span><span></span></div><span class="thinking-text">Thinking...</span></div></div>`;
  container.appendChild(thinkingDiv);
  scrollToBottom(container);

  let modelName = null;
  let fallbackUsed = false;

  const doSend = () => {
    currentAgentRequest = AgentAPI.send(userMessage, agentHistory, context, {
      model: state.get("agentModel") || undefined,
      onUpdate: (data) => {
        const bubble = thinkingDiv.querySelector(".msg-body");
        if (!bubble) return;

        switch (data.type) {
          case "intent":
            bubble.innerHTML = `<div class="thinking-indicator"><div class="thinking-dots"><span></span><span></span><span></span></div><span class="thinking-text">Using ${data.label}...</span></div>`;
            break;

          case "thinking":
            bubble.innerHTML = `<div class="thinking-indicator"><div class="thinking-dots"><span></span><span></span><span></span></div><span class="thinking-text">${sanitizeText(data.content)}</span></div>`;
            break;

          case "model_info":
            modelName = data.modelName || data.model?.split("/").pop();
            fallbackUsed = data.fallbackUsed || false;
            document.getElementById("topbarStatus").querySelector(".ts-text").textContent =
              modelName || "Ready";
            document.getElementById("tsDot").className = "ts-dot" + (modelName ? " connected" : "");
            // Build badge with benchmark rank if available
            let badgeLabel = fallbackUsed ? "Fallback: " : "";
            badgeLabel += modelName || "Model selected";
            if (data.benchmark?.rank) {
              badgeLabel += `  #${data.benchmark.rank}`;
              if (data.benchmark.score) badgeLabel += ` (${data.benchmark.score})`;
            }
            const badgeHtml = `<span class="routing-badge ${fallbackUsed ? "fallback" : ""}">${sanitizeText(badgeLabel)}</span>`;
            bubble.innerHTML = `${badgeHtml}<div class="thinking-indicator"><div class="thinking-dots"><span></span><span></span><span></span></div><span class="thinking-text">Generating...</span></div>`;
            // Reset streaming state for new generation
            delete thinkingDiv.dataset.streaming;
            delete thinkingDiv.dataset.streamContent;
            break;

          case "token":
            // Real-time token streaming
            if (!thinkingDiv.dataset.streaming) {
              // First token — replace thinking indicator with streaming content area
              thinkingDiv.dataset.streaming = "true";
              thinkingDiv.dataset.streamContent = "";
              bubble.innerHTML = `<div class="msg-name">${escHtml(modelName || "Dubu AI")}</div><div class="msg-content streaming"><span class="streaming-text"></span><span class="streaming-cursor">▊</span></div>`;
            }
            // Append token to the streaming text (using textContent for security)
            const streamTextEl = bubble.querySelector(".streaming-text");
            if (streamTextEl) {
              streamTextEl.textContent += data.content || "";
              thinkingDiv.dataset.streamContent = streamTextEl.textContent;
            }
            break;

          case "result":
            const fullResponse = data.content || "No response generated.";
            const wasStreaming = thinkingDiv.dataset?.streaming === "true";

            if (data.image) {
              // ── Image generation result ──
              thinkingDiv.remove();
              const imageUrl = `data:image/png;base64,${data.image}`;
              const imgIdx = imageGallery.length;

              imageGallery.push({
                url: imageUrl,
                prompt: data.prompt || imaginePrompt || msg,
                model: data.modelName || modelName || "AI",
                timestamp: Date.now(),
              });
              updateGalleryBadge();
              saveGalleryToStorage();

              const imgMsg = document.createElement("div");
              imgMsg.className = "msg msg-agent";
              imgMsg.innerHTML = `<div class="msg-avatar"><svg width="28" height="28" viewBox="0 0 28 28" fill="none"><rect width="28" height="28" rx="8" fill="currentColor" opacity="0.15"/><path d="M14 6L8 10v8l6 4 6-4v-8l-6-4z" fill="currentColor" opacity="0.4"/><circle cx="14" cy="14" r="3.5" fill="currentColor"/></svg></div><div class="msg-body"><div class="msg-name">${escHtml(modelName || "Image")}</div><div class="msg-content"><img src="${imageUrl}" class="msg-image" alt="Generated image" onclick="openGalleryImage(${imgIdx})" loading="lazy"></div><div class="msg-actions"><button class="msg-action-btn" onclick="copyMsgText(this)" title="Copy"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="3.5" y="2.5" width="6" height="7" rx="1" stroke="currentColor" stroke-width="1.2"/><path d="M2.5 4.5v5a1 1 0 001 1h3" stroke="currentColor" stroke-width="1.2"/></svg></button></div></div>`;
              container.appendChild(imgMsg);

              agentHistory.push({
                role: "assistant",
                content: `[Generated image: ${data.prompt || imaginePrompt || msg}]`,
              });

              if (currentConversationId) {
                AgentAPI.conversationAddMessage(currentConversationId, {
                  role: "assistant",
                  content: `[Generated image: ${data.prompt || imaginePrompt || msg}]`,
                  model: data.model || modelName,
                })
                  .then(() => {
                    loadConversationList();
                    autoGenerateTitle();
                  })
                  .catch(() => {});
              } else {
                createNewConversation().then((convo) => {
                  if (convo) {
                    currentConversationId = convo.id;
                    AgentAPI.conversationAddMessage(convo.id, {
                      role: "user",
                      content: userMessage,
                    }).catch(() => {});
                    AgentAPI.conversationAddMessage(convo.id, {
                      role: "assistant",
                      content: `[Generated image: ${data.prompt || imaginePrompt || msg}]`,
                      model: data.model,
                    }).catch(() => {
                      autoGenerateTitle();
                    });
                    loadConversationList();
                    autoGenerateTitle();
                  }
                });
              }
            } else if (wasStreaming) {
              // ── Streamed text response — finalize the streaming bubble ──
              // Remove the streaming cursor
              const cursor = bubble.querySelector(".streaming-cursor");
              if (cursor) cursor.remove();
              // Get the accumulated text and format as HTML
              const streamText = thinkingDiv.dataset.streamContent || fullResponse;
              const formattedHtml = formatMessageHtml(streamText);
              const contentEl = bubble.querySelector(".msg-content");
              if (contentEl) {
                contentEl.innerHTML = formattedHtml;
                contentEl.classList.remove("streaming");
              }
              // Add action buttons with feedback (like/dislike)
              const actionsHtml = `<div class="msg-actions"><button class="msg-action-btn" onclick="copyMsgText(this)" title="Copy"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="3.5" y="2.5" width="6" height="7" rx="1" stroke="currentColor" stroke-width="1.2"/><path d="M2.5 4.5v5a1 1 0 001 1h3" stroke="currentColor" stroke-width="1.2"/></svg></button><button class="msg-action-btn feedback-btn" onclick="feedbackMessage(this, 'like')" title="Like"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 6.5L6 2l2 2-1 3h3L7 10H4l-1-3.5z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button><button class="msg-action-btn feedback-btn" onclick="feedbackMessage(this, 'dislike')" title="Dislike"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 5.5L6 10l2-2-1-3h3L7 2H4L3 5.5z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>`;
              // Check if actions already exist
              if (!bubble.querySelector(".msg-actions")) {
                bubble.insertAdjacentHTML("beforeend", actionsHtml);
              }
              // Highlight code blocks
              setTimeout(() => {
                if (typeof Prism !== "undefined") {
                  Prism.highlightAllUnder(bubble);
                  addLineNumbers(bubble);
                }
              }, 50);
              // Save to history
              agentHistory.push({ role: "assistant", content: streamText });
              scrollToBottom();
              
              // Add suggested follow-up questions
              const suggestions = generateFollowUpSuggestions(streamText);
              addSuggestedQuestions(suggestions);

              if (currentConversationId) {
                AgentAPI.conversationAddMessage(currentConversationId, {
                  role: "assistant",
                  content: streamText,
                  model: data.model || modelName,
                })
                  .then(() => {
                    loadConversationList();
                    autoGenerateTitle();
                  })
                  .catch(() => {});
              } else {
                createNewConversation().then((convo) => {
                  if (convo) {
                    currentConversationId = convo.id;
                    AgentAPI.conversationAddMessage(convo.id, {
                      role: "user",
                      content: userMessage,
                    }).catch(() => {});
                    AgentAPI.conversationAddMessage(convo.id, {
                      role: "assistant",
                      content: streamText,
                      model: data.model,
                    }).catch(() => {});
                    loadConversationList();
                    autoGenerateTitle();
                  }
                });
              }
            } else {
              // ── Non-streamed text response (fallback or no tokens received) ──
              thinkingDiv.remove();
              addMessage("agent", fullResponse, modelName || "Dubu AI", {
                typewriter: !fallbackUsed,
                typewriterSpeed: 18,
              });
              agentHistory.push({ role: "assistant", content: fullResponse });
              
              // Add suggested follow-up questions
              const suggestions = generateFollowUpSuggestions(fullResponse);
              addSuggestedQuestions(suggestions);

              if (currentConversationId) {
                AgentAPI.conversationAddMessage(currentConversationId, {
                  role: "assistant",
                  content: fullResponse,
                  model: data.model || modelName,
                })
                  .then(() => {
                    loadConversationList();
                    autoGenerateTitle();
                  })
                  .catch(() => {});
              } else {
                createNewConversation().then((convo) => {
                  if (convo) {
                    currentConversationId = convo.id;
                    AgentAPI.conversationAddMessage(convo.id, {
                      role: "user",
                      content: userMessage,
                    }).catch(() => {});
                    AgentAPI.conversationAddMessage(convo.id, {
                      role: "assistant",
                      content: fullResponse,
                      model: data.model,
                    }).catch(() => {});
                    loadConversationList();
                    autoGenerateTitle();
                  }
                });
              }
            }

            document.getElementById("tsDot").className = "ts-dot connected";
            document.getElementById("topbarStatus").querySelector(".ts-text").textContent =
              modelName || "Ready";
            break;

          case "error":
            thinkingDiv.remove();
            addMessage("agent", data.content, "Error");
            showToast(data.content || "An error occurred", "error");
            break;
        }
        scrollToBottom(container);
      },
      onDone: () => {
        currentAgentRequest = null;
        btn.disabled = false;
        // Hide stop button, show send button
        const stopBtn = document.getElementById("agentStopBtn");
        if (stopBtn) {
          stopBtn.style.display = "none";
          btn.style.display = "flex";
        }
      },
      onError: (err) => {
        if (thinkingDiv.parentNode) thinkingDiv.remove();
        let userMsg = "Connection error";
        if (err.includes("fetch") || err.includes("network"))
          userMsg = "Unable to reach the server.";
        else if (err.includes("401") || err.includes("403"))
          userMsg = "Authentication failed. Check your API key.";
        else if (err.includes("429")) userMsg = "Rate limited. Please wait.";
        else userMsg = err.length > 100 ? err.slice(0, 100) + "..." : err;
        addMessage("agent", "Error: " + userMsg, "Error");
        showToast(userMsg, "error", 5000);
        currentAgentRequest = null;
        btn.disabled = false;
        // Hide stop button, show send button
        const stopBtn = document.getElementById("agentStopBtn");
        if (stopBtn) {
          stopBtn.style.display = "none";
          btn.style.display = "flex";
        }
      },
    });
  };

  doSend();
};

// ── Stop generation ──
window.stopGeneration = function () {
  if (!currentAgentRequest) return;

  // Abort the request
  currentAgentRequest.abort();
  currentAgentRequest = null;

  // Re-enable send button, swap stop → send
  const sendBtn = document.getElementById("agentSendBtn");
  const stopBtn = document.getElementById("agentStopBtn");
  if (sendBtn) {
    sendBtn.disabled = false;
    sendBtn.style.display = "flex";
  }
  if (stopBtn) stopBtn.style.display = "none";

  // Find the thinking/streaming message
  const container = document.getElementById("agentMessages");
  const lastAgent = container?.querySelector(".msg-agent:last-child");
  if (!lastAgent) return;

  const bubble = lastAgent.querySelector(".msg-body");
  if (!bubble) return;

  const streamContent = lastAgent.dataset?.streamContent;
  const wasStreaming = lastAgent.dataset?.streaming === "true";

  if (wasStreaming && streamContent && streamContent.trim()) {
    // ── Partial stream — finalize what we have ──
    // Remove the cursor
    const cursor = bubble.querySelector(".streaming-cursor");
    if (cursor) cursor.remove();

    // Format the partial content as HTML
    const formattedHtml = formatMessageHtml(streamContent);
    const contentEl = bubble.querySelector(".msg-content");
    if (contentEl) {
      contentEl.innerHTML = formattedHtml;
      contentEl.classList.remove("streaming");
    }

    // Add action buttons
    if (!bubble.querySelector(".msg-actions")) {
      const actionsHtml = `<div class="msg-actions"><button class="msg-action-btn" onclick="copyMsgText(this)" title="Copy"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="3.5" y="2.5" width="6" height="7" rx="1" stroke="currentColor" stroke-width="1.2"/><path d="M2.5 4.5v5a1 1 0 001 1h3" stroke="currentColor" stroke-width="1.2"/></svg></button><span class="stopped-badge">Stopped</span></div>`;
      bubble.insertAdjacentHTML("beforeend", actionsHtml);
    }

    // Highlight code blocks
    setTimeout(() => {
      if (typeof Prism !== "undefined") {
        Prism.highlightAllUnder(bubble);
        addLineNumbers(bubble);
      }
    }, 50);

    // Save partial to history
    agentHistory.push({ role: "assistant", content: streamContent });
    scrollToBottom();
  } else {
    // ── No content yet — just remove the thinking indicator ──
    lastAgent.remove();
  }

  document.getElementById("tsDot").className = "ts-dot connected";
  document.getElementById("topbarStatus").querySelector(".ts-text").textContent = "Ready";
  showToast("Generation stopped", "info", 2000);
};

// ── Clear chat ──
window.clearAgent = function () {
  if (currentAgentRequest) {
    currentAgentRequest.abort();
    currentAgentRequest = null;

    // Restore send/stop buttons in case we were mid-stream
    const sendBtn = document.getElementById("agentSendBtn");
    const stopBtn = document.getElementById("agentStopBtn");
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.style.display = "flex";
    }
    if (stopBtn) stopBtn.style.display = "none";
  }

  // Create new conversation on server
  currentConversationId = null;
  localStorage.removeItem("dubu_last_convo_id");
  createNewConversation().then((convo) => {
    if (convo) {
      currentConversationId = convo.id;
      loadConversationList();
    }
  });

  // Cleanup suggested questions
  if (suggestedQuestionsContainer) {
    suggestedQuestionsContainer.remove();
    suggestedQuestionsContainer = null;
  }
  
  showWelcomeMessage();
  agentHistory = [];
  attachedFiles = [];
  renderAttachments();
  document.getElementById("agentSendBtn").disabled = false;
  document.getElementById("tsDot").className = "ts-dot";
  document.getElementById("topbarStatus").querySelector(".ts-text").textContent = "Ready";

  // Scroll to top
  document.getElementById("chatMessages").scrollTop = 0;
};

// ── Add message ──
function addMessage(role, content, authorOverride, options = {}) {
  const container = document.getElementById("agentMessages");
  const div = document.createElement("div");
  div.className = `msg ${role === "user" ? "msg-user" : "msg-agent"}`;

  const avatarHtml =
    role === "user"
      ? `<div class="msg-avatar" style="background:var(--tag-bg);color:var(--text-secondary)"><svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="8" stroke="currentColor" stroke-width="1.3"/><circle cx="9" cy="7" r="2.5" stroke="currentColor" stroke-width="1.3"/><path d="M4 15c0-2.8 2.2-5 5-5s5 2.2 5 5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg></div>`
      : `<div class="msg-avatar"><svg width="28" height="28" viewBox="0 0 28 28" fill="none"><rect width="28" height="28" rx="8" fill="currentColor" opacity="0.15"/><path d="M14 6L8 10v8l6 4 6-4v-8l-6-4z" fill="currentColor" opacity="0.4"/><circle cx="14" cy="14" r="3.5" fill="currentColor"/></svg></div>`;

  let author = role === "user" ? "You" : authorOverride || "Dubu AI";

  // Timestamp
  const timestamp = new Date();
  const timeStr = timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const formattedHtml = formatMessageHtml(content);    // Build action buttons — regenerate only for assistant, edit for user
  let actionsHtml;
  if (role === "user") {
    actionsHtml = `<div class="msg-actions"><button class="msg-action-btn" onclick="copyMsgText(this)" title="Copy"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="3.5" y="2.5" width="6" height="7" rx="1" stroke="currentColor" stroke-width="1.2"/><path d="M2.5 4.5v5a1 1 0 001 1h3" stroke="currentColor" stroke-width="1.2"/></svg></button></div>`;
    // Make user message clickable to edit — attach click handler to the msg element
    div.addEventListener("dblclick", () => editUserMessage(div, content));
  } else {
    actionsHtml = `<div class="msg-actions"><button class="msg-action-btn" onclick="copyMsgText(this)" title="Copy"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="3.5" y="2.5" width="6" height="7" rx="1" stroke="currentColor" stroke-width="1.2"/><path d="M2.5 4.5v5a1 1 0 001 1h3" stroke="currentColor" stroke-width="1.2"/></svg></button><button class="msg-action-btn" onclick="regenerateResponse(this)" title="Regenerate"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6a4 4 0 014-4 4 4 0 014 4M10 6a4 4 0 01-4 4 4 4 0 01-4-4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M8.5 6L10 4.5 11.5 6M.5 6L2 4.5 3.5 6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg></button><button class="msg-action-btn feedback-btn" onclick="feedbackMessage(this, 'like')" title="Like"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 6.5L6 2l2 2-1 3h3L7 10H4l-1-3.5z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button><button class="msg-action-btn feedback-btn" onclick="feedbackMessage(this, 'dislike')" title="Dislike"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 5.5L6 10l2-2-1-3h3L7 2H4L3 5.5z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>`;
  }

  if (options.typewriter && role === "agent") {
    // Typewriter mode
    div.innerHTML = `${avatarHtml}<div class="msg-body"><div class="msg-name">${author} <span class="msg-time">${timeStr}</span></div><div class="msg-content"></div></div>`;
    container.appendChild(div);

    const contentEl = div.querySelector(".msg-content");
    typewriterEffect(contentEl, formattedHtml, content, options.typewriterSpeed || 20);
  } else {
    // Normal mode
    div.innerHTML = `${avatarHtml}<div class="msg-body"><div class="msg-name">${author} <span class="msg-time">${timeStr}</span></div><div class="msg-content">${formattedHtml}</div>${actionsHtml}</div>`;
    container.appendChild(div);
    scrollToBottom(container);
    setTimeout(() => {
      if (typeof Prism !== "undefined") {
        Prism.highlightAllUnder(div);
        addLineNumbers(div);
      }
    }, 50);
  }
}

// ── Copy message text ──
window.copyMsgText = function (btn) {
  const content = btn.closest(".msg-body")?.querySelector(".msg-content");
  if (!content) return;
  const text = content.innerText?.trim() || content.textContent?.trim() || "";
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    btn.innerHTML =
      '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5 9.5 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    showToast("Copied", "success", 1000);
    setTimeout(() => {
      btn.innerHTML =
        '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="3.5" y="2.5" width="6" height="7" rx="1" stroke="currentColor" stroke-width="1.2"/><path d="M2.5 4.5v5a1 1 0 001 1h3" stroke="currentColor" stroke-width="1.2"/></svg>';
    }, 1500);
  });
};

// ── Message Feedback (Like/Dislike) ──
window.feedbackMessage = function (btn, type) {
  const parentActions = btn.closest(".msg-actions");
  if (!parentActions) return;
  
  // Toggle if already selected
  const wasActive = btn.classList.contains("feedback-active");
  
  // Clear all feedback buttons in this message
  parentActions.querySelectorAll(".feedback-btn").forEach((b) => {
    b.classList.remove("feedback-active");
  });
  
  if (!wasActive) {
    btn.classList.add("feedback-active");
    const feedbackType = type === "like" ? "liked" : "disliked";
    showToast(`Response ${feedbackType}`, "info", 1500);
  }
};

// ── Suggested Follow-up Questions ──
let suggestedQuestionsContainer = null;

function addSuggestedQuestions(suggestions) {
  // Remove previous suggestions if any
  if (suggestedQuestionsContainer) {
    suggestedQuestionsContainer.remove();
  }
  
  if (!suggestions || suggestions.length === 0) return;
  
  const container = document.getElementById("agentMessages");
  suggestedQuestionsContainer = document.createElement("div");
  suggestedQuestionsContainer.className = "suggested-questions";
  
  const label = document.createElement("div");
  label.className = "sq-label";
  label.textContent = "Follow-up questions";
  suggestedQuestionsContainer.appendChild(label);
  
  const list = document.createElement("div");
  list.className = "sq-list";
  
  suggestions.slice(0, 3).forEach((question) => {
    const btn = document.createElement("button");
    btn.className = "sq-btn";
    btn.textContent = question;
    btn.onclick = () => {
      // Click the suggestion: populate input and send
      const input = document.getElementById("agentInput");
      input.value = question;
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 120) + "px";
      window.sendToAgent();
      // Remove suggestions after clicking one
      if (suggestedQuestionsContainer) {
        suggestedQuestionsContainer.remove();
        suggestedQuestionsContainer = null;
      }
    };
    list.appendChild(btn);
  });
  
  suggestedQuestionsContainer.appendChild(list);
  container.appendChild(suggestedQuestionsContainer);
  scrollToBottom(container);
}

function generateFollowUpSuggestions(responseText) {
  // Use the AI model for contextual suggestions, with keyword fallback
  // Fire-and-forget: show keyword suggestions immediately, upgrade when AI responds
  const fallback = generateKeywordSuggestions(responseText);
  
  // Try AI-generated suggestions (async, won't block)
  AgentAPI.getSuggestions(responseText).then((aiSuggestions) => {
    if (aiSuggestions && aiSuggestions.length >= 2) {
      // Replace the current suggestions with AI-generated ones
      if (suggestedQuestionsContainer) {
        // Only upgrade if the user hasn't clicked one yet
        const stillVisible = document.body.contains(suggestedQuestionsContainer);
        if (stillVisible) {
          // Re-render with AI suggestions
          suggestedQuestionsContainer.remove();
          addSuggestedQuestions(aiSuggestions);
        }
      }
    }
  }).catch(() => {
    // Silently keep keyword fallback
  });
  
  return fallback;
}

function generateKeywordSuggestions(responseText) {
  const lower = responseText.toLowerCase();
  
  if (lower.includes("function") || lower.includes("class ") || lower.includes("def ") || lower.includes("import ") || lower.includes("const ")) {
    return [
      "Can you explain how this code works in more detail?",
      "Can you show me how to test this?",
      "Are there any edge cases I should handle?"
    ];
  }
  
  if (lower.includes("because") || lower.includes("therefore") || lower.includes("reason") || lower.includes("first") || lower.includes("step")) {
    return [
      "Can you elaborate more on that?",
      "What are the alternatives?",
      "Can you give me an example?"
    ];
  }
  
  if (lower.includes("image") || lower.includes("picture") || lower.includes("design") || lower.includes("color") || lower.includes("layout")) {
    return [
      "Can you generate a similar image?",
      "Can you describe this in more detail?",
      "What style would work best?"
    ];
  }
  
  if (lower.includes("math") || lower.includes("equation") || lower.includes("calculate") || lower.includes("formula") || lower.includes("solve")) {
    return [
      "Can you walk me through the steps again?",
      "What real-world application does this have?",
      "Can you test this with different values?"
    ];
  }
  
  return [
    "Can you tell me more?",
    "What else should I know about this?",
    "Can you give me a practical example?"
  ];
}

// ── Regenerate response ──
window.regenerateResponse = function (btn) {
  // Find the last user message in agentHistory
  let lastUserIdx = -1;
  for (let i = agentHistory.length - 1; i >= 0; i--) {
    if (agentHistory[i].role === "user") {
      lastUserIdx = i;
      break;
    }
  }
  if (lastUserIdx === -1) return;

  const lastUserMsg = agentHistory[lastUserIdx].content;

  // Abort any current request
  if (currentAgentRequest) {
    currentAgentRequest.abort();
    currentAgentRequest = null;
  }

  // Find and remove the last user message element + everything after it from DOM
  const container = document.getElementById("agentMessages");
  const messages = container.querySelectorAll(".msg");
  let userMsgEl = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const nameEl = messages[i].querySelector(".msg-name");
    if (nameEl && nameEl.textContent === "You") {
      userMsgEl = messages[i];
      break;
    }
  }
  if (!userMsgEl) return;

  // Remove user message + all subsequent messages from DOM
  let current = userMsgEl;
  while (current) {
    const toRemove = current;
    current = current.nextElementSibling;
    toRemove.remove();
  }

  // Truncate agentHistory to BEFORE the user message (sendToAgent will add it fresh)
  agentHistory = agentHistory.slice(0, lastUserIdx);

  // Re-send the user message
  const input = document.getElementById("agentInput");
  input.value = lastUserMsg;
  sendToAgent();
};

// ── Edit user message (double-click on user message) ──
function editUserMessage(msgDiv, originalContent) {
  const bodyEl = msgDiv.querySelector(".msg-body");
  const contentEl = bodyEl?.querySelector(".msg-content");
  const actionsEl = bodyEl?.querySelector(".msg-actions");
  if (!bodyEl || !contentEl) return;

  // Hide current content and actions
  contentEl.style.display = "none";
  if (actionsEl) actionsEl.style.display = "none";

  // Don't add if already editing
  if (bodyEl.querySelector(".edit-textarea")) return;

  // Create edit UI
  const editDiv = document.createElement("div");
  editDiv.className = "edit-container";
  editDiv.innerHTML = `<textarea class="edit-textarea" rows="3">${escHtml(originalContent)}</textarea><div class="edit-actions"><button class="edit-save-btn" onclick="saveEditedMessage(this)">Save</button><button class="edit-cancel-btn" onclick="cancelEditMessage(this)">Cancel</button></div>`;
  bodyEl.appendChild(editDiv);

  // Focus and auto-resize
  const textarea = editDiv.querySelector("textarea");
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  textarea.style.height = "auto";
  textarea.style.height = Math.min(textarea.scrollHeight, 200) + "px";
  textarea.addEventListener("input", function () {
    this.style.height = "auto";
    this.style.height = Math.min(this.scrollHeight, 200) + "px";
  });
  // Save on Ctrl+Enter
  textarea.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      saveEditedMessage(editDiv.querySelector(".edit-save-btn"));
    }
  });
}

// ── Save edited message ──
window.saveEditedMessage = function (btn) {
  const editDiv = btn.closest(".edit-container");
  const bodyEl = editDiv?.closest(".msg-body");
  const msgDiv = bodyEl?.closest(".msg");
  if (!editDiv || !bodyEl || !msgDiv) return;

  const textarea = editDiv.querySelector(".edit-textarea");
  const newContent = textarea?.value.trim();
  if (!newContent) return;

  // Count user messages in the DOM up to this one to find its index in history
  let userMsgCount = 0;
  let currentEl = msgDiv.previousElementSibling;
  while (currentEl) {
    if (
      currentEl.classList.contains("msg") &&
      currentEl.querySelector(".msg-name")?.textContent === "You"
    ) {
      userMsgCount++;
    }
    currentEl = currentEl.previousElementSibling;
  }

  // Find the corresponding user message in agentHistory
  let userHistoryIdx = -1;
  let count = 0;
  for (let i = 0; i < agentHistory.length; i++) {
    if (agentHistory[i].role === "user") {
      if (count === userMsgCount) {
        userHistoryIdx = i;
        break;
      }
      count++;
    }
  }
  if (userHistoryIdx === -1) return;

  // Abort current request
  if (currentAgentRequest) {
    currentAgentRequest.abort();
    currentAgentRequest = null;
  }

  // Remove this user message + all subsequent messages from DOM
  let current = msgDiv;
  while (current) {
    const toRemove = current;
    current = current.nextElementSibling;
    toRemove.remove();
  }

  // Truncate history to BEFORE this message (sendToAgent will add it fresh)
  agentHistory = agentHistory.slice(0, userHistoryIdx);

  // Clean up edit UI
  editDiv.remove();

  // Re-send
  const input = document.getElementById("agentInput");
  input.value = newContent;
  sendToAgent();
};

// ── Cancel edit ──
window.cancelEditMessage = function (btn) {
  const editDiv = btn.closest(".edit-container");
  const bodyEl = editDiv?.closest(".msg-body");
  if (!editDiv || !bodyEl) return;

  const contentEl = bodyEl.querySelector(".msg-content");
  const actionsEl = bodyEl.querySelector(".msg-actions");
  if (contentEl) contentEl.style.display = "";
  if (actionsEl) actionsEl.style.display = "";
  editDiv.remove();
};

// ── Typewriter Effect ──
function typewriterEffect(contentEl, formattedHtml, rawText, speed = 20) {
  const textSpan = document.createElement("span");
  textSpan.className = "typewriter-text";
  contentEl.appendChild(textSpan);

  const cursor = document.createElement("span");
  cursor.className = "typewriter-cursor";
  contentEl.appendChild(cursor);

  let index = 0;
  let lastScrollTime = 0;
  const container = document.getElementById("agentMessages");

  function typeNext() {
    if (index < rawText.length) {
      textSpan.textContent += rawText[index];
      index++;

      const now = Date.now();
      if (now - lastScrollTime > 50) {
        scrollToBottom(container);
        lastScrollTime = now;
      }

      const char = rawText[index - 1];
      let delay = speed;
      if (char === " " || char === "\n") delay = speed * 0.5;
      else if (char === "." || char === "!" || char === "?") delay = speed * 3;
      else if (char === "," || char === ";" || char === ":") delay = speed * 1.5;

      setTimeout(typeNext, delay);
    } else {
      cursor.classList.add("done");
      setTimeout(() => {
        cursor.remove();
        textSpan.remove();
        contentEl.insertAdjacentHTML("afterbegin", formattedHtml);
        contentEl.classList.add("formatting-applied");
        setTimeout(() => {
          if (typeof Prism !== "undefined") {
            Prism.highlightAllUnder(contentEl);
            addLineNumbers(contentEl);
          }
        }, 50);
        scrollToBottom(container);
      }, 400);
    }
  }

  typeNext();
  scrollToBottom(container);
}

// ── Detect file names from code blocks ──
function detectFileFromCodeBlock(code, lang) {
  const firstLine = code.split("\n")[0]?.trim() || "";
  const patterns = [
    /\/\/\s*filename\s*[:=]?\s*([\w-.\/]+)/i,
    /\/\/\s*file\s*[:=]?\s*([\w-.\/]+)/i,
    /#\s*filename\s*[:=]?\s*([\w-.\/]+)/i,
    /#\s*file\s*[:=]?\s*([\w-.\/]+)/i,
    /<!--\s*filename\s*[:=]?\s*([\w-.\/]+)\s*-->/i,
    /\/\*\s*filename\s*[:=]?\s*([\w-.\/]+)\s*\*\//i,
    /^\/\/\s*([\w-]+\.[a-z]+)$/i,
    /^#\s*([\w-]+\.[a-z]+)$/i,
  ];
  for (const p of patterns) {
    const m = firstLine.match(p);
    if (m && m[1]) return m[1];
  }
  if (lang && /^[\w-.]+\.[a-z]+$/i.test(lang) && !lang.includes(" ")) return lang;
  return null;
}

// ── Build create file button HTML ──
function buildFileCreateHtml(fileName) {
  const fileId = "file_" + Math.random().toString(36).slice(2, 7);
  const createBtn = `<button class="file-create-btn" onclick="createFileFromCode(this, '${escHtml(fileName)}')" data-file-id="${fileId}"><svg viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> Create File</button>`;
  return `<div class="file-path-input" data-file-id="${fileId}">${createBtn}</div>`;
}

// ── Handle file creation from code block ──
window.createFileFromCode = async function (btn, fileName) {
  const codeBlock = btn.closest(".code-block-wrap")?.querySelector(".code-block code");
  if (!codeBlock) {
    showToast("Could not locate the code content.", "error");
    return;
  }
  const content = codeBlock.textContent;
  btn.classList.add("saving");
  btn.innerHTML =
    '<svg viewBox="0 0 14 14" fill="none" style="animation:spin 0.8s linear infinite"><circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.5" stroke-dasharray="20 30" stroke-linecap="round"/></svg> Saving...';
  try {
    const result = await AgentAPI.writeFile(fileName, content, false);
    btn.classList.remove("saving");
    btn.classList.add("saved");
    btn.innerHTML = `<svg viewBox="0 0 14 14" fill="none"><path d="M2 7l3.5 3.5L12 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> ${result.action === "overwritten" ? "Overwritten" : "Saved!"}`;
    showToast(`File created: ${fileName}`, "success", 3000);
  } catch (e) {
    btn.classList.remove("saving");
    btn.classList.add("error");
    btn.innerHTML = `<svg viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.5"/><path d="M5 5l4 4M9 5l-4 4" stroke="currentColor" stroke-width="1.2"/></svg> ${e.message.slice(0, 50)}`;
    showToast(`Failed: ${e.message}`, "error", 4000);
  }
};

// ── Format message HTML with full markdown support ──
function formatMessageHtml(content) {
  // ── Phase 1: Extract special blocks before processing ──
  // Store code/reasoning blocks separately so they're never affected
  // by markdown processing or the \n→<br> conversion.
  const blocks = [];

  // Extract reasoning blocks (```reasoning ... ```)
  content = content.replace(/```reasoning\s*\n([\s\S]*?)```/g, (match, reasoning) => {
    const idx = blocks.length;
    blocks.push({ type: "reasoning", content: reasoning.trim() });
    return `%%BLOCK_${idx}%%`;
  });

  // Extract code blocks (```lang ... ```)
  content = content.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const idx = blocks.length;
    blocks.push({ type: "code", lang: lang || "code", code: code });
    return `%%BLOCK_${idx}%%`;
  });

  // ── Phase 2: HTML-escape the remaining text (no code blocks) ──
  let html = escHtml(content);

  // ── Phase 3: Markdown processing on non-code-block text ──
  // (All these patterns need \n characters to match correctly)

  // Also detect reasoning from markdown-style headers
  html = html.replace(
    /<strong>Thinking:<\/strong>([\s\S]*?)(?=<strong>|$)/gi,
    (match, thinkingContent) => {
      const cleanContent = escHtml(thinkingContent.trim());
      return `<div class="reasoning-block"><div class="reasoning-header" onclick="toggleReasoning(this)"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 3l4 3-4 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg> Show reasoning</div><div class="reasoning-content">${cleanContent}</div></div>`;
    },
  );

  // ── Blockquotes ──
  html = html.replace(/((?:^|\n)(?:&gt;\s?[^\n]*)+)/g, (match) => {
    const lines = match.trim().split('\n');
    const inner = lines
      .map(line => line.replace(/^&gt;\s?/, '').trim())
      .join('<br>');
    return '\n<blockquote>' + inner + '</blockquote>\n';
  });

  // ── Tables ──
  html = html.replace(/((?:^|\n)(?:\s*\|[^\n]*\|[\s]*\n?)+)/g, (match, tableBlock) => {
    const rows = tableBlock.trim().split('\n').filter(r => r.trim().startsWith('|'));
    if (rows.length < 2) return match;

    const parsedRows = rows.map(row => {
      const cells = row.trim().split('|').filter(c => c.trim() !== '');
      return cells.map(c => c.trim());
    });

    const sepRow = parsedRows[1];
    if (!sepRow || sepRow.length < 2 || !sepRow.every(c => /^-+\s*$/.test(c))) {
      return match;
    }

    let tableHtml = '<div class="table-wrap"><table>';
    tableHtml += '<thead><tr>';
    parsedRows[0].forEach(cell => { tableHtml += '<th>' + cell + '</th>'; });
    tableHtml += '</tr></thead>';
    tableHtml += '<tbody>';
    for (let i = 2; i < parsedRows.length; i++) {
      tableHtml += '<tr>';
      parsedRows[i].forEach(cell => { tableHtml += '<td>' + cell + '</td>'; });
      tableHtml += '</tr>';
    }
    tableHtml += '</tbody></table></div>';
    return '\n' + tableHtml + '\n';
  });

  // ── Task Lists ──
  html = html.replace(/^- \[([ x])\] ([^\n]*)/gm, (match, checked, text) => {
    const done = checked === 'x';
    const cls = 'task-item' + (done ? ' done' : '');
    const icon = done
      ? '<svg class="task-icon checked" viewBox="0 0 12 12" fill="none"><rect x="1" y="1" width="10" height="10" rx="2" fill="currentColor" opacity="0.15"/><path d="M3.5 6L5 7.5 8.5 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      : '<svg class="task-icon unchecked" viewBox="0 0 12 12" fill="none"><rect x="1" y="1" width="10" height="10" rx="2" stroke="currentColor" stroke-width="1.3" opacity="0.4"/></svg>';
    return '<div class="' + cls + '">' + icon + '<span class="task-text">' + text.trim() + '</span></div>';
  });

  // ── Headers ──
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

  // ── Horizontal Rules ──
  html = html.replace(/^(?:[-*_]){3,}\s*$/gm, '<hr>');

  // ── Unordered Lists ──
  html = html.replace(/(?:^|\n)([*-])\s+([^\n]+)((?:\n\1\s+[^\n]+)*)/g, (match, marker, firstItem, rest) => {
    const items = [firstItem, ...rest.split('\n').filter(Boolean).map(l => l.replace(/^[*-]\s+/, ''))];
    return '<ul>' + items.map(content => '<li>' + content + '</li>').join('') + '</ul>';
  });

  // ── Ordered Lists ──
  html = html.replace(/(?:^|\n)\d+\.\s+([^\n]+)((?:\n\d+\.\s+[^\n]+)*)/g, (match, firstItem, rest) => {
    const items = [firstItem, ...rest.split('\n').filter(Boolean).map(l => l.replace(/^\d+\.\s+/, ''))];
    return '<ol>' + items.map(content => '<li>' + content + '</li>').join('') + '</ol>';
  });

  // ── Bold ──
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

  // ── Strikethrough ──
  html = html.replace(/~~(.*?)~~/g, '<del>$1</del>');

  // ── Italic ──
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // ── Convert \n to <br> for ALL remaining text ──
  // This runs BEFORE restoring code blocks, so code blocks keep their \n
  html = html.replace(/\n/g, "<br>");

  html = html.replace(/!\[(.*?)\]\((.*?)\)/g, (m, alt, src) => {
    if (src.startsWith("data:") || src.startsWith("http"))
      return `<img src="${src}" alt="${escHtml(alt)}" class="msg-image" loading="lazy">`;
    return m;
  });
  html = html.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:underline">$1</a>',
  );

  // ── Phase 4: Restore code & reasoning blocks ──
  // Code blocks are restored AFTER \n→<br>, so they keep their \n characters.
  // CSS white-space:pre-wrap + Prism will render them correctly.
  html = html.replace(/%%BLOCK_(\d+)%%/g, (match, idxStr) => {
    const block = blocks[parseInt(idxStr)];
    if (!block) return match;

    if (block.type === "reasoning") {
      const cleanReasoning = escHtml(block.content);
      return `<div class="reasoning-block"><div class="reasoning-header" onclick="toggleReasoning(this)"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 3l4 3-4 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg> Show reasoning</div><div class="reasoning-content">${cleanReasoning}</div></div>`;
    }

    if (block.type === "code") {
      const codeHtml = escHtml(block.code);
      const langLabel = block.lang;
      const langMap = {
        js: "javascript", ts: "typescript", jsx: "jsx", tsx: "tsx",
        py: "python", rb: "ruby", rs: "rust", go: "go", sh: "bash",
        yml: "yaml", yaml: "yaml", json: "json", html: "html", css: "css",
        md: "markdown", kt: "kotlin", java: "java", c: "c", cpp: "cpp",
        h: "c", php: "php", swift: "swift", sql: "sql", bash: "bash",
        shell: "bash", text: "none", xml: "xml",
      };
      const prismLang = langMap[langLabel] || langLabel || "none";
      const langClass = `language-${prismLang}`;
      const fileName = detectFileFromCodeBlock(block.code, block.lang);
      const fileBadgeHtml = fileName
        ? `<span class="code-file-badge"><svg viewBox="0 0 12 12" fill="none"><path d="M3 1h4l3 3v7H3V1z" stroke="currentColor" stroke-width="1.2"/><path d="M7 1v3h3" stroke="currentColor" stroke-width="1.2"/></svg>${escHtml(fileName)}</span>`
        : "";
      const fileUi = fileName ? buildFileCreateHtml(fileName) : "";
      const copyBtn = `<button class="copy-btn" onclick="copyCodeBlock(this)" title="Copy code"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="3.5" y="2.5" width="6" height="7" rx="1" stroke="currentColor" stroke-width="1.2"/><path d="M2.5 4.5v5a1 1 0 001 1h3" stroke="currentColor" stroke-width="1.2"/></svg> Copy</button>`;
      return `<div class="code-block-wrap"><div class="code-header"><span class="code-lang">${escHtml(langLabel)}</span>${fileBadgeHtml}</div>${fileUi}<div class="code-block line-numbers">${copyBtn}<code class="${langClass}">${codeHtml}</code></div></div>`;
    }

    return match;
  });

  return html;
}

// ── Toggle reasoning block ──
window.toggleReasoning = function (header) {
  header.classList.toggle("open");
  const content = header.nextElementSibling;
  if (content) content.classList.toggle("open");
};

// ── Add line numbers to code blocks (called after Prism) ──
function addLineNumbers(container) {
  container.querySelectorAll(".code-block.line-numbers:not(.ln-processed)").forEach((block) => {
    const codeEl = block.querySelector("code");
    if (!codeEl) return;

    const text = (codeEl.textContent || "").replace(/\n$/, "");
    const lineCount = text.split("\n").length;

    // Don't add numbers for single-line code
    if (lineCount <= 1) return;

    const gutter = document.createElement("div");
    gutter.className = "code-gutter";
    gutter.setAttribute("aria-hidden", "true");

    for (let i = 1; i <= lineCount; i++) {
      const lineNum = document.createElement("span");
      lineNum.className = "code-ln";
      lineNum.textContent = i;
      gutter.appendChild(lineNum);
    }

    block.insertBefore(gutter, codeEl);
    block.classList.add("ln-processed");
  });
}

// ── Copy code block ──
window.copyCodeBlock = function (btn) {
  const code = btn.closest(".code-block")?.querySelector("code");
  if (!code) return;
  const text = code.textContent;
  navigator.clipboard.writeText(text).then(() => {
    btn.classList.add("copied");
    btn.innerHTML =
      '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5 9.5 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    setTimeout(() => {
      btn.classList.remove("copied");
      btn.innerHTML =
        '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="3.5" y="2.5" width="6" height="7" rx="1" stroke="currentColor" stroke-width="1.2"/><path d="M2.5 4.5v5a1 1 0 001 1h3" stroke="currentColor" stroke-width="1.2"/></svg> Copy';
    }, 2000);
  });
};

function scrollToBottom(el, force) {
  // Resolve the scrollable container (chatMessages), regardless of what's passed
  let target;
  if (typeof el === "string") {
    target = document.getElementById(el);
  } else if (el && el.classList?.contains("chat-messages")) {
    target = el;
  } else {
    target = document.getElementById("chatMessages");
  }
  if (!target) return;

  // Smart scroll: only scroll if user hasn't scrolled up (or forced)
  if (!force) {
    const threshold = 100;
    const isNearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < threshold;
    if (!isNearBottom) return;
  }

  requestAnimationFrame(() => {
    target.scrollTop = target.scrollHeight;
  });
}

function sanitizeText(text) {
  if (!text) return "Thinking...";
  return (
    text
      .replace(/<[^>]*>/g, "")
      .trim()
      .slice(0, 120) || "Thinking..."
  );
}

// ── Image Download ──
window.downloadImage = function (idxOrUrl, prompt) {
  let url, name;
  if (typeof idxOrUrl === "number") {
    // Index-based lookup from gallery
    const entry = imageGallery[idxOrUrl];
    if (!entry) {
      showToast("Image not found", "error");
      return;
    }
    url = entry.url;
    name = entry.prompt;
  } else {
    // Direct URL from lightbox
    url = idxOrUrl;
    name = prompt || "image";
  }
  // Create a temporary download link
  const link = document.createElement("a");
  link.href = url;
  // Generate a filename from the prompt or use a timestamp
  const safeName = name
    ? name
        .replace(/[^a-zA-Z0-9]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "")
        .slice(0, 40) || "image"
    : "image";
  link.download = `dubu_${safeName}_${Date.now()}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("Image downloaded", "success", 1500);
};

// ── Image Gallery ──
window.toggleGallery = function () {
  const overlay = document.getElementById("galleryOverlay");
  const panel = document.getElementById("galleryPanel");
  const isOpen = panel.classList.contains("open");
  if (isOpen) {
    panel.classList.remove("open");
    overlay.classList.remove("visible");
  } else {
    overlay.classList.add("visible");
    panel.classList.add("open");
    renderGallery();
  }
};

window.openGalleryImage = function (idx) {
  const entry = imageGallery[idx];
  if (!entry) {
    showToast("Image not found in gallery", "error");
    return;
  }

  const lightbox = document.getElementById("lightbox");
  const img = lightbox.querySelector(".lightbox-img");
  const info = lightbox.querySelector(".lightbox-info");
  img.src = entry.url;
  info.innerHTML = `<strong>Prompt:</strong> ${escHtml(entry.prompt)}<br><strong>Model:</strong> ${escHtml(entry.model)}`;
  lightbox.style.display = "flex";
  // Set download button data
  const dlBtn = lightbox.querySelector(".lightbox-dl");
  dlBtn.setAttribute("data-url", entry.url);
  dlBtn.setAttribute("data-prompt", entry.prompt);

  // Add keyboard listener
  document.addEventListener("keydown", closeLightboxOnEsc);
};

window.closeLightbox = function () {
  document.getElementById("lightbox").style.display = "none";
  document.removeEventListener("keydown", closeLightboxOnEsc);
};

function closeLightboxOnEsc(e) {
  if (e.key === "Escape") window.closeLightbox();
}

window.clearGallery = function () {
  imageGallery = [];
  updateGalleryBadge();
  renderGallery();
  showToast("Gallery cleared", "info", 1500);
};

function updateGalleryBadge() {
  const badge = document.getElementById("galleryBadge");
  if (!badge) return;
  const count = imageGallery.length;
  badge.textContent = count;
  badge.style.display = count > 0 ? "flex" : "none";
}

function renderGallery() {
  const grid = document.getElementById("galleryGrid");
  if (!grid) return;

  if (imageGallery.length === 0) {
    grid.innerHTML = `<div class="gallery-empty">
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <rect x="4" y="8" width="32" height="24" rx="3" stroke="currentColor" stroke-width="1.5" opacity="0.3"/>
        <circle cx="14" cy="18" r="3" stroke="currentColor" stroke-width="1.5" opacity="0.3"/>
        <path d="M8 28l8-8 6 6 6-6 4 4v4H8z" fill="currentColor" opacity="0.1" stroke="currentColor" stroke-width="1" opacity="0.3"/>
      </svg>
      <p>No images generated yet</p>
      <p class="gallery-hint">Type <kbd>/imagine &lt;prompt&gt;</kbd> to generate images</p>
    </div>`;
    return;
  }

  grid.innerHTML = [...imageGallery]
    .reverse()
    .map((img, i) => {
      const idx = imageGallery.length - 1 - i;
      return `<div class="gallery-item">
      <img src="${img.url}" alt="${escHtml(img.prompt)}" loading="lazy" onclick="openGalleryImage(${idx})">
      <div class="gallery-item-overlay">
        <span class="gallery-item-prompt">${escHtml(img.prompt.slice(0, 60))}</span>
        <span class="gallery-item-model">${escHtml(img.model)}</span>
        <div class="gallery-item-actions">
          <button class="gallery-item-dl" onclick="event.stopPropagation();downloadImage(${idx})" title="Download image">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 2v6M3 5l3 3 3-3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 9v1a1 1 0 001 1h6a1 1 0 001-1V9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
          </button>
        </div>
      </div>
    </div>`;
    })
    .join("");
}

function escHtml(text) {
  const d = document.createElement("div");
  d.textContent = text;
  return d.innerHTML;
}

// ── Export conversation as Markdown ──
window.exportConversation = function () {
  const messages = document.getElementById("agentMessages")?.querySelectorAll(".msg");
  if (!messages || messages.length === 0) {
    showToast("Nothing to export", "warning", 2000);
    return;
  }

  let md = `# Dubu AI Conversation\n*Exported ${new Date().toLocaleString()}*\n\n---\n\n`;

  messages.forEach((msg) => {
    const nameEl = msg.querySelector(".msg-name");
    const contentEl = msg.querySelector(".msg-content");
    const author = nameEl?.textContent || "Unknown";
    const text = contentEl?.innerText?.trim() || "";
    
    if (!text) return;
    
    md += `### ${author}\n\n${text}\n\n---\n\n`;
  });

  // Create and download
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  
  // Generate filename from conversation title or timestamp
  const activeConvo = conversations.find(c => c.id === currentConversationId);
  const title = activeConvo?.title || "chat";
  const safeName = title.replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "conversation";
  a.download = `dubu-${safeName}.md`;
  
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  showToast("Conversation exported as Markdown", "success", 2500);
};

// ── Conversation Persistence ──
async function saveCurrentConversation() {
  if (!currentConversationId || agentHistory.length === 0) return;
  try {
    // Save all history messages to the server conversation
    for (const msg of agentHistory) {
      await AgentAPI.conversationAddMessage(currentConversationId, msg);
    }
    // Clear history after saving (they're now on the server)
    // Actually we need to track which messages have been saved
    // Simpler approach: use a dedicated save endpoint
  } catch (e) {
    console.warn("Failed to save conversation:", e.message);
  }
}

// ── Auto generate conversation title from first exchange ──
async function autoGenerateTitle() {
  if (!currentConversationId) return;
  // Generate title only for the first exchange (2 messages: user + assistant)
  if (agentHistory.length !== 2) return;
  
  const title = await AgentAPI.generateConversationTitle(currentConversationId);
  if (title) {
    // Update the title in the sidebar without full reload
    loadConversationList();
    // Also update the topbar label if it's showing the default title
    const modelLabel = document.getElementById("topbarModelLabel");
    if (modelLabel && modelLabel.textContent === "Dubu AI") {
      // Keep the model label as is
    }
  }
}

async function createNewConversation() {
  try {
    const convo = await AgentAPI.createConversation("New Chat");
    currentConversationId = convo.id;
    localStorage.setItem("dubu_last_convo_id", convo.id);
    return convo;
  } catch (e) {
    console.warn("Failed to create conversation:", e.message);
    return null;
  }
}

async function loadConversationList() {
  const list = document.getElementById("convList");
  if (!list) return;
  try {
    conversations = await AgentAPI.listConversations();
    if (conversations.length === 0) {
      list.innerHTML =
        '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:11px">No conversations yet</div>';
      return;
    }
    list.innerHTML = conversations
      .map((c) => {
        const isActive = c.id === currentConversationId;
        const preview = c.preview || "Empty chat";
        return `<div class="conv-item ${isActive ? "active" : ""}" data-id="${c.id}" onclick="selectConversation('${c.id}')" title="${escHtml(preview)}">
        <span class="conv-item-title">${escHtml(c.title || "New Chat")}</span>
        <button class="conv-item-del" onclick="event.stopPropagation();deleteConversation('${c.id}')" title="Delete conversation">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
        </button>
      </div>`;
      })
      .join("");
  } catch (e) {
    console.warn("Failed to load conversations:", e.message);
  }
}

window.deleteConversation = async function (id) {
  try {
    await AgentAPI.deleteConversation(id);
    if (id === currentConversationId) {
      // If deleting current conversation, create a new one
      currentConversationId = null;
      localStorage.removeItem("dubu_last_convo_id");
      showWelcomeMessage();
      agentHistory = [];
      createNewConversation().then((convo) => {
        if (convo) {
          currentConversationId = convo.id;
          loadConversationList();
        }
      });
    }
    loadConversationList();
    showToast("Conversation deleted", "info", 2000);
  } catch (e) {
    showToast("Failed to delete: " + e.message, "error");
  }
};

// ── Sidebar conversation search ──
window.filterConversations = function (query) {
  const list = document.getElementById("convList");
  if (!list) return;
  const q = query.toLowerCase().trim();
  
  const items = list.querySelectorAll(".conv-item");
  items.forEach((item) => {
    const title = item.querySelector(".conv-item-title")?.textContent?.toLowerCase() || "";
    const shouldShow = !q || title.includes(q);
    item.style.display = shouldShow ? "" : "none";
  });
};

window.selectConversation = async function (id, silent = false) {
  if (id === currentConversationId) return;

  // Each conversation is its own independent session — don't abort anything.
  // The previous conversation's streaming continues in the background
  // and saves to the server on its own.

  // Remove any streaming cursors from the current view (they belong to the old chat)
  const streamCursor = document.querySelector(".streaming-cursor");
  if (streamCursor) streamCursor.remove();

  // Remove any suggested questions from the current view
  if (suggestedQuestionsContainer) {
    suggestedQuestionsContainer.remove();
    suggestedQuestionsContainer = null;
  }

  try {
    const convo = await AgentAPI.getConversation(id);
    currentConversationId = convo.id;
    localStorage.setItem("dubu_last_convo_id", convo.id);

    // Restore messages
    agentHistory = (convo.messages || []).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Clear and rebuild chat
    const container = document.getElementById("agentMessages");
    container.innerHTML = "";

    for (const msg of agentHistory) {
      addMessage(msg.role, msg.content, msg.role === "user" ? "You" : "Dubu AI");
    }

    // Scroll to bottom after restoring all messages
    scrollToBottom(null, true);

    // Update sidebar
    loadConversationList();

    if (agentHistory.length === 0) {
      showWelcomeMessage();
    }
  } catch (e) {
    if (!silent) {
      showToast("Failed to load conversation: " + e.message, "error");
    }
    throw e; // Re-throw so callers (like autoRestoreConversation) can handle it
  }
};

async function autoRestoreConversation() {
  const lastId = localStorage.getItem("dubu_last_convo_id");
  if (lastId) {
    try {
      await window.selectConversation(lastId, true); // silent — no toast for expected 404
      return;
    } catch (e) {
      // Conversation may have been deleted or server restarted
      localStorage.removeItem("dubu_last_convo_id");
    }
  }

  // Try to load most recent conversation
  try {
    const list = await AgentAPI.listConversations();
    if (list.length > 0) {
      await window.selectConversation(list[0].id, true); // silent
    }
  } catch (e) {
    /* start fresh */
  }
}

// ── Image Gallery Persistence ──
function saveGalleryToStorage() {
  try {
    // Only save metadata, not full image data URLs (too large)
    const meta = imageGallery.map((img) => ({
      prompt: img.prompt,
      model: img.model,
      timestamp: img.timestamp,
    }));
    localStorage.setItem("dubu_gallery_meta", JSON.stringify(meta));
  } catch (e) {
    /* storage full */
  }
}

function restoreGalleryFromStorage() {
  try {
    // Image data URLs can't be restored from reload (not persisted)
    // But we can clear the gallery since images are in chat history
    imageGallery = [];
    updateGalleryBadge();
  } catch (e) {
    /* silent */
  }
}

function showWelcomeMessage() {
  const container = document.getElementById("agentMessages");
  container.innerHTML = `
    <div class="msg msg-agent">
      <div class="msg-avatar"><svg width="28" height="28" viewBox="0 0 28 28" fill="none"><rect width="28" height="28" rx="8" fill="currentColor" opacity="0.15"/><path d="M14 6L8 10v8l6 4 6-4v-8l-6-4z" fill="currentColor" opacity="0.4"/><circle cx="14" cy="14" r="3.5" fill="currentColor"/></svg></div>
      <div class="msg-body">
        <div class="msg-name">Dubu AI</div>
        <div class="msg-content">
          <p style="font-size:15px;font-weight:600;margin-bottom:8px">Welcome to Dubu AI</p>
          <p style="color:var(--text-secondary);margin-bottom:12px">I use the full NVIDIA NIM model catalog with automatic model selection and fallback.</p>
          <div class="capabilities">
            <div class="cap">Chat & Q&A</div>
            <div class="cap">Code & Programming</div>
            <div class="cap">Image Generation</div>
            <div class="cap">Vision Analysis</div>
            <div class="cap">Deep Reasoning</div>
            <div class="cap">Translation</div>
            <div class="cap">Web Search</div>
            <div class="cap">File Analysis</div>
          </div>
        </div>
      </div>
    </div>`;
}

// ── Custom Model Dropdown ──
const QUICK_PRESETS = [
  { id: "", label: "Auto", icon: "", name: "Auto-Select" },
  { id: "deepseek-ai/deepseek-v4-flash", label: "DeepSeek Flash", icon: "", name: "DeepSeek V4 Flash" },
  { id: "nvidia/llama-3.3-nemotron-super-49b-v1.5", label: "Nemotron 49B", icon: "", name: "Nemotron Super 49B" },
  { id: "deepseek-ai/deepseek-v4-pro", label: "DeepSeek Pro", icon: "", name: "DeepSeek V4 Pro" },
  { id: "microsoft/phi-4-mini-instruct", label: "Phi-4 Mini", icon: "", name: "Phi-4 Mini" },
];

function updateModelDropdownTrigger() {
  const currentId = state.get("agentModel") || "";
  const triggerIcon = document.getElementById("mdTriggerIcon");
  const triggerName = document.getElementById("mdTriggerName");
  
  if (currentId === "") {
    triggerIcon.textContent = "";
    triggerName.textContent = "Auto-Select";
  } else {
    const model = loadedModels.find(m => m.id === currentId);
    if (model) {
      triggerIcon.textContent = model.icon || "";
      triggerName.textContent = model.name;
    } else {
      const shortName = currentId.split("/").pop() || currentId;
      triggerIcon.textContent = "";
      triggerName.textContent = shortName;
    }
  }
}

window.toggleModelDropdown = function () {
  const trigger = document.getElementById("mdTrigger");
  const panel = document.getElementById("mdPanel");
  const isOpen = panel.classList.contains("open");
  
  if (isOpen) {
    trigger.classList.remove("open");
    panel.classList.remove("open");
  } else {
    // Check if there's enough space below to open downward
    const triggerRect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - triggerRect.bottom - 8;
    const panelMaxHeight = 380;
    
    if (spaceBelow < panelMaxHeight) {
      panel.classList.add("upward");
    } else {
      panel.classList.remove("upward");
    }
    
    trigger.classList.add("open");
    panel.classList.add("open");
    renderDropdownContent();
    setTimeout(() => {
      document.getElementById("mdSearchInput")?.focus();
    }, 100);
  }
};

function closeModelDropdown() {
  document.getElementById("mdTrigger")?.classList.remove("open");
  document.getElementById("mdPanel")?.classList.remove("open");
  const searchInput = document.getElementById("mdSearchInput");
  if (searchInput) {
    searchInput.value = "";
    filterModelDropdown("");
  }
}

window.selectModelFromDropdown = function (id) {
  state.set("agentModel", id);
  updateModelDropdownTrigger();
  closeModelDropdown();
  
  // Update quick presets active state
  document.querySelectorAll(".md-quick-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.model === id);
  });
  
  // Update list items active state
  document.querySelectorAll(".md-item").forEach(item => {
    item.classList.toggle("active", item.dataset.model === id);
  });
  
  const model = loadedModels.find(m => m.id === id);
  showToast(model ? `Model: ${model.name}` : "Auto-Select mode", "info", 1500);
};

window.filterModelDropdown = function (query) {
  renderDropdownContent(query);
};

// ── Shared tooltip helpers for model dropdown ──
function populateTooltip(model) {
  const tooltip = document.getElementById("mdTooltip");
  if (!tooltip || !model) {
    if (tooltip) tooltip.classList.remove("visible");
    return;
  }
  document.getElementById("mdtIcon").textContent = model.icon || "";
  document.getElementById("mdtName").textContent = model.name || model.id || "";
  document.getElementById("mdtDesc").textContent = model.desc || "";
  
  // Badges
  const badgesEl = document.getElementById("mdtBadges");
  let badgesHtml = "";
  if (model.quality) {
    const qClass = model.quality >= 9 ? "quality-high" : model.quality >= 7 ? "quality-mid" : "";
    if (qClass) badgesHtml += `<span class="mdt-badge ${qClass}">Q${model.quality}</span>`;
  }
  if (model.speed) {
    badgesHtml += `<span class="mdt-badge speed-fast">${model.speed === "very_fast" ? "FAST " : ""}${model.speed.replace("_", " ")}</span>`;
  }
  if (model.group) {
    badgesHtml += `<span class="mdt-badge group">${escHtml(model.group)}</span>`;
  }
  badgesEl.innerHTML = badgesHtml;
  
  // Capabilities
  const capsEl = document.getElementById("mdtCaps");
  if (model.capabilities && model.capabilities.length > 0) {
    capsEl.innerHTML = model.capabilities
      .slice(0, 6)
      .map(c => `<span>${escHtml(c)}</span>`)
      .join("");
    capsEl.style.display = "";
  } else {
    capsEl.style.display = "none";
  }
}

function positionTooltip(targetEl) {
  const tooltip = document.getElementById("mdTooltip");
  const panel = document.getElementById("mdPanel");
  if (!tooltip || !panel) return;
  const targetRect = targetEl.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  
  tooltip.style.position = "fixed";
  
  const tooltipWidth = 240;
  const gap = 6;
  let leftPos = targetRect.left - gap - tooltipWidth;
  let flipped = false;
  
  if (leftPos < panelRect.left + 8) {
    leftPos = targetRect.right + gap;
    flipped = true;
  }
  
  tooltip.classList.toggle("flip", flipped);
  tooltip.style.left = leftPos + "px";
  tooltip.style.top = Math.max(panelRect.top + 8, targetRect.top - 2) + "px";
}

function setupTooltipListeners(elements) {
  const tooltip = document.getElementById("mdTooltip");
  if (!tooltip) return;
  
  elements.forEach(el => {
    const modelId = el.dataset.model;
    
    el.addEventListener("mouseenter", () => {
      if (tooltip._hideTimer) {
        clearTimeout(tooltip._hideTimer);
        tooltip._hideTimer = null;
      }
      
      const model = loadedModels.find(m => m.id === modelId);
      if (!model) {
        tooltip.classList.remove("visible");
        return;
      }
      
      populateTooltip(model);
      positionTooltip(el);
      tooltip.classList.add("visible");
    });
    
    el.addEventListener("mouseleave", () => {
      tooltip._hideTimer = setTimeout(() => {
        tooltip.classList.remove("visible");
        tooltip._hideTimer = null;
      }, 80);
    });
  });
}

function renderDropdownContent(filter = "") {
  // Hide any visible tooltip from previous render
  const tooltip = document.getElementById("mdTooltip");
  if (tooltip) tooltip.classList.remove("visible");
  
  const currentId = state.get("agentModel") || "";
  const q = filter.toLowerCase().trim();
  
  // Always show quick presets when not filtering
  const quickList = document.getElementById("mdQuickList");
  const quickSection = document.getElementById("mdQuickSection");
  const allSection = document.getElementById("mdAllSection");
  const emptyEl = document.getElementById("mdEmpty");
  
  if (!q) {
    quickSection.style.display = "";
    quickList.innerHTML = QUICK_PRESETS
      .map(p => `<button class="md-quick-btn ${p.id === currentId ? "active" : ""}" data-model="${p.id}" onclick="selectModelFromDropdown('${p.id}')">${p.label}</button>`)
      .join("");
  } else {
    quickSection.style.display = "none";
  }
  
  // Render all models
  const models = loadedModels.length > 0 ? loadedModels : [
    { id: "", name: "Auto-Select", icon: "", desc: "Auto-select best model", group: "" },
  ];
  
  const filtered = q
    ? models.filter(m => 
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        (m.desc || "").toLowerCase().includes(q) ||
        (m.group || "").toLowerCase().includes(q)
      )
    : models;
  
  // ── Setup quick preset tooltips ──
  setupTooltipListeners(quickList.querySelectorAll(".md-quick-btn"));
  
  // Show empty state if no models match
  if (filtered.length === 0) {
    allSection.style.display = "none";
    emptyEl.style.display = "flex";
    return;
  }
  
  emptyEl.style.display = "none";
  allSection.style.display = "";
  
  // Group models by category
  const GROUP_ORDER = [
    "Smart", "Vision", "Code", "Image Gen", "Creative",
    "Fast", "Finance", "Medical", "Embeddings", "Safety", "Other",
  ];
  
  const groups = {};
  filtered.forEach(m => {
    const g = m.group || "Other";
    if (!groups[g]) groups[g] = [];
    groups[g].push(m);
  });
  
  // Sort groups by predefined order; models within each group are already sorted by quality
  const sortedGroups = Object.entries(groups).sort((a, b) => {
    const ia = GROUP_ORDER.indexOf(a[0]);
    const ib = GROUP_ORDER.indexOf(b[0]);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
  
  const list = document.getElementById("mdList");
  let listHtml = "";
  sortedGroups.forEach(([groupName, models]) => {
    listHtml += `<div class="md-group-label">${escHtml(groupName)}</div>`;
    models.forEach(m => {
      const isActive = m.id === currentId;
      const modelIdDisplay = m.id ? `<div class="md-item-id">${escHtml(m.id)}</div>` : "";
      const checkHtml = `<div class="md-item-check"><svg viewBox="0 0 10 10" fill="none"><path d="M2 5l2 2 4-4" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`;
      listHtml += `<div class="md-item ${isActive ? "active" : ""}" data-model="${m.id}" onclick="selectModelFromDropdown('${m.id}')">
        <span class="md-item-icon">${m.icon || ""}</span>
        <div class="md-item-info">
          <div class="md-item-name">${escHtml(m.name)}</div>
          ${modelIdDisplay}
        </div>
        ${checkHtml}
      </div>`;
    });
  });
  list.innerHTML = listHtml;
  
  // ── Setup hover tooltips on list items ──
  setupTooltipListeners(list.querySelectorAll(".md-item"));
}

// ── Model Picker (Dynamic) ──
async function loadModelsFromServer() {
  try {
    const resp = await fetch("/api/models");
    if (!resp.ok) throw new Error("Failed to fetch models");
    const data = await resp.json();
    const all = data.all || {};
    loadedModels = Object.entries(all).map(([id, info]) => ({
      id,
      name: info.name || id.split("/").pop(),
      icon: getModelIcon(id, info),
      desc: (info.capabilities || []).slice(0, 3).join(", ") || "General purpose",
      group: getModelGroup(info),
      quality: info.quality || 0,
      speed: info.speed || "medium",
      capabilities: info.capabilities || [],
    }));
    // Sort: quality descending, then by name
    loadedModels.sort((a, b) => b.quality - a.quality || a.name.localeCompare(b.name));
    // Add Auto-Select as the first entry (virtual model, not from server)
    loadedModels.unshift({
      id: "",
      name: "Auto-Select",
      icon: "",
      desc: "Automatically selects the best model for your task",
      group: "",
      quality: 99,
    });
  } catch (e) {
    console.warn("Failed to load models from server:", e.message);
    // Fallback: use a basic set
    loadedModels = [
      {
        id: "",
        name: "Auto-Select",
        icon: "",
        desc: "Automatically selects the best model",
        group: "",
        quality: 99,
      },
    ];
  }
}

// ── Settings ──
window.loadSettings = function () {
  const temp = state.get("temperature");
  document.getElementById("setTemp").value = temp;
  const range = document.getElementById("setTempRange");
  if (range) range.value = temp;
  document.getElementById("setAutoFallback").checked = state.get("autoFallback") !== false;
  document.getElementById("setAutoSelect").checked = state.get("autoModelSelect") !== false;
  document.getElementById("setWebSearch").checked = state.get("webSearch") || false;
  document.getElementById("setDeepThink").checked = state.get("deepThink") || false;
  syncThemePicker();
};

window.saveSettings = function () {
  state.set("temperature", parseFloat(document.getElementById("setTemp").value) || 0.7);
  state.set("autoFallback", document.getElementById("setAutoFallback").checked);
  state.set("autoModelSelect", document.getElementById("setAutoSelect").checked);
  state.set("webSearch", document.getElementById("setWebSearch").checked);
  state.set("deepThink", document.getElementById("setDeepThink").checked);
  showToast("Settings saved", "success", 2000);
};

window.testApi = async function () {
  const status = document.getElementById("statusText");
  const indicator = document.getElementById("statusIndicator");
  status.textContent = "Testing...";
  indicator.className = "status-dot-lg testing";
  try {
    const resp = await fetch("/api/health");
    if (resp.ok) {
      const data = await resp.json();
      status.textContent = `Connected! ${data.modelsAvailable} models`;
      indicator.className = "status-dot-lg connected";
      document.getElementById("tsDot").className = "ts-dot connected";
      showToast("Connection successful", "success", 3000);
    } else {
      status.textContent = `Error: ${resp.status}`;
      indicator.className = "status-dot-lg error";
    }
  } catch {
    status.textContent = "Cannot reach server";
    indicator.className = "status-dot-lg error";
    showToast("Cannot reach server.", "error");
  }
};

// ── Init ──
document.addEventListener("DOMContentLoaded", () => {
  applyTheme(state.get("theme") || "dark");

  // File input setup
  setupFileInput();
  setupDragDrop();

  // Enter to send
  document.getElementById("agentInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendToAgent();
    }
  });

  // Auto-resize textarea
  document.getElementById("agentInput")?.addEventListener("input", function () {
    this.style.height = "auto";
    this.style.height = Math.min(this.scrollHeight, 120) + "px";
  });

  // Temperature range sync
  const tempRange = document.getElementById("setTempRange");
  const tempInput = document.getElementById("setTemp");
  if (tempRange && tempInput) {
    tempRange.addEventListener("input", () => {
      tempInput.value = tempRange.value;
    });
    tempInput.addEventListener("change", () => {
      tempRange.value = tempInput.value;
    });
  }

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    const mod = e.metaKey || e.ctrlKey;

    if (mod && e.key === "k") {
      e.preventDefault();
      document.getElementById("agentInput")?.focus();
    }
    if (mod && e.key === "l") {
      e.preventDefault();
      clearAgent();
    }
    if (mod && e.key === "u") {
      e.preventDefault();
      attachFile();
    }
    if (mod && e.key === "f") {
      e.preventDefault();
      toggleWebSearch();
    }
    if (mod && e.key === "d") {
      e.preventDefault();
      toggleDeepThink();
    }
    if (mod && e.key === "g") {
      e.preventDefault();
      toggleGallery();
    }
    if (mod && e.key === "t") {
      e.preventDefault();
      toggleTheme();
    }
    if (mod && e.key === ",") {
      e.preventDefault();
      switchPanel("settings");
    }

    if (e.key === "Escape") {
      closeMobileSidebar();
      closeModelDropdown();
      closeSettings();
    }
  });

  // Mobile sidebar cleanup on resize
  window.matchMedia("(min-width: 769px)").addEventListener("change", (mq) => {
    if (mq.matches) closeMobileSidebar();
  });

  // Silent API health check
  setTimeout(() => {
    fetch("/api/health")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        document.getElementById("tsDot").className = "ts-dot connected";
        document.getElementById("topbarStatus").querySelector(".ts-text").textContent =
          `${data.modelsAvailable} models`;
      })
      .catch(() => {});
  }, 1000);

  // Init model dropdown trigger
  updateModelDropdownTrigger();
  
  // Close dropdown on outside click
  document.addEventListener("click", (e) => {
    const dropdown = document.getElementById("modelDropdown");
    if (dropdown && !dropdown.contains(e.target)) {
      closeModelDropdown();
    }
  });

  // Restore conversations
  setTimeout(() => {
    autoRestoreConversation().then(() => loadConversationList());
  }, 200);

  // Check for tool transfer text from educational tools
  setTimeout(() => {
    const transfer = localStorage.getItem('dubu_tool_transfer');
    if (transfer) {
      localStorage.removeItem('dubu_tool_transfer');
      const textarea = document.getElementById("userInput");
      if (textarea) {
        textarea.value = transfer;
        textarea.focus();
        textarea.style.height = "auto";
        textarea.style.height = textarea.scrollHeight + "px";
      }
    }
  }, 500);

  // Restore web search and deep think states
  if (state.get("webSearch")) toggleWebSearch();
  if (state.get("deepThink")) toggleDeepThink();

  // Restore gallery from storage (metadata only)
  restoreGalleryFromStorage();

  // Load models from server for the picker
  loadModelsFromServer();

  // Check auth status on load
  checkAuthStatus();
});
