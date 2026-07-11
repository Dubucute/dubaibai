// ===== NVIDIA NIM API Client =====
// Handles all NVIDIA NIM API calls with automatic fallback and error handling.

const CONFIG = require("./config");
const { getTaskRoute, getModelInfo } = require("./models");

class NIMClient {
  constructor(apiKey) {
    this.apiKey = apiKey || CONFIG.apiKey;
    this.baseUrl = CONFIG.apiBase;
  }

  /**
   * Send a chat completion request with automatic fallback.
   * Tries each model in the chain until one succeeds.
   */
  async chat(messages, { task = "chat", max_tokens = 4096, temperature, stream = false } = {}) {
    const route = getTaskRoute(task);
    const temp = temperature !== undefined ? temperature : CONFIG.temperature;
    const errors = [];
    let lastModel = null;

    for (const modelId of route.chain) {
      try {
        lastModel = modelId;
        const result = await this._chatCompletion(modelId, messages, {
          max_tokens,
          temperature: temp,
          stream,
        });

        if (stream) {
          return { model: modelId, route: task, stream: true, body: result };
        }

        return {
          model: modelId,
          route: task,
          content: result.choices?.[0]?.message?.content || "",
          usage: result.usage || null,
          finish_reason: result.choices?.[0]?.finish_reason || "stop",
          fallback_used: errors.length > 0,
          fallback_chain: errors.map((e) => e.model),
          errors: errors.length > 0 ? errors : undefined,
        };
      } catch (err) {
        const modelInfo = getModelInfo(modelId);
        errors.push({ model: modelId, name: modelInfo?.name || modelId, error: err.message });
        console.warn(`  ⚠️ Model ${modelId} failed: ${err.message}. Trying fallback...`);
      }
    }

    // All models in the chain failed
    throw new Error(
      `All models failed for task "${task}". Last tried: ${lastModel || "none"}. ` +
        `Errors: ${errors.map((e) => `${e.model}: ${e.error}`).join("; ")}`,
    );
  }

  /**
   * Stream a chat completion request — yields tokens one by one via SSE.
   * Tries each model in the chain until one succeeds.
   * Yields: { type: 'model_info', model, modelName } then { type: 'token', content } chunks.
   */
  async *chatStream(messages, { task = "chat", max_tokens = 4096, temperature } = {}) {
    const route = getTaskRoute(task);
    const temp = temperature !== undefined ? temperature : CONFIG.temperature;
    const errors = [];
    let lastModel = null;

    for (const modelId of route.chain) {
      try {
        lastModel = modelId;
        const body = await this._chatCompletion(modelId, messages, {
          max_tokens,
          temperature: temp,
          stream: true,
        });

        // body is a ReadableStream (Web API)
        const modelInfo = getModelInfo(modelId);
        const modelName = modelInfo?.name || modelId.split("/").pop();
        yield {
          type: "model_info",
          model: modelId,
          modelName,
          route: task,
          fallbackUsed: errors.length > 0,
          content:
            errors.length > 0
              ? `⚡ Switched to **${modelName}** (primary had issues)`
              : `🤖 Using **${modelName}**`,
        };

        let fullContent = "";
        const reader = body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let hasTokens = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data: ")) continue;
            const raw = trimmed.slice(6).trim();
            if (!raw || raw === "[DONE]") continue;

            try {
              const parsed = JSON.parse(raw);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                fullContent += delta;
                hasTokens = true;
                yield { type: "token", content: delta };
              }
            } catch (e) {
              // skip malformed SSE lines
            }
          }
        }

        // Success! Yield final result
        yield { type: "done", content: fullContent, model: modelId, modelName, hasTokens };
        return;
      } catch (err) {
        const modelInfo = getModelInfo(modelId);
        errors.push({ model: modelId, name: modelInfo?.name || modelId, error: err.message });
        console.warn(`  ⚠️ Model ${modelId} failed: ${err.message}. Trying fallback...`);
      }
    }

    // All models in the chain failed
    throw new Error(
      `All models failed for task "${task}". Last tried: ${lastModel || "none"}. ` +
        `Errors: ${errors.map((e) => `${e.model}: ${e.error}`).join("; ")}`,
    );
  }

  /**
   * Send a vision (multimodal) request with fallback.
   */
  async vision(imageData, prompt, { max_tokens = 1024, temperature = 0.3 } = {}) {
    const route = getTaskRoute("vision");
    const errors = [];
    let lastModel = null;

    const imageUrl = imageData.startsWith("data:")
      ? imageData
      : `data:image/png;base64,${imageData}`;

    for (const modelId of route.chain) {
      try {
        lastModel = modelId;
        const messages = [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: imageUrl } },
              { type: "text", text: prompt },
            ],
          },
        ];

        const result = await this._chatCompletion(modelId, messages, {
          max_tokens,
          temperature,
        });

        return {
          model: modelId,
          content: result.choices?.[0]?.message?.content || "",
          usage: result.usage || null,
          fallback_used: errors.length > 0,
          fallback_chain: errors.map((e) => e.model),
          errors: errors.length > 0 ? errors : undefined,
        };
      } catch (err) {
        const modelInfo = getModelInfo(modelId);
        errors.push({ model: modelId, name: modelInfo?.name || modelId, error: err.message });
        console.warn(`  ⚠️ Vision model ${modelId} failed: ${err.message}. Trying fallback...`);
      }
    }

    throw new Error(
      `All vision models failed. Last tried: ${lastModel}. ` +
        `Errors: ${errors.map((e) => `${e.model}: ${e.error}`).join("; ")}`,
    );
  }

  /**
   * Generate an image from a text prompt with fallback.
   * If `model` is specified in opts, uses that model directly (no fallback).
   */
  async generateImage(prompt, { width = 1024, height = 1024, steps = 30, model = null } = {}) {
    if (model) {
      // Use the exact model specified (from /imagine --model flag)
      try {
        const result = await this._imageGeneration(model, prompt, { width, height, steps });
        return {
          model,
          image: result.image || result.artifacts?.[0]?.base64 || null,
          prompt,
          width,
          height,
          fallback_used: false,
        };
      } catch (err) {
        throw new Error(`Image model ${model} failed: ${err.message}`);
      }
    }

    // Standard fallback chain
    const route = getTaskRoute("image");
    const errors = [];
    let lastModel = null;

    for (const modelId of route.chain) {
      try {
        lastModel = modelId;
        const result = await this._imageGeneration(modelId, prompt, {
          width,
          height,
          steps,
        });

        return {
          model: modelId,
          image: result.image || result.artifacts?.[0]?.base64 || null,
          prompt,
          width,
          height,
          fallback_used: errors.length > 0,
          fallback_chain: errors.map((e) => e.model),
          errors: errors.length > 0 ? errors : undefined,
        };
      } catch (err) {
        const modelInfo = getModelInfo(modelId);
        errors.push({ model: modelId, name: modelInfo?.name || modelId, error: err.message });
        console.warn(`  ⚠️ Image model ${modelId} failed: ${err.message}. Trying fallback...`);
      }
    }

    throw new Error(
      `All image models failed. Last tried: ${lastModel}. ` +
        `Errors: ${errors.map((e) => `${e.model}: ${e.error}`).join("; ")}`,
    );
  }

  /**
   * Generate embeddings with fallback.
   */
  async generateEmbeddings(input) {
    const route = getTaskRoute("embedding");
    const errors = [];
    let lastModel = null;

    for (const modelId of route.chain) {
      try {
        lastModel = modelId;
        const result = await this._embeddingRequest(modelId, input);
        return {
          model: modelId,
          data: result,
          fallback_used: errors.length > 0,
          errors: errors.length > 0 ? errors : undefined,
        };
      } catch (err) {
        errors.push({ model: modelId, error: err.message });
        console.warn(`  ⚠️ Embedding model ${modelId} failed: ${err.message}. Trying fallback...`);
      }
    }

    throw new Error(
      `All embedding models failed. Errors: ${errors.map((e) => `${e.model}: ${e.error}`).join("; ")}`,
    );
  }

  // ── Private: Low-level API calls ──

  async _chatCompletion(model, messages, opts = {}) {
    const url = `${this.baseUrl}/v1/chat/completions`;
    const body = {
      model,
      messages,
      max_tokens: opts.max_tokens || 4096,
      temperature: opts.temperature ?? 0.7,
      stream: opts.stream || false,
    };

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const err = await resp.text().catch(() => resp.statusText);
      throw new Error(`NVIDIA NIM API error ${resp.status}: ${err.slice(0, 200)}`);
    }

    if (opts.stream) {
      return resp.body;
    }

    return await resp.json();
  }

  async _imageGeneration(model, prompt, opts = {}) {
    const url = `https://ai.api.nvidia.com/v1/genai/${model}`;
    const body = {
      prompt,
      width: opts.width || 1024,
      height: opts.height || 1024,
      cfg_scale: 5,
      samples: 1,
      seed: 0,
      steps: opts.steps || 30,
    };

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const err = await resp.text().catch(() => resp.statusText);
      throw new Error(`Image API error ${resp.status}: ${err.slice(0, 200)}`);
    }

    return await resp.json();
  }

  async _embeddingRequest(model, input) {
    const modelName = model.split("/").pop();
    const url = `https://ai.api.nvidia.com/v1/retrieval/nvidia/${modelName}`;
    const body = { input };

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const err = await resp.text().catch(() => resp.statusText);
      throw new Error(`Embedding API error ${resp.status}: ${err.slice(0, 200)}`);
    }

    return await resp.json();
  }

  /**
   * Check if the API is reachable and list available models.
   */
  async checkHealth() {
    try {
      const resp = await fetch(`${this.baseUrl}/v1/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      if (!resp.ok) {
        return { connected: false, status: resp.status };
      }
      const data = await resp.json();
      return { connected: true, count: data.data?.length || 0, models: data.data || [] };
    } catch (e) {
      return { connected: false, error: e.message };
    }
  }
}

module.exports = NIMClient;
