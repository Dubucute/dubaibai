// ===== NVIDIA NIM Model Registry =====
// Every model discovered from the NVIDIA API catalog, categorized by capability.
// Ordered by priority: smartest models first, fastest models highlighted.
// Source: https://integrate.api.nvidia.com/v1/models (121 models discovered)
// Enhanced with real benchmark data from dubu.alwaysdata.net proxy

const { fetchRanked, buildChain, getModelBenchmark, getRankedData } = require("./benchmark");

const MODELS = {
  // ── Large Language Models ──
  chat: {
    category: "LLM",
    models: {
      // ═══ SMARText (Quality 9-10) ═══
      "nvidia/llama-3.1-nemotron-ultra-253b-v1": {
        name: "Nemotron Ultra 253B",
        capabilities: ["chat", "reasoning", "code", "writing", "analysis"],
        speed: "medium",
        quality: 10,
        context: 131072,
      },
      "nvidia/nemotron-3-ultra-550b-a55b": {
        name: "Nemotron 3 Ultra 550B",
        capabilities: ["chat", "reasoning", "code", "writing", "analysis"],
        speed: "medium",
        quality: 8,
        benchmarkScore: 75,
        context: 131072,
      },
      "nvidia/nemotron-3-super-120b-a12b": {
        name: "Nemotron 3 Super 120B",
        capabilities: ["chat", "reasoning", "code", "writing", "analysis"],
        speed: "fast",
        quality: 8,
        benchmarkScore: 75,
        context: 131072,
      },
      "qwen/qwen3.5-397b-a17b": {
        name: "Qwen 3.5 397B",
        capabilities: ["chat", "reasoning", "code", "multilingual"],
        speed: "medium",
        quality: 10,
        context: 131072,
      },
      "mistralai/mistral-large-3-675b-instruct-2512": {
        name: "Mistral Large 3 675B",
        capabilities: ["chat", "reasoning", "code", "multilingual"],
        speed: "medium",
        quality: 10,
        context: 131072,
      },
      "qwen/qwen3.5-122b-a10b": {
        name: "Qwen 3.5 122B",
        capabilities: ["chat", "code", "reasoning", "multilingual"],
        speed: "fast",
        quality: 9,
        benchmarkScore: 85,
        context: 131072,
      },
      "stepfun-ai/step-3.5-flash": {
        name: "Step 3.5 Flash",
        capabilities: ["chat", "code", "reasoning"],
        speed: "very_fast",
        quality: 9,
        benchmarkScore: 90,
        context: 65536,
      },
      "nvidia/ising-calibration-1-35b-a3b": {
        name: "Ising Calibration 35B",
        capabilities: ["chat", "code", "reasoning"],
        speed: "fast",
        quality: 9,
        benchmarkScore: 85,
        context: 131072,
      },
      "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning": {
        name: "Nemotron 3 Nano Omni 30B",
        capabilities: ["chat", "reasoning", "code"],
        speed: "medium",
        quality: 9,
        benchmarkScore: 85,
        context: 131072,
      },
      "openai/gpt-oss-20b": {
        name: "GPT-OSS 20B",
        capabilities: ["chat", "code", "reasoning"],
        speed: "fast",
        quality: 9,
        benchmarkScore: 85,
        context: 131072,
      },
      "poolside/laguna-xs-2.1": {
        name: "Laguna XS 2.1",
        capabilities: ["chat", "code"],
        speed: "very_fast",
        quality: 9,
        benchmarkScore: 85,
        context: 65536,
      },
      "nvidia/llama-3.3-nemotron-super-49b-v1.5": {
        name: "Nemotron Super 49B v1.5",
        capabilities: ["chat", "reasoning", "code", "writing", "analysis"],
        speed: "very_fast",
        quality: 9,
        context: 131072,
      },
      "nvidia/llama-3.3-nemotron-super-49b-v1": {
        name: "Nemotron Super 49B",
        capabilities: ["chat", "reasoning", "code", "writing", "analysis"],
        speed: "very_fast",
        quality: 9,
        context: 131072,
      },
      "nvidia/llama-3.1-nemotron-70b-instruct": {
        name: "Nemotron 70B",
        capabilities: ["chat", "reasoning", "code"],
        speed: "fast",
        quality: 9,
        context: 131072,
      },
      "deepseek-ai/deepseek-v4-pro": {
        name: "DeepSeek V4 Pro",
        capabilities: ["chat", "code", "reasoning"],
        speed: "fast",
        quality: 9,
        context: 65536,
      },
      "meta/llama-4-maverick-17b-128e-instruct": {
        name: "Llama 4 Maverick 17B",
        capabilities: ["chat", "vision", "reasoning", "code"],
        speed: "fast",
        quality: 9,
        context: 131072,
      },
      "mistralai/mistral-large-2-instruct": {
        name: "Mistral Large 2",
        capabilities: ["chat", "reasoning", "code", "multilingual"],
        speed: "medium",
        quality: 9,
        context: 131072,
      },
      "minimaxai/minimax-m3": {
        name: "MiniMax M3",
        capabilities: ["chat", "reasoning", "code"],
        speed: "very_slow",
        quality: 8,
        benchmarkScore: 80,
        context: 131072,
      },
      "moonshotai/kimi-k2.6": {
        name: "Kimi K2.6",
        capabilities: ["chat", "reasoning", "code", "analysis"],
        speed: "fast",
        quality: 9,
        context: 131072,
      },
      "qwen/qwq-32b": {
        name: "QWQ 32B (Reasoning)",
        capabilities: ["reasoning", "math", "logic", "chat"],
        speed: "slow",
        quality: 10,
        context: 131072,
      },
      "google/gemma-4-31b-it": {
        name: "Gemma 4 31B",
        capabilities: ["chat", "reasoning", "code"],
        speed: "fast",
        quality: 9,
        context: 65536,
      },

      // ═══ SMART (Quality 7-8) ═══
      "meta/llama-3.3-70b-instruct": {
        name: "Llama 3.3 70B",
        capabilities: ["chat", "reasoning", "code"],
        speed: "fast",
        quality: 8,
        context: 131072,
      },
      "deepseek-ai/deepseek-v4-flash": {
        name: "DeepSeek V4 Flash",
        capabilities: ["chat", "code", "reasoning"],
        speed: "very_fast",
        quality: 8,
        context: 65536,
      },
      "moonshotai/kimi-k2-instruct": {
        name: "Kimi K2",
        capabilities: ["chat", "reasoning", "code"],
        speed: "fast",
        quality: 8,
        context: 65536,
      },
      "mistralai/mistral-small-4-119b-2603": {
        name: "Mistral Small 4 119B",
        capabilities: ["chat", "code", "reasoning"],
        speed: "fast",
        quality: 8,
        context: 131072,
      },
      "nvidia/llama-3.1-nemotron-51b-instruct": {
        name: "Nemotron 51B",
        capabilities: ["chat", "code", "reasoning"],
        speed: "fast",
        quality: 8,
        context: 131072,
      },
      "qwen/qwen3-next-80b-a3b-instruct": {
        name: "Qwen 3 80B MoE",
        capabilities: ["chat", "code", "multilingual"],
        speed: "fast",
        quality: 8,
        context: 131072,
      },
      "stepfun-ai/step-3.7-flash": {
        name: "Step 3.7 Flash",
        capabilities: ["chat", "code", "reasoning"],
        speed: "very_fast",
        quality: 8,
        benchmarkScore: 75,
        context: 65536,
      },
      "thinkingmachines/inkling": {
        name: "Inkling",
        capabilities: ["chat", "code", "reasoning"],
        speed: "very_fast",
        quality: 8,
        benchmarkScore: 75,
        context: 65536,
      },
      "nvidia/nvidia-nemotron-nano-9b-v2": {
        name: "Nemotron Nano 9B v2",
        capabilities: ["chat", "code"],
        speed: "slow",
        quality: 8,
        benchmarkScore: 75,
        context: 131072,
      },
      "meta/llama-3.1-70b-instruct": {
        name: "Llama 3.1 70B",
        capabilities: ["chat", "reasoning", "code"],
        speed: "fast",
        quality: 7,
        context: 131072,
      },
      "mistralai/mistral-nemotron": {
        name: "Mistral Nemotron",
        capabilities: ["chat", "code"],
        speed: "fast",
        quality: 4,
        benchmarkScore: 30,
        context: 65536,
      },
      "mistralai/mixtral-8x22b-v0.1": {
        name: "Mixtral 8x22B",
        capabilities: ["chat", "reasoning", "multilingual"],
        speed: "medium",
        quality: 7,
        context: 65536,
      },
      "mistralai/mistral-large": {
        name: "Mistral Large",
        capabilities: ["chat", "reasoning", "multilingual"],
        speed: "medium",
        quality: 9,
        context: 32768,
      },
      "mistralai/mistral-medium-3.5-128b": {
        name: "Mistral Medium 3.5 128B",
        capabilities: ["chat", "reasoning", "code", "multilingual"],
        speed: "fast",
        quality: 8,
        context: 131072,
      },
      "google/gemma-3-12b-it": {
        name: "Gemma 3 12B",
        capabilities: ["chat", "code", "reasoning"],
        speed: "very_fast",
        quality: 7,
        context: 32768,
      },
      "snowflake/arctic-embed-l": {
        name: "Arctic Embed L",
        capabilities: ["embedding", "retrieval"],
        speed: "fast",
      },
      "stockmark/stockmark-2-100b-instruct": {
        name: "Stockmark 2 100B",
        capabilities: ["chat", "code"],
        speed: "fast",
        quality: 7,
        context: 65536,
      },
      "z-ai/glm-5.2": {
        name: "GLM 5.2",
        capabilities: ["chat", "reasoning"],
        speed: "slow",
        quality: 8,
        benchmarkScore: 80,
        context: 65536,
      },
      "ibm/granite-34b-code-instruct": {
        name: "Granite 34B Code",
        capabilities: ["code", "chat"],
        speed: "fast",
        quality: 7,
        context: 65536,
      },

      // ═══ FAST & LIGHTWEIGHT (Quality 5-6) ═══
      "microsoft/phi-4-mini-instruct": {
        name: "Phi-4 Mini",
        capabilities: ["chat", "code", "fast"],
        speed: "very_fast",
        quality: 6,
        context: 16384,
      },
      "google/gemma-3-4b-it": {
        name: "Gemma 3 4B",
        capabilities: ["chat", "fast"],
        speed: "very_fast",
        quality: 6,
        context: 32768,
      },
      "mistralai/ministral-14b-instruct-2512": {
        name: "Ministral 14B",
        capabilities: ["chat", "code", "fast"],
        speed: "very_fast",
        quality: 6,
        context: 65536,
      },
      "meta/llama-3.1-8b-instruct": {
        name: "Llama 3.1 8B",
        capabilities: ["chat", "fast"],
        speed: "very_fast",
        quality: 6,
        context: 131072,
      },
      "meta/llama-3.2-3b-instruct": {
        name: "Llama 3.2 3B",
        capabilities: ["chat", "fast"],
        speed: "very_fast",
        quality: 5,
        context: 131072,
      },
      "meta/llama-3.2-1b-instruct": {
        name: "Llama 3.2 1B",
        capabilities: ["chat", "fast"],
        speed: "very_fast",
        quality: 4,
        context: 131072,
      },
      "google/gemma-2-2b-it": {
        name: "Gemma 2 2B",
        capabilities: ["chat", "fast"],
        speed: "very_fast",
        quality: 5,
        context: 8192,
      },

      "nvidia/llama-3.1-nemotron-nano-8b-v1": {
        name: "Nemotron Nano 8B",
        capabilities: ["chat", "fast"],
        speed: "very_fast",
        quality: 5,
        context: 65536,
      },
      "nvidia/nemotron-nano-3-30b-a3b": {
        name: "Nemotron Nano 3 30B",
        capabilities: ["chat", "reasoning", "fast"],
        speed: "very_fast",
        quality: 6,
        context: 65536,
      },
      "nvidia/nemotron-3-nano-30b-a3b": {
        name: "Nemotron 3 Nano 30B",
        capabilities: ["chat", "code"],
        speed: "very_fast",
        quality: 8,
        benchmarkScore: 80,
        context: 65536,
      },

      "nvidia/mistral-nemo-minitron-8b-8k-instruct": {
        name: "Mistral Nemo Minitron 8B",
        capabilities: ["chat", "fast"],
        speed: "very_fast",
        quality: 5,
        context: 8192,
      },
      "meta/llama3-chatqa-1.5-70b": {
        name: "Llama3 ChatQA 1.5 70B",
        capabilities: ["chat", "rag"],
        speed: "fast",
        quality: 7,
        context: 32768,
      },
      "meta/codellama-70b": {
        name: "CodeLlama 70B",
        capabilities: ["code"],
        speed: "medium",
        quality: 7,
        context: 16384,
      },
      "ibm/granite-3.0-8b-instruct": {
        name: "Granite 3.0 8B",
        capabilities: ["chat", "code"],
        speed: "fast",
        quality: 5,
        context: 8192,
      },
      "ibm/granite-3.0-3b-a800m-instruct": {
        name: "Granite 3.0 3B",
        capabilities: ["chat", "fast"],
        speed: "very_fast",
        quality: 4,
        context: 8192,
      },
      "ibm/granite-8b-code-instruct": {
        name: "Granite 8B Code",
        capabilities: ["code"],
        speed: "fast",
        quality: 5,
        context: 8192,
      },
      "mistralai/mistral-7b-instruct-v0.3": {
        name: "Mistral 7B v0.3",
        capabilities: ["chat", "fast"],
        speed: "very_fast",
        quality: 5,
        context: 32768,
      },
      "mistralai/mixtral-8x7b-instruct-v0.1": {
        name: "Mixtral 8x7B",
        capabilities: ["chat", "multilingual"],
        speed: "fast",
        quality: 5,
        context: 32768,
      },
      "mistralai/codestral-22b-instruct-v0.1": {
        name: "Codestral 22B",
        capabilities: ["code"],
        speed: "fast",
        quality: 7,
        context: 65536,
      },
      "google/codegemma-1.1-7b": {
        name: "CodeGemma 1.1 7B",
        capabilities: ["code"],
        speed: "fast",
        quality: 5,
        context: 8192,
      },
      "google/codegemma-7b": {
        name: "CodeGemma 7B",
        capabilities: ["code"],
        speed: "fast",
        quality: 5,
        context: 8192,
      },
      "bigcode/starcoder2-15b": {
        name: "StarCoder2 15B",
        capabilities: ["code"],
        speed: "fast",
        quality: 5,
        context: 16384,
      },
      "deepseek-ai/deepseek-coder-6.7b-instruct": {
        name: "DeepSeek Coder 6.7B",
        capabilities: ["code"],
        speed: "very_fast",
        quality: 5,
        context: 16384,
      },
      "microsoft/phi-3.5-moe-instruct": {
        name: "Phi-3.5 MoE",
        capabilities: ["chat", "fast"],
        speed: "very_fast",
        quality: 5,
        context: 8192,
      },
      "aisingapore/sea-lion-7b-instruct": {
        name: "Sea-Lion 7B",
        capabilities: ["chat", "multilingual"],
        speed: "fast",
        quality: 5,
        context: 8192,
      },
      "upstage/solar-10.7b-instruct": {
        name: "Solar 10.7B",
        capabilities: ["chat"],
        speed: "fast",
        quality: 5,
        context: 8192,
      },
      "zyphra/zamba2-7b-instruct": {
        name: "Zamba2 7B",
        capabilities: ["chat", "fast"],
        speed: "very_fast",
        quality: 5,
        context: 16384,
      },
      "sarvamai/sarvam-m": {
        name: "Sarvam M",
        capabilities: ["chat", "multilingual"],
        speed: "fast",
        quality: 5,
        context: 32768,
      },
      "bytedance/seed-oss-36b-instruct": {
        name: "Seed OSS 36B",
        capabilities: ["chat", "code"],
        speed: "fast",
        quality: 6,
        context: 32768,
      },
      "databricks/dbrx-instruct": {
        name: "DBRX Instruct",
        capabilities: ["chat", "code", "reasoning"],
        speed: "medium",
        quality: 7,
        context: 32768,
      },
      "ai21labs/jamba-1.5-large-instruct": {
        name: "Jamba 1.5 Large",
        capabilities: ["chat", "reasoning"],
        speed: "fast",
        quality: 7,
        context: 256000,
      },
      "writer/palmyra-creative-122b": {
        name: "Palmyra Creative 122B",
        capabilities: ["chat", "writing", "creative"],
        speed: "medium",
        quality: 8,
        context: 32768,
      },
      "writer/palmyra-fin-70b-32k": {
        name: "Palmyra Fin 70B",
        capabilities: ["chat", "finance"],
        speed: "medium",
        quality: 7,
        context: 32768,
      },
      "writer/palmyra-med-70b": {
        name: "Palmyra Med 70B",
        capabilities: ["chat", "medical"],
        speed: "medium",
        quality: 7,
        context: 32768,
      },
      "minimaxai/minimax-m2.7": {
        name: "MiniMax M2.7",
        capabilities: ["chat", "reasoning"],
        speed: "fast",
        quality: 8,
        context: 65536,
      },
      "01-ai/yi-large": {
        name: "Yi Large",
        capabilities: ["chat", "reasoning"],
        speed: "fast",
        quality: 7,
        context: 32768,
      },
      "nv-mistralai/mistral-nemo-12b-instruct": {
        name: "Mistral Nemo 12B",
        capabilities: ["chat", "code", "multilingual"],
        speed: "fast",
        quality: 6,
        context: 65536,
      },
      "abacusai/dracarys-llama-3.1-70b-instruct": {
        name: "Dracarys Llama 3.1 70B",
        capabilities: ["chat", "reasoning"],
        speed: "very_slow",
        quality: 3,
        benchmarkScore: 25,
        context: 131072,
      },

      "openai/gpt-oss-120b": {
        name: "GPT-OSS 120B",
        capabilities: ["chat", "reasoning", "code"],
        speed: "medium",
        quality: 7,
        context: 32768,
      },
    },
  },

  // ── Vision / Multimodal Models ──
  vision: {
    category: "Multimodal",
    models: {
      "meta/llama-3.2-90b-vision-instruct": {
        name: "Llama 3.2 90B Vision",
        capabilities: ["vision", "image_understanding", "chart_reading"],
        speed: "medium",
        quality: 9,
        context: 131072,
      },

      "microsoft/phi-4-multimodal-instruct": {
        name: "Phi-4 Multimodal",
        capabilities: ["vision", "image_understanding", "audio"],
        speed: "fast",
        quality: 8,
        context: 65536,
      },
      "meta/llama-3.2-11b-vision-instruct": {
        name: "Llama 3.2 11B Vision",
        capabilities: ["vision", "image_understanding"],
        speed: "fast",
        quality: 7,
        context: 131072,
      },
      "nvidia/llama-3.1-nemotron-nano-vl-8b-v1": {
        name: "Nemotron Nano VL 8B",
        capabilities: ["vision", "image_understanding"],
        speed: "very_fast",
        quality: 6,
        context: 65536,
      },
      "microsoft/kosmos-2": {
        name: "Kosmos-2",
        capabilities: ["vision", "grounding"],
        speed: "fast",
        quality: 6,
        context: 2048,
      },
      "microsoft/phi-3-vision-128k-instruct": {
        name: "Phi-3 Vision 128K",
        capabilities: ["vision", "image_understanding"],
        speed: "fast",
        quality: 6,
        context: 131072,
      },
      "nvidia/neva-22b": {
        name: "NeVA 22B",
        capabilities: ["vision", "image_understanding"],
        speed: "medium",
        quality: 6,
        context: 4096,
      },
      "adept/fuyu-8b": {
        name: "Fuyu 8B",
        capabilities: ["vision", "image_understanding", "chart_reading"],
        speed: "fast",
        quality: 5,
        context: 2048,
      },
      "nvidia/llama-3.2-nemoretriever-1b-vlm-embed-v1": {
        name: "NemoRetriever VLM 1B",
        capabilities: ["vision", "embedding"],
        speed: "fast",
        quality: 5,
        context: 8192,
      },
      "nvidia/nemotron-nano-12b-v2-vl": {
        name: "Nemotron Nano 12B VL v2",
        capabilities: ["vision", "image_understanding"],
        speed: "very_fast",
        quality: 4,
        benchmarkScore: 40,
        context: 65536,
      },
      "nvidia/cosmos-reason2-8b": {
        name: "Cosmos Reason2 8B",
        capabilities: ["vision", "reasoning", "video"],
        speed: "fast",
        quality: 6,
        context: 65536,
      },
    },
  },

  // ── Image Generation Models ──
  image: {
    category: "Image Generation",
    models: {
      "black-forest-labs/flux.1-dev": {
        name: "Flux.1 Dev",
        capabilities: ["text_to_image", "image_generation"],
        speed: "medium",
        quality: 9,
      },
      "black-forest-labs/flux.1-schnell": {
        name: "Flux.1 Schnell",
        capabilities: ["text_to_image", "image_generation"],
        speed: "fast",
        quality: 8,
      },
      "black-forest-labs/flux.2-klein-4b": {
        name: "Flux.2 Klein 4B",
        capabilities: ["text_to_image", "image_generation"],
        speed: "very_fast",
        quality: 7,
      },
      "stabilityai/stable-diffusion-3-medium": {
        name: "SD 3 Medium",
        capabilities: ["text_to_image"],
        speed: "medium",
        quality: 8,
      },
      "stabilityai/stable-diffusion-xl": {
        name: "SD XL",
        capabilities: ["text_to_image"],
        speed: "medium",
        quality: 7,
      },
      "google/diffusiongemma-26b-a4b-it": {
        name: "DiffusionGemma 26B",
        capabilities: ["text_to_image"],
        speed: "medium",
        quality: 8,
      },
    },
  },

  // ── Embedding Models ──
  embedding: {
    category: "Embeddings",
    models: {
      "nvidia/nv-embedqa-e5-v5": {
        name: "NV-EmbedQA E5 v5",
        capabilities: ["embedding", "retrieval"],
        dimensions: 1024,
        speed: "fast",
      },
      "nvidia/nv-embed-v1": {
        name: "NV-Embed v1",
        capabilities: ["embedding", "retrieval"],
        dimensions: 1024,
        speed: "fast",
      },
      "nvidia/llama-nemotron-embed-1b-v2": {
        name: "Nemotron Embed 1B v2",
        capabilities: ["embedding"],
        dimensions: 2048,
        speed: "very_fast",
      },
      "nvidia/nv-embedqa-mistral-7b-v2": {
        name: "NV-EmbedQA Mistral 7B v2",
        capabilities: ["embedding", "retrieval"],
        dimensions: 4096,
        speed: "fast",
      },
      "nvidia/nv-embedcode-7b-v1": {
        name: "NV-EmbedCode 7B",
        capabilities: ["embedding", "code"],
        dimensions: 4096,
        speed: "fast",
      },
      "nvidia/llama-3.2-nv-embedqa-1b-v1": {
        name: "NV-EmbedQA 1B v1",
        capabilities: ["embedding", "retrieval"],
        dimensions: 1024,
        speed: "very_fast",
      },
      "nvidia/embed-qa-4": {
        name: "Embed QA 4",
        capabilities: ["embedding", "retrieval"],
        dimensions: 1024,
        speed: "fast",
      },
      "baai/bge-m3": {
        name: "BGE M3",
        capabilities: ["embedding", "retrieval", "multilingual"],
        dimensions: 1024,
        speed: "fast",
      },

      "nvidia/llama-3.1-nemoguard-8b-content-safety": {
        name: "Nemoguard Content Safety",
        capabilities: ["content_safety"],
        speed: "fast",
      },
      "nvidia/nemotron-3.5-content-safety": {
        name: "Nemotron 3.5 Safety",
        capabilities: ["content_safety"],
        speed: "fast",
      },
      "nvidia/llama-3.1-nemotron-safety-guard-8b-v3": {
        name: "Nemotron Safety Guard 8B v3",
        capabilities: ["content_safety"],
        speed: "fast",
      },
      "nvidia/nemotron-content-safety-reasoning-4b": {
        name: "Content Safety Reasoning 4B",
        capabilities: ["content_safety", "reasoning"],
        speed: "fast",
      },
      "nvidia/nemoguard-jailbreak-detect": {
        name: "Jailbreak Detect",
        capabilities: ["jailbreak_detect"],
        speed: "fast",
      },
      "nvidia/llama-3.1-nemoguard-8b-topic-control": {
        name: "Topic Control",
        capabilities: ["topic_control"],
        speed: "fast",
      },
      "meta/llama-guard-4-12b": {
        name: "Llama Guard 4 12B",
        capabilities: ["content_safety"],
        speed: "fast",
      },
    },
  },

  // ── Video / Vision-Language Models ──
  video: {
    category: "Video",
    models: {
      // Shared with vision section — see vision for model entries
    },
  },
};

const ownerMap = {
  "nvidia": "NVIDIA",
  "meta": "Meta",
  "mistralai": "Mistral",
  "google": "Google",
  "openai": "OpenAI",
  "upstage": "Upstage",
  "qwen": "Qwen",
  "ibm": "IBM",
  "writer": "Writer",
  "deepseek": "DeepSeek",
  "phi": "Microsoft",
  "microsoft": "Microsoft",
  "allenai": "AllenAI",
  "nousresearch": "Nous",
  "01-ai": "01.AI",
  "zai": "Z.ai",
  "stepfun": "StepFun",
  "baichuan": "Baichuan",
  "internlm": "InternLM",
  "minimax": "MiniMax",
  "moonshot": "Moonshot",
  "baai": "BAAI",
  "thudm": "THUDM",
};

function formatModelName(name, owner) {
  const ownerKey = (owner || "").toLowerCase();
  const prefix = ownerMap[ownerKey] || (owner ? owner.charAt(0).toUpperCase() + owner.slice(1) : "");

  if (prefix && !name.toLowerCase().startsWith(prefix.toLowerCase())) {
    return `${prefix} ${name}`;
  }
  return name;
}

function getModelsByCapability(capability) {
  const results = [];
  for (const category of Object.values(MODELS)) {
    for (const [id, info] of Object.entries(category.models)) {
      if (info.capabilities && info.capabilities.includes(capability)) {
        results.push({ id, ...info, category: category.category });
      }
    }
  }
  return results.sort((a, b) => (b.quality || 0) - (a.quality || 0));
}

// =============================================================================
// TASK ROUTES — model chains for each task type
// =============================================================================
const TASK_ROUTES = {
  // General conversation
  chat: {
    task: "chat",
    description: "General conversation and Q&A",
    chain: [
      "meta/llama-3.1-8b-instruct",
      "minimaxai/minimax-m2.7",
      "nvidia/nemotron-3-nano-30b-a3b",
      "nvidia/nemotron-3-super-120b-a12b",
      "nvidia/ising-calibration-1-35b-a3b",
      "deepseek-ai/deepseek-v4-flash",
      "meta/llama-3.3-70b-instruct",
      "meta/llama-3.1-70b-instruct",
    ],
    endpoint: "chat",
  },

  // Code generation & analysis
  code: {
    task: "code",
    description: "Code generation, debugging, and analysis",
    chain: [
      "meta/llama-3.1-8b-instruct",
      "minimaxai/minimax-m2.7",
      "nvidia/nemotron-3-nano-30b-a3b",
      "nvidia/nemotron-3-super-120b-a12b",
      "nvidia/ising-calibration-1-35b-a3b",
      "nvidia/nvidia-nemotron-nano-9b-v2",
      "deepseek-ai/deepseek-v4-flash",
      "deepseek-ai/deepseek-v4-pro",
    ],
    endpoint: "chat",
  },

  // Deep reasoning & math
  reasoning: {
    task: "reasoning",
    description: "Complex reasoning, math, logic puzzles",
    chain: [
      "meta/llama-3.1-8b-instruct",
      "minimaxai/minimax-m2.7",
      "nvidia/nemotron-3-nano-30b-a3b",
      "nvidia/nemotron-3-super-120b-a12b",
      "deepseek-ai/deepseek-v4-flash",
      "meta/llama-3.1-70b-instruct",
      "meta/llama-3.3-70b-instruct",
      "deepseek-ai/deepseek-v4-pro",
    ],
    endpoint: "chat",
  },

  // Fast, simple responses — speed-prioritized from benchmarks
  fast: {
    task: "fast",
    description: "Quick responses for simple queries",
    chain: [
      "mistralai/mistral-small-4-119b-2603",
      "meta/llama-3.1-8b-instruct",
      "nvidia/nemotron-3-nano-30b-a3b",
      "nvidia/nemotron-3-super-120b-a12b",
      "stepfun-ai/step-3.5-flash",
      "deepseek-ai/deepseek-v4-flash",
    ],
    endpoint: "chat",
  },

  // Web Search — smart models that can synthesize search results
  websearch: {
    task: "websearch",
    description: "Web search synthesis — fetch + answer from real results",
    chain: [
      "meta/llama-3.1-8b-instruct",
      "minimaxai/minimax-m2.7",
      "nvidia/nemotron-3-nano-30b-a3b",
      "nvidia/nemotron-3-super-120b-a12b",
      "deepseek-ai/deepseek-v4-flash",
      "meta/llama-3.1-70b-instruct",
      "meta/llama-3.3-70b-instruct",
      "deepseek-ai/deepseek-v4-pro",
    ],
    endpoint: "chat",
  },

  // Image analysis / vision
  vision: {
    task: "vision",
    description: "Image analysis and understanding",
    chain: [
      "meta/llama-3.2-90b-vision-instruct",
      "meta/llama-4-maverick-17b-128e-instruct",
      "microsoft/phi-4-multimodal-instruct",
      "meta/llama-3.2-11b-vision-instruct",
      "nvidia/nemotron-nano-12b-v2-vl",
    ],
    endpoint: "chat",
  },

  // Image generation
  image: {
    task: "image",
    description: "Image generation from text prompts",
    chain: [
      "black-forest-labs/flux.1-dev",
      "black-forest-labs/flux.1-schnell",
      "black-forest-labs/flux.2-klein-4b",
      "stabilityai/stable-diffusion-3-medium",
      "google/diffusiongemma-26b-a4b-it",
    ],
    endpoint: "image",
  },

  // Translation
  translate: {
    task: "translate",
    description: "Text translation between languages",
    chain: [
      "nvidia/llama-3.3-nemotron-super-49b-v1",
      "mistralai/mistral-large-3-675b-instruct-2512",
      "mistralai/mistral-nemotron",
      "meta/llama-3.3-70b-instruct",
      "deepseek-ai/deepseek-v4-pro",
    ],
    endpoint: "chat",
  },

  // Content safety
  safety: {
    task: "safety",
    description: "Content safety analysis",
    chain: [
      "nvidia/llama-3.1-nemoguard-8b-content-safety",
      "nvidia/nemotron-3.5-content-safety",
      "nvidia/llama-3.1-nemotron-safety-guard-8b-v3",
      "meta/llama-guard-4-12b",
    ],
    endpoint: "safety",
  },

  // Embeddings
  embedding: {
    task: "embedding",
    description: "Text embedding and vector generation",
    chain: [
      "nvidia/nv-embedqa-e5-v5",
      "nvidia/nv-embedqa-mistral-7b-v2",
      "baai/bge-m3",
      "nvidia/nv-embed-v1",
    ],
    endpoint: "embedding",
  },
};

function getModelInfo(modelId) {
  for (const category of Object.values(MODELS)) {
    if (category.models[modelId]) {
      return { ...category.models[modelId], id: modelId, category: category.category };
    }
  }
  return null;
}

/**
 * Initialize benchmark data by fetching from the proxy.
 * Called once at server startup.
 * Builds rank-driven chains and stores them in BENCHMARK_OVERRIDES.
 * Only includes models that are in our MODELS registry (verified to exist).
 */
const BENCHMARK_OVERRIDES = {};

async function initBenchmarks() {
  try {
    console.log("  🔄 initBenchmarks: Starting benchmark initialization...");
    await fetchRanked();
    console.log("  🔄 initBenchmarks: fetchRanked completed");

    // Build rank-ordered chains for each task type
    const tasks = ["fast", "chat", "code", "reasoning", "websearch"];
    const registry = new Set(Object.keys(getAllModels()));
    console.log(`  🔄 initBenchmarks: Registry has ${registry.size} models`);

    for (const task of tasks) {
      const chain = buildChain(task, { limit: 8 });
      // Only keep models that are in our registry
      const validChain = chain.filter((id) => registry.has(id));
      if (validChain.length >= 3) {
        BENCHMARK_OVERRIDES[task] = validChain;
        console.log(
          `  🏆 ${task}: ${validChain
            .slice(0, 3)
            .map((m) => m.split("/").pop())
            .join(" → ")}...`,
        );
      } else {
        console.warn(`  ⚠️ ${task}: Not enough valid models in chain (${validChain.length})`);
      }
    }
    console.log("  ✅ Rank-driven chains loaded from benchmark data");
  } catch (e) {
    console.warn(`  ⚠️ Benchmark init failed (using hardcoded chains): ${e.message}`);
    console.error(e.stack);
  }
}

function getTaskRoute(task) {
  // Use rank-driven chain from benchmark if available
  const benchmarkChain = BENCHMARK_OVERRIDES[task];
  if (benchmarkChain && benchmarkChain.length > 0) {
    const base = TASK_ROUTES[task] || TASK_ROUTES.chat;
    return { ...base, chain: benchmarkChain };
  }
  // Fallback to hardcoded chain
  return TASK_ROUTES[task] || TASK_ROUTES.chat;
}

function getAllModels() {
  // ── Priority 1: Use in-memory benchmark cache (populated after fetchRanked) ──
  const cached = getRankedData();
  if (cached && cached.data && cached.data.length > 0) {
    return buildModelsFromRanked(cached);
  }

  // ── Priority 2: Load from the cleaned JSON file ──
  const rankedPath = process.env.RANKED_CLEAN_PATH || path.join(__dirname, "..", "ranked_models_clean.json");
  let rankedData;
  try {
    rankedData = JSON.parse(fs.readFileSync(rankedPath, "utf-8"));
    return buildModelsFromRanked(rankedData);
  } catch (e) {
    console.warn("⚠️ Could not load ranked_models_clean.json");
  }

  // ── Priority 3: Fallback to the original hardcoded MODELS object ──
  console.warn("⚠️ Falling back to hardcoded models");
  const all = {};
  for (const category of Object.values(MODELS)) {
    Object.assign(all, category.models);
  }
  return all;
}

/**
 * Build models from ranked data (extracted for reuse from cache or file).
 */
function buildModelsFromRanked(data) {
  const all = {};
  for (const item of data.data) {
    // Map capabilities object (boolean flags) to array of capability names
    const caps = item.capabilities ? Object.keys(item.capabilities).filter(k => item.capabilities[k]) : [];

    // Determine group from capabilities or benchmark info
    let group = "Other";
    if (caps.includes("vision")) {group = "Vision";}
    else if (caps.includes("image")) {group = "Image Gen";}
    else if (caps.includes("embedding")) {group = "Embeddings";}
    else if (caps.includes("safety")) {group = "Safety";}
    else if (item.benchmark?.rank && item.benchmark.rank <= 5) {group = "Smart";}
    else if (item.benchmark?.speedRank === "fast" || item.benchmark?.speedRank === "very_fast") {group = "Fast";}
    else if (caps.includes("code") || caps.includes("toolCalling")) {group = "Code";}
    else if (caps.includes("finance")) {group = "Finance";}
    else if (caps.includes("medical")) {group = "Medical";}
    else if (caps.includes("chat")) {group = "Chat";}

    // Map the fields to the shape the frontend expects
    const displayName = item.name || generateDisplayName(item.id, item.owned_by);

    all[item.id] = {
      name: displayName,
      capabilities: caps,
      speed: item.benchmark?.speedRank || "medium",
      quality: item.benchmark?.rank ? 11 - item.benchmark.rank : 0,
      group: group,
      vision: item.capabilities?.vision || false,
      audio: item.capabilities?.audio || false,
      image: item.capabilities?.image || false,
      embedding: item.capabilities?.embedding || false,
      toolCalling: item.capabilities?.toolCalling || false,
      benchmark: item.benchmark,
      owned_by: item.owned_by,
      type: item.type,
    };
  }
  return all;
}

/**
 * Generate a friendly display name from model ID and owner
 */
function generateDisplayName(id, owner) {
  // Extract the model name part (after the last /)
  const modelPart = id.split("/").pop() || id;

  // Clean up common patterns
  let name = modelPart
    .replace(/-/g, " ")
    .replace(/_/g, " ")
    .replace(/\b(v\d+|v\d+\.\d+)\b/gi, "") // Remove version suffixes like v1, v2.5
    .replace(/\b(instruct|it|chat)\b/gi, "") // Remove instruct/chat suffixes
    .replace(/\b(a\d+b|a\d+)\b/gi, "") // Remove MoE suffixes like a12b
    .replace(/\s+/g, " ")
    .trim();

  // Capitalize words
  name = name.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

  // Add owner prefix for well-known providers
  const ownerMap = {
    "nvidia": "NVIDIA",
    "meta": "Meta",
    "mistralai": "Mistral",
    "google": "Google",
    "openai": "OpenAI",
    "upstage": "Upstage",
    "qwen": "Qwen",
    "ibm": "IBM",
    "writer": "Writer",
    "deepseek": "DeepSeek",
    "phi": "Microsoft",
    "microsoft": "Microsoft",
    "allenai": "AllenAI",
    "nousresearch": "Nous",
    "01-ai": "01.AI",
    "zai": "Z.ai",
    "stepfun": "StepFun",
    "baichuan": "Baichuan",
    "internlm": "InternLM",
    "minimax": "MiniMax",
    "moonshot": "Moonshot",
    "baai": "BAAI",
    "thudm": "THUDM",
  };

  const ownerKey = (owner || "").toLowerCase();
  const prefix = ownerMap[ownerKey] || (owner ? owner.charAt(0).toUpperCase() + owner.slice(1) : "");

  if (prefix && !name.toLowerCase().startsWith(prefix.toLowerCase())) {
    return `${prefix} ${name}`;
  }
  return name;
}

module.exports = {
  MODELS,
  TASK_ROUTES,
  getModelInfo,
  getTaskRoute,
  getAllModels,
  getModelsByCapability,
  initBenchmarks,
  getModelBenchmark,
};
