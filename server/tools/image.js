// ===== Tool: Image Generation =====
const CONFIG = require("../config");
const { register } = require("./index");

register({
  name: "generate_image",
  description: "Generate images from text descriptions using NVIDIA NIM image models.",
  parameters: {
    type: "object",
    properties: {
      prompt: { type: "string", description: "Text description of the image to generate." },
      model: {
        type: "string",
        description: "Image generation model.",
        enum: [
          "black-forest-labs/flux.1-dev",
          "black-forest-labs/flux.1-schnell",
          "black-forest-labs/flux.2-klein-4b",
          "stabilityai/stable-diffusion-3-medium",
          "stabilityai/stable-diffusion-xl",
          "google/diffusiongemma-26b-a4b-it",
        ],
        default: "black-forest-labs/flux.1-dev",
      },
      width: { type: "number", description: "Image width (512, 768, or 1024).", default: 1024 },
      height: { type: "number", description: "Image height (512, 768, or 1024).", default: 1024 },
      steps: { type: "number", description: "Inference steps.", default: 30 },
    },
    required: ["prompt"],
  },

  async execute(args) {
    const {
      prompt,
      model = "black-forest-labs/flux.1-dev",
      width = 1024,
      height = 1024,
      steps = 30,
    } = args;
    const apiKey = CONFIG.apiKey;

    const url = `https://ai.api.nvidia.com/v1/genai/${model}`;
    const body = { prompt, width, height, cfg_scale: 5, samples: 1, seed: 0, steps };

    const resp = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Image API error ${resp.status}: ${err}`);
    }

    const data = await resp.json();

    // Extract base64 image from various response formats
    let imageBase64 = null;
    if (data.image) {imageBase64 = data.image;}
    else if (data.artifacts?.[0]?.base64) {imageBase64 = data.artifacts[0].base64;}

    return {
      image: imageBase64,
      format: "png",
      prompt,
      model,
      width,
      height,
      data,
    };
  },
});
