// ===== Tool: Computer Vision (CV) =====
const CONFIG = require("../config");
const { register } = require("./index");

register({
  name: "analyze_cv",
  description:
    "Advanced computer vision: object detection, deepfake detection, image classification, and feature extraction.",
  parameters: {
    type: "object",
    properties: {
      image: { type: "string", description: "Base64-encoded image data." },
      task: {
        type: "string",
        description: "CV task to perform.",
        enum: ["detection", "deepfake", "classification", "feature_extraction"],
        default: "detection",
      },
      prompt: {
        type: "string",
        description: 'For detection: objects to detect (e.g. "person, car").',
      },
    },
    required: ["image"],
  },

  async execute(args) {
    const { image, task = "detection", prompt = "" } = args;
    const apiKey = CONFIG.apiKey;
    const base64Data = image.split(",")[1] || image;

    let url, body;

    switch (task) {
      case "detection":
        url = "https://ai.api.nvidia.com/v1/cv/nvidia/nv-grounding-dino";
        body = {
          messages: [{ content: `data:image/png;base64,${base64Data}` }],
          prompt: prompt || "objects",
        };
        break;
      case "deepfake":
        url = "https://ai.api.nvidia.com/v1/genai/hive/deepfake-image-detection";
        body = { image: base64Data };
        break;
      case "classification":
        url = "https://ai.api.nvidia.com/v1/cv/nvidia/nv-dinov2";
        body = { messages: [{ content: `data:image/png;base64,${base64Data}` }] };
        break;
      case "feature_extraction":
        url = "https://ai.api.nvidia.com/v1/retrieval/nvidia/nvclip";
        body = { input: [{ image: base64Data }] };
        break;
      default:
        throw new Error(`Unknown CV task: ${task}`);
    }

    const resp = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await resp.json();
    return { task, result: data };
  },
});
