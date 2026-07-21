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

// ── Streaming text accumulator ──
// Accumulates tokens in a string and sets textContent directly (avoids O(n²) +=).
// DOM updates happen on every token for smooth ChatGPT-style character-by-character typing.
let _streamText = "";
let imageGallery = []; // { url, prompt, model, timestamp }
let loadedModels = []; // Dynamically fetched from server /api/models

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

  // ── Auto-create conversation if none exists (like ChatGPT/DeepSeek) ──
  if (!currentConversationId) {
    try {
      const convo = await AgentAPI.createConversation("New Chat");
      currentConversationId = convo.id;
      localStorage.setItem("dubu_last_convo_id", convo.id);
      loadConversationList();
    } catch (e) {
      console.warn("Failed to create conversation:", e.message);
      btn.disabled = false;
      if (stopBtn) {
        stopBtn.style.display = "none";
        btn.style.display = "flex";
      }
      showToast("Failed to start conversation: " + e.message, "error");
      return;
    }
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

  // Show attached image previews in the user's message bubble
  const imagePreviews = attachedFiles.filter((f) => f.type === "image");
  if (imagePreviews.length > 0) {
    const userMsgEl = document.querySelector(".msg-user:last-child .msg-body");
    if (userMsgEl) {
      const previewsHtml = imagePreviews.map(function(f, i) {
        return '<div class="msg-attachment-preview"><img src="' + f.data + '" alt="' + escHtml(f.name) + '" class="msg-attachment-img" loading="lazy"></div>';
      }).join("");
      userMsgEl.insertAdjacentHTML("afterbegin", '<div class="msg-attachments">' + previewsHtml + '</div>');
    }
  }

  // Save user message to server conversation (auto-created above if needed)
  AgentAPI.conversationAddMessage(currentConversationId, {
    role: "user",
    content: userMessage,
  }).catch(() => {});

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

  // Show typing indicator (bouncing dots) while waiting for first token
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

          case "token":              // Real-time token streaming — live markdown rendering
            if (!thinkingDiv.dataset.streaming) {
              // First token — replace typing dots with streaming content
              thinkingDiv.dataset.streaming = "true";
              _streamText = "";
              bubble.innerHTML = `<div class="msg-name">${escHtml(modelName || "Dubu AI")}</div><div class="msg-content streaming"><div class="streaming-text"></div><span class="streaming-cursor">▊</span></div>`;
              // Force scroll on first token so user sees the bot start typing
              scrollToBottom(null, true);
            }
            // Accumulate text and render markdown live
            _streamText += data.content || "";
            const streamTextEl = bubble.querySelector(".streaming-text");
            if (streamTextEl) {
              streamTextEl.innerHTML = formatMessageHtml(_streamText);
            }
            scrollToBottom();
            break;

          case "result":
            {
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
            } else if (wasStreaming) {
              // ── Streamed text response — finalize the streaming bubble ──
              // Remove the streaming cursor
              const cursor = bubble.querySelector(".streaming-cursor");
              if (cursor) cursor.remove();
              // Get the accumulated text and format as HTML
              const streamText = _streamText || fullResponse;
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
            }

            document.getElementById("tsDot").className = "ts-dot connected";
            document.getElementById("topbarStatus").querySelector(".ts-text").textContent =
              modelName || "Ready";
            break;

          }
          case "error":
            thinkingDiv.remove();
            // Show a proper error card with retry button
            showErrorCard(data.content || "The model failed to respond.");
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

  const streamContent = _streamText || lastAgent.dataset?.streamContent;
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
    // Save partial response to server (like ChatGPT saves mid-stream)
    if (currentConversationId) {
      AgentAPI.conversationAddMessage(currentConversationId, {
        role: "assistant",
        content: streamContent,
      }).catch(() => {});
    }
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
      "Are there any edge cases I should handle?",
    ];
  }

  if (lower.includes("because") || lower.includes("therefore") || lower.includes("reason") || lower.includes("first") || lower.includes("step")) {
    return [
      "Can you elaborate more on that?",
      "What are the alternatives?",
      "Can you give me an example?",
    ];
  }

  if (lower.includes("image") || lower.includes("picture") || lower.includes("design") || lower.includes("color") || lower.includes("layout")) {
    return [
      "Can you generate a similar image?",
      "Can you describe this in more detail?",
      "What style would work best?",
    ];
  }

  if (lower.includes("math") || lower.includes("equation") || lower.includes("calculate") || lower.includes("formula") || lower.includes("solve")) {
    return [
      "Can you walk me through the steps again?",
      "What real-world application does this have?",
      "Can you test this with different values?",
    ];
  }

  return [
    "Can you tell me more?",
    "What else should I know about this?",
    "Can you give me a practical example?",
  ];
}

// ── Show error card with retry button ──
// Shows a friendly error message with a retry button that re-sends
// the last user message without removing it from the DOM.
function showErrorCard(errorMessage) {
  const container = document.getElementById("agentMessages");
  const div = document.createElement("div");
  div.className = "msg msg-agent";
  div.innerHTML = `
    <div class="msg-avatar"><svg width="28" height="28" viewBox="0 0 28 28" fill="none"><rect width="28" height="28" rx="8" fill="currentColor" opacity="0.15"/><path d="M14 6L8 10v8l6 4 6-4v-8l-6-4z" fill="currentColor" opacity="0.4"/><circle cx="14" cy="14" r="3.5" fill="currentColor"/></svg></div>
    <div class="msg-body">
      <div class="msg-name">Error</div>
      <div class="msg-content">
        <div class="error-card">
          <div class="error-card-icon">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.3"/>
              <path d="M10 6v4M10 13v1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </div>
          <div class="error-card-text">${sanitizeText(errorMessage)}</div>
          <button class="error-retry-btn" onclick="retryLastRequest()">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 7a5 5 0 015-5 5 5 0 015 5M12 7a5 5 0 01-5 5 5 5 0 01-5-5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
              <path d="M10.5 7L12 5.5 13.5 7M.5 7L2 5.5 3.5 7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Retry
          </button>
          <button class="error-dismiss-btn" onclick="this.closest('.msg-agent').remove()">
            Dismiss
          </button>
        </div>
      </div>
    </div>`;
  container.appendChild(div);
  scrollToBottom(container);
}

// ── Retry last request ──
// Re-sends the last user message to the agent without removing DOM elements.
// Unlike regenerate, this keeps the conversation history intact.
window.retryLastRequest = function () {
  if (currentAgentRequest) {
    currentAgentRequest.abort();
    currentAgentRequest = null;
  }

  // Find the last user message from agentHistory
  let lastUserMsg = null;
  for (let i = agentHistory.length - 1; i >= 0; i--) {
    if (agentHistory[i].role === "user") {
      lastUserMsg = agentHistory[i].content;
      break;
    }
  }
  if (!lastUserMsg) {
    showToast("No previous message to retry", "warning");
    return;
  }

  // Remove the last error message from DOM (the one with the retry button)
  const container = document.getElementById("agentMessages");
  const lastAgent = container?.querySelector(".msg-agent:last-child");
  if (lastAgent && lastAgent.querySelector(".error-retry-btn")) {
    lastAgent.remove();
  }

  // Reset the send button state
  const sendBtn = document.getElementById("agentSendBtn");
  const stopBtn = document.getElementById("agentStopBtn");
  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.style.display = "none";
  }
  if (stopBtn) stopBtn.style.display = "flex";

  // Create a new thinking indicator and send
  const thinkingDiv = document.createElement("div");
  thinkingDiv.className = "msg msg-agent";
  thinkingDiv.innerHTML = `<div class="msg-avatar"><svg width="28" height="28" viewBox="0 0 28 28" fill="none"><rect width="28" height="28" rx="8" fill="currentColor" opacity="0.15"/><path d="M14 6L8 10v8l6 4 6-4v-8l-6-4z" fill="currentColor" opacity="0.4"/><circle cx="14" cy="14" r="3.5" fill="currentColor"/></svg></div><div class="msg-body"><div class="thinking-indicator"><div class="thinking-dots"><span></span><span></span><span></span></div><span class="thinking-text">Retrying...</span></div></div>`;
  container.appendChild(thinkingDiv);
  scrollToBottom(container);

  // Bypass sendToAgent's conversation check — reuse existing conversation
  retrySend(lastUserMsg, thinkingDiv);
};

// ── Internal retry send (bypasses sendToAgent's input and conversation logic) ──
function retrySend(userMessage, thinkingDiv) {
  const container = document.getElementById("agentMessages");
  const context = {
    hasImage: false,
    hasDocuments: false,
    webSearch: webSearchEnabled,
    deepThink: deepThinkEnabled,
  };

  let modelName = null;
  let fallbackUsed = false;

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
          let badgeLabel = fallbackUsed ? "Fallback: " : "";
          badgeLabel += modelName || "Model selected";
          if (data.benchmark?.rank) {
            badgeLabel += `  #${data.benchmark.rank}`;
            if (data.benchmark.score) badgeLabel += ` (${data.benchmark.score})`;
          }
          const badgeHtml = `<span class="routing-badge ${fallbackUsed ? "fallback" : ""}">${sanitizeText(badgeLabel)}</span>`;
          bubble.innerHTML = `${badgeHtml}<div class="thinking-indicator"><div class="thinking-dots"><span></span><span></span><span></span></div><span class="thinking-text">Generating...</span></div>`;
          delete thinkingDiv.dataset.streaming;
          delete thinkingDiv.dataset.streamContent;
          break;
        case "token":
          if (!thinkingDiv.dataset.streaming) {
            thinkingDiv.dataset.streaming = "true";
            _streamText = "";
            bubble.innerHTML = `<div class="msg-name">${escHtml(modelName || "Dubu AI")}</div><div class="msg-content streaming"><div class="streaming-text"></div><span class="streaming-cursor">▊</span></div>`;
            scrollToBottom(null, true);
          }
          _streamText += data.content || "";
          const streamTextEl = bubble.querySelector(".streaming-text");
          if (streamTextEl) {
            streamTextEl.innerHTML = formatMessageHtml(_streamText);
          }
          scrollToBottom();
          break;
        case "result": {
          const fullResponse = data.content || "";
          if (data.image) {
            thinkingDiv.remove();
            const imageUrl = `data:image/png;base64,${data.image}`;
            const imgMsg = document.createElement("div");
            imgMsg.className = "msg msg-agent";
            imgMsg.innerHTML = `<div class="msg-avatar"><svg width="28" height="28" viewBox="0 0 28 28" fill="none"><rect width="28" height="28" rx="8" fill="currentColor" opacity="0.15"/><path d="M14 6L8 10v8l6 4 6-4v-8l-6-4z" fill="currentColor" opacity="0.4"/><circle cx="14" cy="14" r="3.5" fill="currentColor"/></svg></div><div class="msg-body"><div class="msg-name">${escHtml(modelName || "Image")}</div><div class="msg-content"><img src="${imageUrl}" class="msg-image" alt="" loading="lazy"></div></div>`;
            container.appendChild(imgMsg);
          } else if (thinkingDiv.dataset.streaming === "true") {
            const cursor = bubble.querySelector(".streaming-cursor");
            if (cursor) cursor.remove();
            const streamText = _streamText || fullResponse;
            const formattedHtml = formatMessageHtml(streamText);
            const contentEl = bubble.querySelector(".msg-content");
            if (contentEl) {
              contentEl.innerHTML = formattedHtml;
              contentEl.classList.remove("streaming");
            }
            bubble.insertAdjacentHTML("beforeend", getActionButtonsHtml());
            setTimeout(() => {
              if (typeof Prism !== "undefined") {
                Prism.highlightAllUnder(bubble);
                addLineNumbers(bubble);
              }
            }, 50);
            agentHistory.push({ role: "assistant", content: streamText });
            const suggestions = generateFollowUpSuggestions(streamText);
            addSuggestedQuestions(suggestions);
            AgentAPI.conversationAddMessage(currentConversationId, {
              role: "assistant", content: streamText,
              model: data.model || modelName,
            }).then(() => { loadConversationList(); autoGenerateTitle(); }).catch(() => {});
          } else {
            thinkingDiv.remove();
            addMessage("agent", fullResponse, modelName || "Dubu AI");
            agentHistory.push({ role: "assistant", content: fullResponse });
            AgentAPI.conversationAddMessage(currentConversationId, {
              role: "assistant", content: fullResponse,
              model: data.model || modelName,
            }).then(() => { loadConversationList(); autoGenerateTitle(); }).catch(() => {});
          }
          document.getElementById("tsDot").className = "ts-dot connected";
          document.getElementById("topbarStatus").querySelector(".ts-text").textContent =
            modelName || "Ready";
          break;
        }
        case "error":
          thinkingDiv.remove();
          showErrorCard(data.content || "Retry failed.");
          break;
      }
      scrollToBottom(container);
    },
    onDone: () => {
      currentAgentRequest = null;
      const sendBtn = document.getElementById("agentSendBtn");
      const stopBtn = document.getElementById("agentStopBtn");
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.style.display = "flex";
      }
      if (stopBtn) stopBtn.style.display = "none";
    },
    onError: (err) => {
      if (thinkingDiv.parentNode) thinkingDiv.remove();
      let userMsg = "Connection error";
      if (err.includes("fetch") || err.includes("network")) userMsg = "Unable to reach the server.";
      else if (err.includes("401") || err.includes("403")) userMsg = "Authentication failed.";
      else if (err.includes("429")) userMsg = "Rate limited. Please wait.";
      else userMsg = err.length > 100 ? err.slice(0, 100) + "..." : err;
      showErrorCard(userMsg);
      currentAgentRequest = null;
      const sendBtn = document.getElementById("agentSendBtn");
      const stopBtn = document.getElementById("agentStopBtn");
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.style.display = "flex";
      }
      if (stopBtn) stopBtn.style.display = "none";
    },
  });
}

// ── Helper to build action buttons HTML (for retry) ──
function getActionButtonsHtml() {
  return `<div class="msg-actions"><button class="msg-action-btn" onclick="copyMsgText(this)" title="Copy"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="3.5" y="2.5" width="6" height="7" rx="1" stroke="currentColor" stroke-width="1.2"/><path d="M2.5 4.5v5a1 1 0 001 1h3" stroke="currentColor" stroke-width="1.2"/></svg></button><button class="msg-action-btn" onclick="regenerateResponse(this)" title="Regenerate"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6a4 4 0 014-4 4 4 0 014 4M10 6a4 4 0 01-4 4 4 4 0 01-4-4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M8.5 6L10 4.5 11.5 6M.5 6L2 4.5 3.5 6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg></button><button class="msg-action-btn feedback-btn" onclick="feedbackMessage(this, 'like')" title="Like"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 6.5L6 2l2 2-1 3h3L7 10H4l-1-3.5z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button><button class="msg-action-btn feedback-btn" onclick="feedbackMessage(this, 'dislike')" title="Dislike"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 5.5L6 10l2-2-1-3h3L7 2H4L3 5.5z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>`;
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

// ── Mobile Sidebar ──
window.toggleMobileSidebar = function () {
  var sidebar = document.getElementById("sidebar");
  var overlay = document.getElementById("mobileSidebarOverlay");
  var hamburger = document.getElementById("hamburgerBtn");
  var isOpen = sidebar.classList.toggle("mobile-open");
  overlay.classList.toggle("visible", isOpen);
  hamburger.classList.toggle("active", isOpen);
  document.body.style.overflow = isOpen ? "hidden" : "";
};

function closeMobileSidebar() {
  var sidebar = document.getElementById("sidebar");
  if (sidebar.classList.contains("mobile-open")) window.toggleMobileSidebar();
}

// ── Settings ──
window.closeSettings = function () {
  document.getElementById("settingsOverlay").classList.remove("visible");
  document.getElementById("settingsPanel").classList.remove("open");
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
    const transfer = localStorage.getItem("dubu_tool_transfer");
    if (transfer) {
      localStorage.removeItem("dubu_tool_transfer");
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
