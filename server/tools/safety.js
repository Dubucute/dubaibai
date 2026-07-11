// ===== Tool: Content Safety =====
const CONFIG = require("../config");
const { register } = require("./index");

register({
  name: "check_safety",
  description:
    "Analyze text for content safety violations, jailbreak attempts, or topic policy compliance.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "The text to analyze for safety." },
      mode: {
        type: "string",
        description: "Type of safety check.",
        enum: ["content_safety", "jailbreak_detect", "topic_control"],
        default: "content_safety",
      },
      model: {
        type: "string",
        description: "Safety model to use.",
        enum: [
          "nvidia/llama-3.1-nemoguard-8b-content-safety",
          "nvidia/nemotron-3.5-content-safety",
          "nvidia/nemoguard-jailbreak-detect",
          "nvidia/llama-3.1-nemoguard-8b-topic-control",
          "meta/llama-guard-4-12b",
        ],
        default: "nvidia/llama-3.1-nemoguard-8b-content-safety",
      },
    },
    required: ["text"],
  },

  async execute(args) {
    const {
      text,
      mode = "content_safety",
      model = "nvidia/llama-3.1-nemoguard-8b-content-safety",
    } = args;
    const apiKey = CONFIG.apiKey;

    let url, body;

    if (model.includes("jailbreak-detect")) {
      url = `https://ai.api.nvidia.com/v1/nvidia/nemoguard-jailbreak-detect`;
      body = { messages: [{ role: "user", content: text }] };
    } else {
      url = `${CONFIG.apiBase}/v1/chat/completions`;
      const systemMsg =
        mode === "topic_control"
          ? "Check if this content complies with allowed topics. Respond with SAFE or UNSAFE and explain why."
          : "Analyze the following content for safety violations. Respond with SAFE or UNSAFE and explain which categories are triggered.";
      body = {
        model,
        messages: [
          { role: "system", content: systemMsg },
          { role: "user", content: text },
        ],
        max_tokens: 512,
        temperature: 0.1,
      };
    }

    const resp = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || JSON.stringify(data, null, 2);

    const isSafe = !content.toLowerCase().includes("unsafe");
    return {
      safe: isSafe,
      analysis: content,
      model,
      mode,
    };
  },
});
