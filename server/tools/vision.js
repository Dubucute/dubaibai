// ===== Tool: Vision Analysis =====
const CONFIG = require("../config");
const { register } = require("./index");

register({
  name: "analyze_vision",
  description: "Analyze images using multimodal vision models. Ask questions about image content.",
  parameters: {
    type: "object",
    properties: {
      image: {
        type: "string",
        description: "Base64-encoded image data (with or without data: prefix).",
      },
      prompt: {
        type: "string",
        description: "Question or instruction about the image.",
        default: "Describe this image in detail.",
      },
      model: {
        type: "string",
        description: "Vision model to use.",
        enum: [
          "meta/llama-3.2-90b-vision-instruct",
          "meta/llama-3.2-11b-vision-instruct",
          "meta/llama-4-maverick-17b-128e-instruct",
          "microsoft/phi-4-multimodal-instruct",
          "nvidia/llama-3.1-nemotron-nano-vl-8b-v1",
        ],
        default: "meta/llama-3.2-90b-vision-instruct",
      },
      max_tokens: { type: "number", default: 1024 },
    },
    required: ["image"],
  },

  async execute(args) {
    const {
      image,
      prompt = "Describe this image in detail.",
      model = "meta/llama-3.2-90b-vision-instruct",
      max_tokens = 1024,
    } = args;
    const apiKey = CONFIG.apiKey;

    // Ensure image has proper data URI prefix
    const imageUrl = image.startsWith("data:") ? image : `data:image/png;base64,${image}`;

    const url = `${CONFIG.apiBase}/v1/chat/completions`;
    const body = {
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageUrl } },
            { type: "text", text: prompt },
          ],
        },
      ],
      max_tokens,
      temperature: 0.3,
      stream: false,
    };

    const resp = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || JSON.stringify(data);

    return {
      content,
      model,
      usage: data.usage || null,
    };
  },
});
