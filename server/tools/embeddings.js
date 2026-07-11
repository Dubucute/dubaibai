// ===== Tool: Embeddings =====
const CONFIG = require("../config");
const { register } = require("./index");

register({
  name: "generate_embeddings",
  description: "Generate vector embeddings for text, or rerank passages against a query.",
  parameters: {
    type: "object",
    properties: {
      input: {
        type: "string",
        description: "Text to embed (one item) or multiple items separated by newlines.",
      },
      mode: { type: "string", enum: ["embed", "rerank"], default: "embed" },
      query: { type: "string", description: "Query for reranking mode." },
      model: {
        type: "string",
        description: "Embedding model.",
        enum: [
          "nvidia/nv-embedqa-e5-v5",
          "nvidia/nv-embed-v1",
          "nvidia/llama-nemotron-embed-1b-v2",
          "baai/bge-m3",
          "snowflake/arctic-embed-l",
        ],
        default: "nvidia/nv-embedqa-e5-v5",
      },
    },
    required: ["input"],
  },

  async execute(args) {
    const { input, mode = "embed", query = "", model = "nvidia/nv-embedqa-e5-v5" } = args;
    const apiKey = CONFIG.apiKey;
    const modelName = model.split("/").pop();

    let url, body;

    if (mode === "rerank") {
      url = `https://ai.api.nvidia.com/v1/retrieval/nvidia/${modelName}`;
      body = { query, passages: input.split("\n").filter(Boolean) };
    } else {
      if (model.includes("nvclip")) {
        url = `https://ai.api.nvidia.com/v1/retrieval/nvidia/nvclip`;
        body = { input: [{ text: input }] };
      } else {
        url = `https://ai.api.nvidia.com/v1/retrieval/nvidia/${modelName}`;
        body = { input };
      }
    }

    const resp = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await resp.json();
    return { mode, dimension: data.embedding?.length || null, data };
  },
});
