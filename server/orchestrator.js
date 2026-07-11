// ===== Unified AI Agent Orchestrator =====
// Smart agent that auto-detects what the user wants, routes to the best model,
// and falls back gracefully if models fail. One agent to rule them all.

const CONFIG = require('./config');
const NIMClient = require('./nim');
const { detectIntent, getIntentEmoji, getIntentLabel } = require('./router');
const { getModelInfo, getTaskRoute } = require('./models');


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
    const cleanHistory = (history || []).filter(m =>
      m && typeof m === 'object' &&
      typeof m.role === 'string' && m.role.length > 0 &&
      typeof m.content === 'string'
    );

    // Step 1: Detect the intent / task type
    const intent = detectIntent(userMessage, context);
    const task = intent.task;
    const route = intent.route;

    yield {
      type: 'intent',
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
      case 'image':
        yield* this._handleImageGeneration(userMessage, history, context);
        break;

      case 'vision':
        yield* this._handleVisionAnalysis(userMessage, history, context);
        break;

      case 'code':
        yield* this._handleCodeTask(userMessage, history, context);
        break;

      case 'reasoning':
        yield* this._handleReasoningTask(userMessage, history, context);
        break;

      case 'fast':
        yield* this._handleFastResponse(userMessage, history, context);
        break;

      case 'translate':
        yield* this._handleTranslation(userMessage, history, context);
        break;

      case 'safety':
        yield* this._handleSafetyCheck(userMessage, context);
        break;

      case 'embedding':
        yield* this._handleEmbedding(userMessage, context);
        break;

      default:
        yield* this._handleGeneralChat(userMessage, history, context, task);
        break;
    }
  }

  // ── General Chat (default) — with token streaming ──
  async *_handleGeneralChat(message, history, context, task = 'chat') {
    const systemPrompt = this._buildSystemPrompt(context);
    const messages = [
      { role: 'system', content: systemPrompt },
      ...(history || []).slice(-15),
      { role: 'user', content: this._buildUserMessage(message, context) },
    ];

    yield { type: 'thinking', content: `💭 Thinking with auto-selected model...` };

    try {
      let fullContent = '';
      for await (const update of this.nim.chatStream(messages, {
        task,
        max_tokens: CONFIG.maxTokens,
        temperature: CONFIG.temperature,
      })) {
        if (update.type === 'model_info') {
          yield { type: 'model_info', ...update, route: update.route || task };
          yield { type: 'thinking', content: 'Generating...' };
        } else if (update.type === 'token') {
          fullContent += update.content;
          yield { type: 'token', content: update.content };
        } else if (update.type === 'done') {
          yield {
            type: 'result',
            content: fullContent,
            model: update.model,
            modelName: update.modelName,
          };
        }
      }
    } catch (e) {
      yield {
        type: 'error',
        content: `❌ All models failed: ${e.message}`,
        error: e.message,
      };
    }
  }

  // ── Code Tasks — with token streaming ──
  async *_handleCodeTask(message, history, context) {
    yield { type: 'thinking', content: `💻 Routing to code-optimized model...` };

    try {
      const systemPrompt = `You are an expert programming assistant. Help the user write, debug, analyze, or explain code.
Respond with clean, well-commented code when relevant. Use proper formatting.

When creating files for the user, always put a filename comment at the top of each code block so the system knows what to name the file.
For example: "// filename: app.js" or "# filename: main.py" or "<!-- filename: index.html -->".
The user can then click "Create File" to save the code directly to disk.`;
      const messages = [
        { role: 'system', content: systemPrompt },
        ...(history || []).slice(-10),
        { role: 'user', content: message },
      ];

      let fullContent = '';
      for await (const update of this.nim.chatStream(messages, {
        task: 'code',
        max_tokens: 8192,
        temperature: 0.3,
      })) {
        if (update.type === 'model_info') {
          yield { type: 'model_info', ...update, route: 'code' };
          yield { type: 'thinking', content: 'Generating...' };
        } else if (update.type === 'token') {
          fullContent += update.content;
          yield { type: 'token', content: update.content };
        } else if (update.type === 'done') {
          yield { type: 'result', content: fullContent, model: update.model, modelName: update.modelName };
        }
      }
    } catch (e) {
      yield { type: 'error', content: `❌ Code generation failed: ${e.message}` };
    }
  }

  // ── Deep Reasoning Tasks — with token streaming ──
  async *_handleReasoningTask(message, history, context) {
    yield { type: 'thinking', content: `🧠 Routing to deep reasoning model (QWQ 32B)...` };

    try {
      const systemPrompt = `You are a deep reasoning assistant. Think step by step through complex problems.
Break down the problem, consider multiple angles, and provide thorough analysis.
Use chain-of-thought reasoning before giving your final answer.`;
      const messages = [
        { role: 'system', content: systemPrompt },
        ...(history || []).slice(-8),
        { role: 'user', content: message },
      ];

      let fullContent = '';
      for await (const update of this.nim.chatStream(messages, {
        task: 'reasoning',
        max_tokens: 8192,
        temperature: 0.5,
      })) {
        if (update.type === 'model_info') {
          yield { type: 'model_info', ...update, route: 'reasoning' };
          yield { type: 'thinking', content: 'Generating...' };
        } else if (update.type === 'token') {
          fullContent += update.content;
          yield { type: 'token', content: update.content };
        } else if (update.type === 'done') {
          yield { type: 'result', content: fullContent, model: update.model, modelName: update.modelName };
        }
      }
    } catch (e) {
      yield { type: 'error', content: `❌ Reasoning failed: ${e.message}` };
    }
  }

  // ── Fast / Simple Responses — with token streaming ──
  async *_handleFastResponse(message, history, context) {
    yield { type: 'thinking', content: `⚡ Using fast model for quick response...` };

    try {
      const messages = [
        ...(history || []).slice(-5),
        { role: 'user', content: message },
      ];

      let fullContent = '';
      for await (const update of this.nim.chatStream(messages, {
        task: 'fast',
        max_tokens: 1024,
        temperature: 0.7,
      })) {
        if (update.type === 'model_info') {
          yield { type: 'model_info', ...update, route: 'fast' };
          yield { type: 'thinking', content: 'Generating...' };
        } else if (update.type === 'token') {
          fullContent += update.content;
          yield { type: 'token', content: update.content };
        } else if (update.type === 'done') {
          yield { type: 'result', content: fullContent, model: update.model, modelName: update.modelName };
        }
      }
    } catch (e) {
      yield { type: 'error', content: `❌ Quick response failed: ${e.message}` };
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

    yield { type: 'thinking', content: modelOverride
      ? `🎨 Generating with selected model: ${modelOverride.split('/').pop()}...`
      : `🎨 Generating image: "${prompt.slice(0, 80)}..."`
    };

    try {
      const result = await this.nim.generateImage(prompt, { ...imgOpts, model: modelOverride });

      const modelInfo = getModelInfo(result.model);
      const modelName = modelInfo?.name || result.model.split('/').pop();

      yield {
        type: 'model_info',
        model: result.model,
        modelName,
        route: 'image',
        fallbackUsed: result.fallback_used,
        content: result.fallback_used
          ? `🎨 Generated with **${modelName}** (fallback)`
          : `🎨 Generated with **${modelName}**`,
      };

      if (result.image) {
        yield { type: 'image', image: result.image, model: result.model, modelName, prompt };
        yield {
          type: 'result',
          content: `🎨 **Image Generated!**\n\nCreated with **${modelName}** (${result.width}x${result.height})\n\nPrompt: *${prompt}*`,
          model: result.model,
          image: result.image,
        };
      } else {
        yield {
          type: 'result',
          content: `❌ Failed to generate image. The model responded but no image data was returned.`,
        };
      }
    } catch (e) {
      yield { type: 'error', content: `❌ Image generation failed: ${e.message}` };
    }
  }

  // ── Vision / Image Analysis ──
  async *_handleVisionAnalysis(message, history, context) {
    const imageData = context.imageData || context.currentImage;
    if (!imageData) {
      yield {
        type: 'error',
        content: `👁️ I need an image to analyze! Please attach an image and try again.`,
      };
      return;
    }

    yield { type: 'thinking', content: `👁️ Analyzing image with vision model...` };

    try {
      const result = await this.nim.vision(imageData, message);

      const modelInfo = getModelInfo(result.model);
      const modelName = modelInfo?.name || result.model.split('/').pop();

      yield {
        type: 'model_info',
        model: result.model,
        modelName,
        route: 'vision',
        fallbackUsed: result.fallback_used,
        content: result.fallback_used
          ? `👁️ Analyzed with **${modelName}** (fallback)`
          : `👁️ Analyzed with **${modelName}**`,
      };

      yield {
        type: 'result',
        content: `**🔍 Vision Analysis**\n**Model:** ${modelName}\n\n${result.content}`,
        model: result.model,
        modelName,
        usage: result.usage,
      };
    } catch (e) {
      yield { type: 'error', content: `❌ Vision analysis failed: ${e.message}` };
    }
  }

  // ── Translation — with token streaming ──
  async *_handleTranslation(message, history, context) {
    yield { type: 'thinking', content: `🌐 Translating...` };

    try {
      const systemPrompt = `You are a professional translator. Translate the user's message to their requested language.
Respond with ONLY the translation, no explanations or notes.`;
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ];

      let fullContent = '';
      for await (const update of this.nim.chatStream(messages, {
        task: 'translate',
        max_tokens: 2048,
        temperature: 0.1,
      })) {
        if (update.type === 'model_info') {
          yield { type: 'model_info', ...update, route: 'translate' };
          yield { type: 'thinking', content: 'Generating...' };
        } else if (update.type === 'token') {
          fullContent += update.content;
          yield { type: 'token', content: update.content };
        } else if (update.type === 'done') {
          yield { type: 'result', content: fullContent, model: update.model, modelName: update.modelName };
        }
      }
    } catch (e) {
      yield { type: 'error', content: `❌ Translation failed: ${e.message}` };
    }
  }

  // ── Safety Check ──
  async *_handleSafetyCheck(message, context) {
    yield { type: 'thinking', content: `🛡️ Analyzing content safety...` };

    try {
      const safetyModel = 'nvidia/llama-3.1-nemoguard-8b-content-safety';
      const messages = [
        { role: 'system', content: 'Analyze the following content for safety violations. Respond with SAFE or UNSAFE and explain which categories are triggered.' },
        { role: 'user', content: message },
      ];

      const result = await this.nim.chat(messages, { task: 'chat', max_tokens: 512, temperature: 0.1 });

      const modelInfo = getModelInfo(result.model);
      const modelName = modelInfo?.name || result.model.split('/').pop();

      const isSafe = !result.content.toLowerCase().includes('unsafe');

      yield {
        type: 'model_info',
        model: result.model,
        modelName,
        route: 'safety',
        content: `🛡️ Safety checked with **${modelName}**`,
      };

      yield {
        type: 'result',
        content: `**🛡️ Safety Analysis**\n\n**Status:** ${isSafe ? '✅ SAFE' : '⚠️ UNSAFE'}\n**Model:** ${modelName}\n\n${result.content}`,
        model: result.model,
        safe: isSafe,
      };
    } catch (e) {
      yield { type: 'error', content: `❌ Safety check failed: ${e.message}` };
    }
  }

  // ── Embedding ──
  async *_handleEmbedding(message, context) {
    yield { type: 'thinking', content: `📊 Generating embeddings...` };

    try {
      const result = await this.nim.generateEmbeddings(message);
      const modelInfo = getModelInfo(result.model);
      const modelName = modelInfo?.name || result.model.split('/').pop();

      yield {
        type: 'model_info',
        model: result.model,
        modelName,
        route: 'embedding',
        content: `📊 Embeddings generated with **${modelName}**`,
      };

      const data = result.data;
      const embedding = data.embedding || data.data?.embedding || null;

      if (embedding) {
        yield {
          type: 'result',
          content: `**📊 Embeddings**\n\n**Model:** ${modelName}\n**Dimensions:** ${embedding.length}\n**First 5 values:** [${embedding.slice(0, 5).map(n => typeof n === 'number' ? n.toFixed(4) : n).join(', ')}]`,
          model: result.model,
          dimensions: embedding.length,
        };
      } else {
        yield {
          type: 'result',
          content: `**📊 Embeddings Result**\n\n**Model:** ${modelName}\n\n\`\`\`json\n${JSON.stringify(data, null, 2).slice(0, 2000)}\n\`\`\``,
          model: result.model,
        };
      }
    } catch (e) {
      yield { type: 'error', content: `❌ Embedding generation failed: ${e.message}` };
    }
  }

  // ── Helpers ──

  _buildSystemPrompt(context) {
    return `You are **Dubu AI** — a unified AI agent powered by NVIDIA NIM.
You have automatic model selection that routes your requests to the best model for each task.
You can handle: conversation, coding, image generation, vision analysis, translation, and more.

## Guidelines
1. Be helpful, conversational, and engaging. Use emojis.
2. Format code blocks with triple backticks.
3. Think step by step for complex problems.
4. If the user asks about features you don't have, be honest.

## Current Context
- Today: ${new Date().toLocaleDateString()}
${context.hasImage ? '- User has attached an image for analysis' : ''}`;
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
      .replace(/^(generate|create|make|draw|paint|render)\s+(me\s+)?(a|an|the)\s+/i, '')
      .replace(/^(i want|i'd like|can you|please|could you)\s+/i, '')
      .trim();
  }
}

module.exports = Orchestrator;
