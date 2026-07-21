// ===== Unified AI Agent Orchestrator =====
// Smart agent that auto-detects what the user wants, routes to the best model,
// and falls back gracefully if models fail. One agent to rule them all.

const CONFIG = require("./config");
const NIMClient = require("./nim");
const { detectIntent, getIntentEmoji, getIntentLabel } = require("./router");
const { getModelInfo, getTaskRoute, getModelBenchmark } = require("./models");
const { webSearch, fetchPageContent } = require("./websearch");

class Orchestrator {
  constructor(options = {}) {
    this.apiKey = options.apiKey || CONFIG.apiKey;
    this.nim = new NIMClient(this.apiKey);
    this.verbose = options.verbose !== false;
  }

  /**
   * Process a user request through the unified agent loop.
   * @param {string} userMessage - The user's message
   * @param {Array} history - Previous conversation messages
   * @param {object} context - Additional context (images, docs, modes)
   * @param {string} [modelOverride] - Optional explicit model to use (skips auto-selection)
   */
  async *process(userMessage, history = [], context = {}, modelOverride = null) {
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
      content: modelOverride
        ? `Using selected model: **${modelOverride.split("/").pop()}**`
        : `Detected: **${getIntentLabel(task)}** (${(intent.confidence * 100).toFixed(0)}% confidence)`,
      reasoning: intent.reasoning,
    };

    // Replace history with cleaned version for downstream handlers
    history = cleanHistory;

    // Attach model override to context so all handlers can access it
    context._modelOverride = modelOverride;

    // Debug: log context flags
    console.log(`  📡 Context flags: webSearch=${context.webSearch}, deepThink=${context.deepThink}, task=${task}`);

    // ── Auto-search: when the router detects search intent from keywords
    // (e.g., "search for", "find", "what is the latest"), auto-enable web
    // search so the handler fetches results BEFORE the model responds.
    if (task === "websearch") {
      context.webSearch = true;
    }

    // ── Image generation override: when forceImageGeneration is set
    // (from /imagine command in the frontend), route directly to image gen
    // regardless of what the message text alone would suggest.
    if (context.forceImageGeneration) {
      effectiveTask = "image";
      yield {
        type: "intent",
        task: "image",
        confidence: 1,
        label: "Image Generation",
        content: "Image generation requested — generating image from prompt",
        reasoning: `forceImageGeneration active, overriding "${task}" route to image chain`,
      };
    }

    // ── Web Search override: when web search is enabled, force the websearch
    // model chain (smart models that can synthesize search results).
    let effectiveTask = task;
    if (context.webSearch) {
      effectiveTask = "websearch";
      yield {
        type: "intent",
        task: "websearch",
        confidence: 1,
        label: "Web Search",
        content: "Web search enabled — searching the web for current information",
        reasoning: `Web search active, overriding "${task}" route to websearch chain`,
      };
    }

    // ── Deep Reasoning override: when deep think is enabled, force the reasoning
    // model chain (QWQ 32B → Nemotron Ultra → etc.) for chain-of-thought analysis.
    if (context.deepThink && effectiveTask === task) {
      effectiveTask = "reasoning";
      yield {
        type: "intent",
        task: "reasoning",
        confidence: 1,
        label: "Deep Reasoning",
        content: "Deep reasoning enabled — using large reasoning model",
        reasoning: `Deep think active, overriding "${task}" route to reasoning chain`,
      };
    }

    // Step 2: Route to the right handler based on task type
    switch (effectiveTask) {
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
        yield* this._handleGeneralChat(userMessage, history, context, effectiveTask);
        break;
    }
  }

  // Helper to build chatStream options with model override
  _streamOpts(task, overrides = {}) {
    const opts = {
      task,
      max_tokens: overrides.max_tokens ?? CONFIG.maxTokens,
      temperature: overrides.temperature ?? CONFIG.temperature,
    };
    if (overrides._modelOverride || overrides.model) {
      opts.model = overrides._modelOverride || overrides.model;
    }
    return opts;
  }

  // Helper to enrich model_info with benchmark rank data
  _enrichModelInfo(update) {
    const bench = getModelBenchmark(update.model);
    if (bench) {
      update.benchmark = { rank: bench.rank, score: bench.combinedScore, speed: bench.speed };
      // Enhance the content string with rank info
      const rankStr = `#${bench.rank}`;
      const scoreStr = `${bench.combinedScore}`;
      update.content = `**${update.modelName}** ${rankStr} (score: ${scoreStr})${
        update.fallbackUsed ? ` (fallback)` : ""}`;
    }
    return update;
  }

  // ── General Chat (default) — with token streaming ──
  async *_handleGeneralChat(message, history, context, task = "chat") {
    yield { type: "thinking", content: context._modelOverride ? `Using ${context._modelOverride.split("/").pop()}...` : `Thinking with auto-selected model...` };

    // ── Web Search: fetch real results if enabled ──
    let searchContext = "";
    if (context.webSearch) {
      console.log(`  🔍 Web search triggered for: "${message.slice(0, 60)}"`);
      yield { type: "thinking", content: `Searching the web for "${message.slice(0, 60)}"...` };
      try {
        const searchResult = await webSearch(message, { count: 6 });
        console.log(`  🔍 Search returned ${searchResult.results.length} results`);
        if (searchResult.results.length > 0) {
          searchContext = `\n\n## Web Search Results\n以下是关于「${searchResult.query}」的搜索结果：\n${searchResult.raw}\n\n请优先基于以上搜索结果回答用户的问题。如果搜索结果包含相关信息，请引用来源。`;
          yield { type: "thinking", content: `Found ${searchResult.results.length} results. Generating answer...` };
        } else {
          yield { type: "thinking", content: `No web results found. Answering from knowledge...` };
        }
      } catch (e) {
        console.warn(`  ⚠️ Web search failed: ${e.message}`);
        console.warn(`  ⚠️ Stack: ${e.stack}`);
        yield { type: "thinking", content: `Search unavailable. Answering from knowledge...` };
      }
    }

    const systemPrompt = this._buildSystemPrompt(context) + searchContext;
    const messages = [
      { role: "system", content: systemPrompt },
      ...(history || []).slice(-15),
      { role: "user", content: this._buildUserMessage(message, context) },
    ];

    try {
      let fullContent = "";
      for await (const update of this.nim.chatStream(messages, this._streamOpts(task, context))) {
        if (update.type === "model_info") {
          yield { type: "model_info", ...this._enrichModelInfo(update), route: update.route || task };
          yield { type: "thinking", content: "Generating..." };
        } else if (update.type === "token") {
          fullContent += update.content;
          yield { type: "token", content: update.content };
        } else if (update.type === "done") {
          // Check if model requested a webpage fetch or search
          let processed = fullContent;
          processed = this._stripSearchTags(processed);
          const fetchResult = await this._processFetchRequests(fullContent);
          if (fetchResult) {
            processed += `\n\n---\n**Fetched: ${fetchResult.url}**\n\n${fetchResult.content}`;
          }
          const searchResult = await this._processSearchRequests(fullContent);
          if (searchResult) {
            processed += searchResult;
          }
          yield {
            type: "result",
            content: processed,
            model: update.model,
            modelName: update.modelName,
          };
        }
      }
    } catch (e) {
      yield {
        type: "error",
        content: `All models failed: ${e.message}`,
        error: e.message,
      };
    }
  }

  // ── Code Tasks — with token streaming ──
  async *_handleCodeTask(message, history, context) {
    yield { type: "thinking", content: context._modelOverride ? `Using ${context._modelOverride.split("/").pop()} for code...` : `Routing to code-optimized model...` };

    try {
      const systemPrompt = `You are a world-class programming assistant. Help the user write clean, efficient, well-documented code.

## Critical Rules
- **ALWAYS generate COMPLETE, RUNNABLE programs.** Never output a snippet, skeleton, or abbreviated code. The user expects a full, working file they can save and run immediately.
- **Never truncate code** with comments like "// rest of code", "/* more code here */", "...", or "# continue with other methods". Every single line must be present.
- **Write multi-line code.** A single line or a few lines is never enough for a real program. Include all imports, all functions, all classes, and the full implementation.
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
      for await (const update of this.nim.chatStream(messages, this._streamOpts("code", { ...context, max_tokens: 8192, temperature: 0.3 }))) {
        if (update.type === "model_info") {
          yield { type: "model_info", ...this._enrichModelInfo(update), route: "code" };
          yield { type: "thinking", content: "Generating..." };
        } else if (update.type === "token") {
          fullContent += update.content;
          yield { type: "token", content: update.content };
        } else if (update.type === "done") {
          let processed = fullContent;
          processed = this._stripSearchTags(processed);
          const fetchResult = await this._processFetchRequests(fullContent);
          if (fetchResult) {
            processed += `\n\n---\n**Fetched: ${fetchResult.url}**\n\n${fetchResult.content}`;
          }
          const searchResult = await this._processSearchRequests(fullContent);
          if (searchResult) {
            processed += searchResult;
          }
          yield {
            type: "result",
            content: processed,
            model: update.model,
            modelName: update.modelName,
          };
        }
      }
    } catch (e) {
      yield { type: "error", content: `Code generation failed: ${e.message}` };
    }
  }

  // ── Deep Reasoning Tasks — with token streaming ──
  async *_handleReasoningTask(message, history, context) {
    yield { type: "thinking", content: context._modelOverride ? `Using ${context._modelOverride.split("/").pop()} for reasoning...` : `Routing to deep reasoning model...` };

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
      for await (const update of this.nim.chatStream(messages, this._streamOpts("reasoning", { ...context, max_tokens: 8192, temperature: 0.5 }))) {
        if (update.type === "model_info") {
          yield { type: "model_info", ...this._enrichModelInfo(update), route: "reasoning" };
          yield { type: "thinking", content: "Generating..." };
        } else if (update.type === "token") {
          fullContent += update.content;
          yield { type: "token", content: update.content };
        } else if (update.type === "done") {
          let processed = fullContent;
          processed = this._stripSearchTags(processed);
          const fetchResult = await this._processFetchRequests(fullContent);
          if (fetchResult) {
            processed += `\n\n---\n**Fetched: ${fetchResult.url}**\n\n${fetchResult.content}`;
          }
          const searchResult = await this._processSearchRequests(fullContent);
          if (searchResult) {
            processed += searchResult;
          }
          yield {
            type: "result",
            content: processed,
            model: update.model,
            modelName: update.modelName,
          };
        }
      }
    } catch (e) {
      yield { type: "error", content: `Reasoning failed: ${e.message}` };
    }
  }

  // ── Fast / Simple Responses — with token streaming ──
  async *_handleFastResponse(message, history, context) {
    yield { type: "thinking", content: context._modelOverride ? `Using ${context._modelOverride.split("/").pop()}...` : `Using fast model for quick response...` };

    try {
      const messages = [...(history || []).slice(-5), { role: "user", content: message }];

      let fullContent = "";
      for await (const update of this.nim.chatStream(messages, this._streamOpts("fast", { ...context, max_tokens: 1024, temperature: 0.7 }))) {
        if (update.type === "model_info") {
          yield { type: "model_info", ...this._enrichModelInfo(update), route: "fast" };
          yield { type: "thinking", content: "Generating..." };
        } else if (update.type === "token") {
          fullContent += update.content;
          yield { type: "token", content: update.content };
        } else if (update.type === "done") {
          let processed = fullContent;
          processed = this._stripSearchTags(processed);
          const fetchResult = await this._processFetchRequests(fullContent);
          if (fetchResult) {
            processed += `\n\n---\n**Fetched: ${fetchResult.url}**\n\n${fetchResult.content}`;
          }
          const searchResult = await this._processSearchRequests(fullContent);
          if (searchResult) {
            processed += searchResult;
          }
          yield {
            type: "result",
            content: processed,
            model: update.model,
            modelName: update.modelName,
          };
        }
      }
    } catch (e) {
      yield { type: "error", content: `Quick response failed: ${e.message}` };
    }
  }

  // ── Image Generation ──
  async *_handleImageGeneration(message, history, context) {
    // Extract the prompt from the message
    const prompt = this._extractImagePrompt(message);
    const modelOverride = context.imageModel || null;
    const imgOpts = {};
    if (context.imagineWidth) {imgOpts.width = context.imagineWidth;}
    if (context.imagineHeight) {imgOpts.height = context.imagineHeight;}
    if (context.imagineSteps) {imgOpts.steps = context.imagineSteps;}

    yield {
      type: "thinking",
      content: modelOverride
        ? `Generating with selected model: ${modelOverride.split("/").pop()}...`
        : `Generating image: "${prompt.slice(0, 80)}..."`,
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
          ? `Generated with **${modelName}** (fallback)`
          : `Generated with **${modelName}**`,
      };

      if (result.image) {
        yield { type: "image", image: result.image, model: result.model, modelName, prompt };
        yield {
          type: "result",
          content: `**Image Generated!**\n\nCreated with **${modelName}** (${result.width}x${result.height})\n\nPrompt: *${prompt}*`,
          model: result.model,
          image: result.image,
        };
      } else {
        yield {
          type: "result",
          content: `Failed to generate image. The model responded but no image data was returned.`,
        };
      }
    } catch (e) {
      yield { type: "error", content: `Image generation failed: ${e.message}` };
    }
  }

  // ── Vision / Image Analysis ──
  async *_handleVisionAnalysis(message, history, context) {
    const imageData = context.imageData || context.currentImage;
    if (!imageData) {
      yield {
        type: "error",
        content: `I need an image to analyze. Please attach an image and try again.`,
      };
      return;
    }

    yield { type: "thinking", content: `Analyzing image with vision model...` };

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
          ? `Analyzed with **${modelName}** (fallback)`
          : `Analyzed with **${modelName}**`,
      };

      yield {
        type: "result",
        content: `**Vision Analysis**\n**Model:** ${modelName}\n\n${result.content}`,
        model: result.model,
        modelName,
        usage: result.usage,
      };
    } catch (e) {
      yield { type: "error", content: `Vision analysis failed: ${e.message}` };
    }
  }

  // ── Translation — with token streaming ──
  async *_handleTranslation(message, history, context) {
    yield { type: "thinking", content: `Translating...` };

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
      for await (const update of this.nim.chatStream(messages, this._streamOpts("translate", { ...context, max_tokens: 2048, temperature: 0.1 }))) {
        if (update.type === "model_info") {
          yield { type: "model_info", ...update, route: "translate" };
          yield { type: "thinking", content: "Generating..." };
        } else if (update.type === "token") {
          fullContent += update.content;
          yield { type: "token", content: update.content };
        } else if (update.type === "done") {
          let processed = fullContent;
          processed = this._stripSearchTags(processed);
          const fetchResult = await this._processFetchRequests(fullContent);
          if (fetchResult) {
            processed += `\n\n---\n**Fetched: ${fetchResult.url}**\n\n${fetchResult.content}`;
          }
          const searchResult = await this._processSearchRequests(fullContent);
          if (searchResult) {
            processed += searchResult;
          }
          yield {
            type: "result",
            content: processed,
            model: update.model,
            modelName: update.modelName,
          };
        }
      }
    } catch (e) {
      yield { type: "error", content: `Translation failed: ${e.message}` };
    }
  }

  // ── Safety Check ──
  async *_handleSafetyCheck(message, context) {
    yield { type: "thinking", content: `Analyzing content safety...` };

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
      yield { type: "error", content: `Safety check failed: ${e.message}` };
    }
  }

  // ── Embedding ──
  async *_handleEmbedding(message, context) {
    yield { type: "thinking", content: `Generating embeddings...` };

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
      yield { type: "error", content: `Embedding generation failed: ${e.message}` };
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
      if (title.length > 60) {title = `${title.slice(0, 57)  }...`;}
      if (title.length < 3) {title = null;}

      return title;
    } catch (e) {
      console.warn(`Title generation failed: ${e.message}`);
      return null;
    }
  }

  // ── Fetch webpage post-processing ──
  // After the model streams a response, check for !fetch[URL] patterns
  // and fetch the page content automatically.
  async _processFetchRequests(fullContent) {
    // Match !fetch[URL] specifically to avoid false matches with
    // markdown image syntax (![alt](url)).
    const fetchPattern = /!fetch\[([^\]]+)\]/g;
    const urls = [];
    let match;
    while ((match = fetchPattern.exec(fullContent)) !== null) {
      const url = match[1].trim();
      if (url.startsWith("http://") || url.startsWith("https://")) {
        urls.push(url);
      }
    }

    if (urls.length === 0) return null;

    // Deduplicate and fetch the first URL only
    const unique = [...new Set(urls)];
    try {
      console.log(`  🌐 Fetching webpage: ${unique[0]}`);
      const content = await fetchPageContent(unique[0], 4000);
      return {
        url: unique[0],
        content,
      };
    } catch (e) {
      console.warn(`  ⚠️ Fetch webpage failed: ${unique[0]} — ${e.message}`);
      return null;
    }
  }

  // ── Search post-processing ──
  // After the model streams a response, check for <SEARCH>...</SEARCH> patterns
  // and automatically execute the search, returning search results to append.
  // Returns: search results block string, or null if no search requested.
  async _processSearchRequests(originalContent) {
    const searchPattern = /<SEARCH>([\s\S]*?)<\/SEARCH>/gi;
    // Collect all queries first (search in ORIGINAL content before tags are stripped)
    const queries = [];
    let match;
    while ((match = searchPattern.exec(originalContent)) !== null) {
      const query = match[1].trim();
      if (query) queries.push(query);
    }

    if (queries.length === 0) return null;

    // Execute first query only (at most one search per response)
    const query = queries[0];
    console.log(`  🔍 Search requested by model: "${query.slice(0, 80)}"`);
    try {
      const searchResult = await webSearch(query, { count: 5 });
      console.log(`  🔍 Search returned ${searchResult.results.length} results`);
      if (searchResult.results.length > 0) {
        return `\n\n---\n**Search Results for: "${query}"**\n\n${searchResult.raw}`;
      }
      return `\n\n*No search results found for "${query}".*`;
    } catch (e) {
      console.warn(`  ⚠️ Search failed for "${query.slice(0, 60)}": ${e.message}`);
      return `\n\n*Search failed for "${query}".*`;
    }
  }

  // Strip <SEARCH>...</SEARCH> tags from the model output so they don't
  // appear verbatim in the user-facing response.
  _stripSearchTags(content) {
    return content.replace(/<SEARCH>[\s\S]*?<\/SEARCH>/gi, "").trim();
  }

  // ── Helpers ──

  _buildSystemPrompt(context) {
    return `You are **Dubu AI** — a world-class AI assistant powered by NVIDIA NIM's full model catalog with automatic model selection and fallback. You have access to over 120 models, real-time web search, deep reasoning, code generation, image generation, vision analysis, and translation.

## Identity & Personality
- You are knowledgeable, precise, and genuinely helpful.
- You speak naturally and conversationally — never robotic or generic.
- You give honest, direct answers. If you don't know, say so clearly.
- You adapt your tone to the user — casual for quick questions, thorough for complex ones.
- You never use emojis excessively. Keep responses clean and professional.

## Core Rules
1. **Be complete** — Give full, well-structured answers. Break complex topics into clear sections with headers.
2. **Show your work** — For math, logic, coding, or analysis, show your reasoning step by step before the final answer.
3. **Code must be runnable** — Always generate complete, working programs with all imports, functions, and full implementation. Never truncate with "// rest of code" or "...". Include filenames in code blocks so users can save files directly.
4. **Use formatting well** — Headers, lists, bold text, tables, and code blocks. Make answers scannable and beautiful.
5. **Cite sources** — When web search results are provided, reference them. When stating facts, be accurate.
6. **Admit uncertainty** — "I'm not sure" is better than a wrong answer.
7. **Think before answering** — Consider edge cases, alternative interpretations, and what the user actually needs.

## Capabilities
- General conversation, Q&A, and analysis
- Code generation, debugging, review, and explanation (all languages)
- Deep reasoning and chain-of-thought for math, logic, and complex problems
- Real-time web search for current events, news, and live data
- Image generation from text descriptions
- Vision analysis when images are attached
- Professional translation between languages
- Document analysis and file operations

## Built-in Tools (Available to ALL models)

**Web Search:** To search the web for real-time information, output:
\`\`\`
<SEARCH>your search query here</SEARCH>
\`\`\`
The system will automatically search the web and append results to your response.
Use this when the user asks about current events, news, facts, prices, or any
information that may have changed since your training data. Only one search
per response is executed.

**Webpage Fetching:** To fetch the content of a specific webpage, output:
\`\`\`
!fetch[https://example.com]
\`\`\`
The system will fetch the page and continue your response.
Use this when the user asks you to read a specific URL or documentation.

## Current Context
- Today: ${new Date().toLocaleDateString()}
- Time: ${new Date().toLocaleTimeString()}
${context.hasImage ? "- User has attached an image for analysis" : ""}
${context.hasDocuments ? "- User has attached documents for analysis" : ""}
${context.webSearch ? "- Web search is enabled — incorporate real-time information from search results" : ""}
${context.deepThink ? "- Deep reasoning mode is enabled — think step by step, show your full reasoning process" : ""}`;
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
