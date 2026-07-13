// ===== Unified AI Agent Orchestrator =====
// Smart agent that auto-detects what the user wants, routes to the best model,
// and falls back gracefully if models fail. One agent to rule them all.

const CONFIG = require("./config");
const NIMClient = require("./nim");
const { detectIntent, getIntentEmoji, getIntentLabel } = require("./router");
const { getModelInfo, getTaskRoute } = require("./models");

class Orchestrator {
  constructor(options = {}) {
    this.apiKey = options.apiKey || CONFIG.apiKey;
    this.nim = new NIMClient(this.apiKey);
    this.verbose = options.verbose !== false;
  }

  /**
   * Process a user request through the unified agent loop.
   * Auto-detects intent, selects the best model chain, and auto-fallbacks.
   */
  async *process(userMessage, history = [], context = {}) {
    // Clean history: filter out any malformed messages (empty objects, missing role/content)
    const cleanHistory = (history || []).filter(
      (m) =>
        m &&
        typeof m === "object" &&
        typeof m.role === "string" &&
        m.role.length > 0 &&
        typeof m.content === "string",
    );

    // Step 1: Detect the intent / task type
    const intent = detectIntent(userMessage, context);
    const task = intent.task;
    const route = intent.route;

    yield {
      type: "intent",
      task,
      confidence: intent.confidence,
      label: getIntentLabel(task),
      emoji: getIntentEmoji(task),
      content: `${getIntentEmoji(task)} Detected: **${getIntentLabel(task)}** (${(intent.confidence * 100).toFixed(0)}% confidence)`,
      reasoning: intent.reasoning,
    };

    // Replace history with cleaned version for downstream handlers
    history = cleanHistory;

    // Step 2: Route to the right handler based on task type
    switch (task) {
      case "image":
        yield* this._handleImageGeneration(userMessage, history, context);
        break;

      case "vision":
        yield* this._handleVisionAnalysis(userMessage, history, context);
        break;

      case "code":
        yield* this._handleCodeTask(userMessage, history, context);
        break;

      case "reasoning":
        yield* this._handleReasoningTask(userMessage, history, context);
        break;

      case "fast":
        yield* this._handleFastResponse(userMessage, history, context);
        break;

      case "translate":
        yield* this._handleTranslation(userMessage, history, context);
        break;

      case "safety":
        yield* this._handleSafetyCheck(userMessage, context);
        break;

      case "embedding":
        yield* this._handleEmbedding(userMessage, context);
        break;

      default:
        yield* this._handleGeneralChat(userMessage, history, context, task);
        break;
    }
  }

  // ── General Chat (default) — with token streaming ──
  async *_handleGeneralChat(message, history, context, task = "chat") {
    const systemPrompt = this._buildSystemPrompt(context);
    const messages = [
      { role: "system", content: systemPrompt },
      ...(history || []).slice(-15),
      { role: "user", content: this._buildUserMessage(message, context) },
    ];

    yield { type: "thinking", content: `💭 Thinking with auto-selected model...` };

    try {
      let fullContent = "";
      for await (const update of this.nim.chatStream(messages, {
        task,
        max_tokens: CONFIG.maxTokens,
        temperature: CONFIG.temperature,
      })) {
        if (update.type === "model_info") {
          yield { type: "model_info", ...update, route: update.route || task };
          yield { type: "thinking", content: "Generating..." };
        } else if (update.type === "token") {
          fullContent += update.content;
          yield { type: "token", content: update.content };
        } else if (update.type === "done") {
          yield {
            type: "result",
            content: fullContent,
            model: update.model,
            modelName: update.modelName,
          };
        }
      }
    } catch (e) {
      yield {
        type: "error",
        content: `❌ All models failed: ${e.message}`,
        error: e.message,
      };
    }
  }

  // ── Code Tasks — with token streaming ──
  async *_handleCodeTask(message, history, context) {
    yield { type: "thinking", content: `💻 Routing to code-optimized model...` };

    try {
      const systemPrompt = `You are a world-class programming assistant. Help the user write clean, efficient, well-documented code.

## Guidelines
- Always suggest the best approach for the task, considering trade-offs in performance, readability, and maintainability.
- Include filename comments at the top of code blocks so the user can save files directly (e.g., "// filename: app.ts").
- Explain your code — what each section does and why you chose that approach.
- For bugs, first analyze the root cause, then provide the fix with an explanation.
- Use modern best practices and idiomatic patterns for the language.
- When suggesting multiple approaches, explain the pros and cons of each.`;
      const messages = [
        { role: "system", content: systemPrompt },
        ...(history || []).slice(-10),
        { role: "user", content: message },
      ];

      let fullContent = "";
      for await (const update of this.nim.chatStream(messages, {
        task: "code",
        max_tokens: 8192,
        temperature: 0.3,
      })) {
        if (update.type === "model_info") {
          yield { type: "model_info", ...update, route: "code" };
          yield { type: "thinking", content: "Generating..." };
        } else if (update.type === "token") {
          fullContent += update.content;
          yield { type: "token", content: update.content };
        } else if (update.type === "done") {
          yield {
            type: "result",
            content: fullContent,
            model: update.model,
            modelName: update.modelName,
          };
        }
      }
    } catch (e) {
      yield { type: "error", content: `❌ Code generation failed: ${e.message}` };
    }
  }

  // ── Deep Reasoning Tasks — with token streaming ──
  async *_handleReasoningTask(message, history, context) {
    yield { type: "thinking", content: `🧠 Routing to deep reasoning model (QWQ 32B)...` };

    try {
      const systemPrompt = `You are a deep reasoning assistant skilled in chain-of-thought analysis.

## Your Process
1. First, restate the problem in your own words to ensure understanding.
2. Break the problem down into smaller, manageable parts.
3. Work through each part methodically, showing your reasoning.
4. Consider multiple perspectives or approaches.
5. Arrive at a well-supported conclusion.

Use the \`\`\`reasoning block to show your step-by-step thought process before giving the final answer.`;
      const messages = [
        { role: "system", content: systemPrompt },
        ...(history || []).slice(-8),
        { role: "user", content: message },
      ];

      let fullContent = "";
      for await (const update of this.nim.chatStream(messages, {
        task: "reasoning",
        max_tokens: 8192,
        temperature: 0.5,
      })) {
        if (update.type === "model_info") {
          yield { type: "model_info", ...update, route: "reasoning" };
          yield { type: "thinking", content: "Generating..." };
        } else if (update.type === "token") {
          fullContent += update.content;
          yield { type: "token", content: update.content };
        } else if (update.type === "done") {
          yield {
            type: "result",
            content: fullContent,
            model: update.model,
            modelName: update.modelName,
          };
        }
      }
    } catch (e) {
      yield { type: "error", content: `❌ Reasoning failed: ${e.message}` };
    }
  }

  // ── Fast / Simple Responses — with token streaming ──
  async *_handleFastResponse(message, history, context) {
    yield { type: "thinking", content: `⚡ Using fast model for quick response...` };

    try {
      const messages = [...(history || []).slice(-5), { role: "user", content: message }];

      let fullContent = "";
      for await (const update of this.nim.chatStream(messages, {
        task: "fast",
        max_tokens: 1024,
        temperature: 0.7,
      })) {
        if (update.type === "model_info") {
          yield { type: "model_info", ...update, route: "fast" };
          yield { type: "thinking", content: "Generating..." };
        } else if (update.type === "token") {
          fullContent += update.content;
          yield { type: "token", content: update.content };
        } else if (update.type === "done") {
          yield {
            type: "result",
            content: fullContent,
            model: update.model,
            modelName: update.modelName,
          };
        }
      }
    } catch (e) {
      yield { type: "error", content: `❌ Quick response failed: ${e.message}` };
    }
  }

  // ── Image Generation ──
  async *_handleImageGeneration(message, history, context) {
    // Extract the prompt from the message
    const prompt = this._extractImagePrompt(message);
    const modelOverride = context.imageModel || null;
    const imgOpts = {};
    if (context.imagineWidth) imgOpts.width = context.imagineWidth;
    if (context.imagineHeight) imgOpts.height = context.imagineHeight;
    if (context.imagineSteps) imgOpts.steps = context.imagineSteps;

    yield {
      type: "thinking",
      content: modelOverride
        ? `🎨 Generating with selected model: ${modelOverride.split("/").pop()}...`
        : `🎨 Generating image: "${prompt.slice(0, 80)}..."`,
    };

    try {
      const result = await this.nim.generateImage(prompt, { ...imgOpts, model: modelOverride });

      const modelInfo = getModelInfo(result.model);
      const modelName = modelInfo?.name || result.model.split("/").pop();

      yield {
        type: "model_info",
        model: result.model,
        modelName,
        route: "image",
        fallbackUsed: result.fallback_used,
        content: result.fallback_used
          ? `🎨 Generated with **${modelName}** (fallback)`
          : `🎨 Generated with **${modelName}**`,
      };

      if (result.image) {
        yield { type: "image", image: result.image, model: result.model, modelName, prompt };
        yield {
          type: "result",
          content: `🎨 **Image Generated!**\n\nCreated with **${modelName}** (${result.width}x${result.height})\n\nPrompt: *${prompt}*`,
          model: result.model,
          image: result.image,
        };
      } else {
        yield {
          type: "result",
          content: `❌ Failed to generate image. The model responded but no image data was returned.`,
        };
      }
    } catch (e) {
      yield { type: "error", content: `❌ Image generation failed: ${e.message}` };
    }
  }

  // ── Vision / Image Analysis ──
  async *_handleVisionAnalysis(message, history, context) {
    const imageData = context.imageData || context.currentImage;
    if (!imageData) {
      yield {
        type: "error",
        content: `👁️ I need an image to analyze! Please attach an image and try again.`,
      };
      return;
    }

    yield { type: "thinking", content: `👁️ Analyzing image with vision model...` };

    try {
      const result = await this.nim.vision(imageData, message);

      const modelInfo = getModelInfo(result.model);
      const modelName = modelInfo?.name || result.model.split("/").pop();

      yield {
        type: "model_info",
        model: result.model,
        modelName,
        route: "vision",
        fallbackUsed: result.fallback_used,
        content: result.fallback_used
          ? `👁️ Analyzed with **${modelName}** (fallback)`
          : `👁️ Analyzed with **${modelName}**`,
      };

      yield {
        type: "result",
        content: `**🔍 Vision Analysis**\n**Model:** ${modelName}\n\n${result.content}`,
        model: result.model,
        modelName,
        usage: result.usage,
      };
    } catch (e) {
      yield { type: "error", content: `❌ Vision analysis failed: ${e.message}` };
    }
  }

  // ── Translation — with token streaming ──
  async *_handleTranslation(message, history, context) {
    yield { type: "thinking", content: `🌐 Translating...` };

    try {
      const systemPrompt = `You are a professional translator with expertise in multiple languages.

## Guidelines
- If the user specifies source and target languages, translate accordingly.
- If only one language is mentioned, translate to that language.
- If no language is specified, detect the language of the source text and translate to English.
- Preserve tone, style, and nuance as much as possible.
- For idioms and cultural references, find equivalent expressions in the target language.
- Respond with ONLY the translation unless the user asks for explanations.`;
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ];

      let fullContent = "";
      for await (const update of this.nim.chatStream(messages, {
        task: "translate",
        max_tokens: 2048,
        temperature: 0.1,
      })) {
        if (update.type === "model_info") {
          yield { type: "model_info", ...update, route: "translate" };
          yield { type: "thinking", content: "Generating..." };
        } else if (update.type === "token") {
          fullContent += update.content;
          yield { type: "token", content: update.content };
        } else if (update.type === "done") {
          yield {
            type: "result",
            content: fullContent,
            model: update.model,
            modelName: update.modelName,
          };
        }
      }
    } catch (e) {
      yield { type: "error", content: `❌ Translation failed: ${e.message}` };
    }
  }

  // ── Safety Check ──
  async *_handleSafetyCheck(message, context) {
    yield { type: "thinking", content: `🛡️ Analyzing content safety...` };

    try {
      const safetyModel = "nvidia/llama-3.1-nemoguard-8b-content-safety";
      const messages = [
        {
          role: "system",
          content:
            "Analyze the following content for safety violations. Respond with SAFE or UNSAFE and explain which categories are triggered.",
        },
        { role: "user", content: message },
      ];

      const result = await this.nim.chat(messages, {
        task: "chat",
        max_tokens: 512,
        temperature: 0.1,
      });

      const modelInfo = getModelInfo(result.model);
      const modelName = modelInfo?.name || result.model.split("/").pop();

      const isSafe = !result.content.toLowerCase().includes("unsafe");

      yield {
        type: "model_info",
        model: result.model,
        modelName,
        route: "safety",
        content: `🛡️ Safety checked with **${modelName}**`,
      };

      yield {
        type: "result",
        content: `**🛡️ Safety Analysis**\n\n**Status:** ${isSafe ? "✅ SAFE" : "⚠️ UNSAFE"}\n**Model:** ${modelName}\n\n${result.content}`,
        model: result.model,
        safe: isSafe,
      };
    } catch (e) {
      yield { type: "error", content: `❌ Safety check failed: ${e.message}` };
    }
  }

  // ── Embedding ──
  async *_handleEmbedding(message, context) {
    yield { type: "thinking", content: `📊 Generating embeddings...` };

    try {
      const result = await this.nim.generateEmbeddings(message);
      const modelInfo = getModelInfo(result.model);
      const modelName = modelInfo?.name || result.model.split("/").pop();

      yield {
        type: "model_info",
        model: result.model,
        modelName,
        route: "embedding",
        content: `📊 Embeddings generated with **${modelName}**`,
      };

      const data = result.data;
      const embedding = data.embedding || data.data?.embedding || null;

      if (embedding) {
        yield {
          type: "result",
          content: `**📊 Embeddings**\n\n**Model:** ${modelName}\n**Dimensions:** ${embedding.length}\n**First 5 values:** [${embedding
            .slice(0, 5)
            .map((n) => (typeof n === "number" ? n.toFixed(4) : n))
            .join(", ")}]`,
          model: result.model,
          dimensions: embedding.length,
        };
      } else {
        yield {
          type: "result",
          content: `**📊 Embeddings Result**\n\n**Model:** ${modelName}\n\n\`\`\`json\n${JSON.stringify(data, null, 2).slice(0, 2000)}\n\`\`\``,
          model: result.model,
        };
      }
    } catch (e) {
      yield { type: "error", content: `❌ Embedding generation failed: ${e.message}` };
    }
  }

  /**
   * Generate contextual follow-up questions based on the last AI response.
   * Uses a fast/cheap model. Returns up to 3 short, natural questions.
   */
  async generateSuggestions(lastResponse) {
    try {
      const messages = [
        {
          role: "system",
          content:
            "Based on the AI response below, generate 3 short follow-up questions the user might want to ask next. " +
            "Make them specific to the content discussed, not generic. " +
            "Return each question on its own line, starting with '- '. " +
            "Keep each question under 10 words. Do not add explanations.",
        },
        {
          role: "assistant",
          content: lastResponse.slice(0, 2000),
        },
      ];

      const result = await this.nim.chat(messages, {
        task: "fast",
        max_tokens: 120,
        temperature: 0.5,
      });

      const text = (result.content || "").trim();
      const questions = text
        .split("\n")
        .map((line) => line.replace(/^[-•*]\s*/, "").replace(/^\d+[\.\)]\s*/, "").trim())
        .filter((q) => q.length > 10 && q.length < 120 && (q.includes("?") || q.includes("？")));

      return questions.slice(0, 3);
    } catch (e) {
      console.warn(`Suggestion generation failed: ${e.message}`);
      return null;
    }
  }

  /**
   * Generate a concise, meaningful conversation title from the first user message.
   * Uses a fast/cheap model to keep costs low.
   */
  async generateTitle(userMessage) {
    try {
      const messages = [
        {
          role: "system",
          content:
            "Generate a very short title (3-6 words) for a conversation based on this user's first message. Respond with ONLY the title, no quotes, no punctuation, no explanation.",
        },
        { role: "user", content: userMessage },
      ];

      const result = await this.nim.chat(messages, {
        task: "fast",
        max_tokens: 30,
        temperature: 0.3,
      });

      let title = (result.content || "").trim();
      // Clean up: remove quotes, truncate, ensure it's reasonable
      title = title.replace(/[""'']/g, "").trim();
      if (title.length > 60) title = title.slice(0, 57) + "...";
      if (title.length < 3) title = null;

      return title;
    } catch (e) {
      console.warn(`Title generation failed: ${e.message}`);
      return null;
    }
  }

  // ── Helpers ──

  _buildSystemPrompt(context) {
    return `You are **Dubu AI** — a world-class AI assistant powered by NVIDIA NIM's model catalog. Your goal is to be genuinely helpful, thoughtful, and precise.

## Core Principles
1. **Be clear and direct** — Give complete, well-structured answers. Break complex topics into digestible sections.
2. **Think step by step** — For math, logic, coding, or analysis, show your reasoning process clearly.
3. **Write great code** — Always include file names in code blocks (e.g., "// filename: app.ts") so the user can save files directly.
4. **Use formatting wisely** — Headers, lists, bold text, and code blocks to make answers scannable and beautiful.
5. **Be conversational** — Warm but professional. Use emojis naturally, not excessively.
6. **Admit uncertainty** — If you're not sure about something, say so rather than making things up.
7. **Offer follow-ups** — After answering, briefly suggest what the user might ask next.

## Capabilities
- General conversation & Q&A
- Code generation, debugging, and explanation
- Deep reasoning, math, and logic
- Image generation (use /imagine command)
- Vision analysis (when images are attached)
- Translation between languages
- Document analysis & file operations

## Current Context
- Today: ${new Date().toLocaleDateString()}
- Time: ${new Date().toLocaleTimeString()}
${context.hasImage ? "- User has attached an image for analysis" : ""}
${context.hasDocuments ? "- User has attached documents for analysis" : ""}
${context.webSearch ? "- Web search is enabled — you can incorporate real-time information" : ""}
${context.deepThink ? "- Deep reasoning mode is enabled — take extra time to think through complex problems" : ""}`;
  }

  _buildUserMessage(userMessage, context) {
    let msg = userMessage;
    if (context.imageDescription) {
      msg += `\n\n[Image attached: ${context.imageDescription}]`;
    }
    return msg;
  }

  _extractImagePrompt(message) {
    // Try to extract image prompt from common patterns
    const patterns = [
      /(?:generate|create|make|draw|paint|render)\s+(?:an?|the|a)?\s*(?:image|picture|art|illustration)?\s*(?:of|with|showing|depicting)?\s*(.+)/i,
      /^\s*(?:an?|the|a)\s*(?:image|picture)\s*(?:of|with)\s*(.+)/i,
      /"([^"]+)"|'([^']+)'/,
    ];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match) {
        // Return the first capture group (accounting for optional groups)
        return match[1] || match[2] || message;
      }
    }

    // Remove common prefixes and return the rest
    return message
      .replace(/^(generate|create|make|draw|paint|render)\s+(me\s+)?(a|an|the)\s+/i, "")
      .replace(/^(i want|i'd like|can you|please|could you)\s+/i, "")
      .trim();
  }
}

module.exports = Orchestrator;
