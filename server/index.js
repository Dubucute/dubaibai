// ===== Dubu AI v2 Server — Unified Agent =====
// Express server with:
// - Static file serving (SPA frontend)
// - Unified agent API with auto model selection & fallback
// - Document upload & management
// - Conversation management
// - Direct tool execution

const express = require("express");
const path = require("path");
const multer = require("multer");
const CONFIG = require("./config");
const store = require("./store");
const Orchestrator = require("./orchestrator");
const NIMClient = require("./nim");
const { getTaskRoute, getModelInfo, getAllModels } = require("./models");
const { detectIntent } = require("./router");
const { listTools, getTool } = require("./tools/index");

// Load all tools (they self-register)
require("./tools/chat");
require("./tools/image");
require("./tools/vision");
require("./tools/video");
require("./tools/cv");
require("./tools/safety");
require("./tools/translate");
require("./tools/embeddings");
require("./tools/code");
require("./tools/search");
require("./tools/fs");

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: CONFIG.maxFileSize },
});

// ── Middleware ──
app.use(express.json({ limit: "50mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

// ── API: Health ──
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    version: "2.1.0",
    name: "Dubu AI — Unified Agent",
    autoFallback: true,
    autoModelSelect: true,
    modelsAvailable: Object.keys(getAllModels()).length,
  });
});

// ── API: Models (with routing info) ──
app.get("/api/models", async (req, res) => {
  const nim = new NIMClient(req.headers["x-api-key"] || CONFIG.apiKey);
  try {
    const health = await nim.checkHealth();
    res.json({
      auto: true,
      tasks: Object.fromEntries(
        Object.entries(require("./models").TASK_ROUTES).map(([task, route]) => [
          task,
          {
            description: route.description,
            chain: route.chain.map((id) => ({ id, name: getModelInfo(id)?.name || id })),
          },
        ]),
      ),
      all: getAllModels(),
      api: health,
    });
  } catch (e) {
    res.json({
      auto: true,
      tasks: Object.keys(require("./models").TASK_ROUTES),
      all: getAllModels(),
    });
  }
});

// ── API: Generate follow-up suggestions ──
app.post("/api/suggestions", async (req, res) => {
  const { response } = req.body;
  if (!response || response.length < 20) {
    return res.json({ suggestions: null });
  }

  try {
    const orchestrator = new Orchestrator({
      apiKey: req.headers["x-api-key"] || CONFIG.apiKey,
    });
    const suggestions = await orchestrator.generateSuggestions(response);
    res.json({ suggestions: suggestions || null });
  } catch (e) {
    res.json({ suggestions: null, error: e.message });
  }
});

// ── API: Detect intent (for frontend) ──
app.post("/api/detect", (req, res) => {
  const { message, context } = req.body;
  if (!message) return res.status(400).json({ error: "Message required" });
  const intent = detectIntent(message, context || {});
  res.json(intent);
});

// ── API: List tools ──
app.get("/api/tools", (req, res) => {
  res.json({ tools: listTools() });
});

// ── API: Execute a single tool directly ──
app.post("/api/tools/:name/execute", async (req, res) => {
  const { name } = req.params;
  const tool = getTool(name);
  if (!tool) return res.status(404).json({ error: `Unknown tool: ${name}` });

  try {
    const result = await tool.execute(req.body.args || req.body, {
      apiKey: req.headers["x-api-key"] || CONFIG.apiKey,
    });
    res.json({ success: true, result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── API: Unified Agent (the main event) ──
app.post("/api/agent/process", async (req, res) => {
  const { message, history = [], context = {}, model, stream = false } = req.body;
  if (!message) return res.status(400).json({ error: "Message is required." });

  const orchestrator = new Orchestrator({
    apiKey: req.headers["x-api-key"] || CONFIG.apiKey,
  });

  if (stream) {
    // SSE streaming for the agent
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    try {
      for await (const update of orchestrator.process(message, history, context)) {
        res.write(`data: ${JSON.stringify(update)}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    } catch (e) {
      res.write(`data: ${JSON.stringify({ type: "error", content: e.message })}\n\n`);
    }
    res.end();
  } else {
    try {
      let finalResult = null;
      for await (const update of orchestrator.process(message, history, context)) {
        if (update.type === "result") finalResult = update;
      }
      res.json({
        success: !!finalResult,
        result: finalResult?.content || "No response generated.",
        model: finalResult?.model || null,
        modelName: finalResult?.modelName || null,
        image: finalResult?.image || null,
      });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  }
});

// ── API: Direct chat completion proxy (keep for compatibility) ──
app.post("/api/chat/completions", async (req, res) => {
  try {
    const { model, messages, max_tokens, temperature, stream: doStream } = req.body;
    const apiKey = req.headers["x-api-key"] || CONFIG.apiKey;
    const nim = new NIMClient(apiKey);

    const result = await nim.chat(messages, {
      task: "chat",
      max_tokens: max_tokens || CONFIG.maxTokens,
      temperature: temperature ?? CONFIG.temperature,
      stream: doStream || false,
    });

    if (doStream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      result.body.pipe(res);
    } else {
      res.json({
        id: "dubu-chat",
        object: "chat.completion",
        model: result.model,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: result.content },
            finish_reason: "stop",
          },
        ],
        usage: result.usage || { total_tokens: 0 },
        fallback_used: result.fallback_used,
      });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── API: Conversations ──
app.get("/api/conversations", (req, res) => {
  res.json({ conversations: store.listConversations() });
});

app.post("/api/conversations", (req, res) => {
  const { title, model } = req.body;
  const convo = store.createConversation(title, model);
  res.json({ conversation: convo });
});

app.get("/api/conversations/:id", (req, res) => {
  const convo = store.getConversation(req.params.id);
  if (!convo) return res.status(404).json({ error: "Not found" });
  res.json({ conversation: convo });
});

app.post("/api/conversations/:id/messages", async (req, res) => {
  const convo = store.getConversation(req.params.id);
  if (!convo) return res.status(404).json({ error: "Not found" });
  // Support both { role, content } and { message: { role, content } } formats
  const src = req.body.message || req.body;
  const msg = {
    role: src.role,
    content: src.content,
  };
  if (src.tool_calls) msg.tool_calls = src.tool_calls;
  if (src.tool_call_id) msg.tool_call_id = src.tool_call_id;
  store.addMessage(convo.id, msg);
  res.json({ success: true });
});

app.delete("/api/conversations/:id", (req, res) => {
  store.deleteConversation(req.params.id);
  res.json({ success: true });
});

app.post("/api/conversations/:id/generate-title", async (req, res) => {
  const convo = store.getConversation(req.params.id);
  if (!convo) return res.status(404).json({ error: "Not found" });

  // Find the first user message to generate a title from
  const firstUserMsg = convo.messages.find((m) => m.role === "user");
  if (!firstUserMsg) return res.status(400).json({ error: "No user messages to generate title from" });

  try {
    const orchestrator = new Orchestrator({
      apiKey: req.headers["x-api-key"] || CONFIG.apiKey,
    });
    const title = await orchestrator.generateTitle(firstUserMsg.content);

    if (title) {
      store.updateConversationTitle(convo.id, title);
      res.json({ success: true, title });
    } else {
      // Fallback: use first 40 chars of the message
      const fallbackTitle = firstUserMsg.content.slice(0, 40) + (firstUserMsg.content.length > 40 ? "..." : "");
      store.updateConversationTitle(convo.id, fallbackTitle);
      res.json({ success: true, title: fallbackTitle });
    }
  } catch (e) {
    // Silent fallback
    const fallbackTitle = firstUserMsg.content.slice(0, 40) + (firstUserMsg.content.length > 40 ? "..." : "");
    store.updateConversationTitle(convo.id, fallbackTitle);
    res.json({ success: true, title: fallbackTitle, note: "Used fallback" });
  }
});

app.post("/api/conversations/:id/fork", (req, res) => {
  const fork = store.forkConversation(req.params.id);
  if (!fork) return res.status(404).json({ error: "Not found" });
  res.json({ conversation: fork });
});

// ── API: Documents ──
app.get("/api/documents", (req, res) => {
  res.json({ documents: store.listDocuments() });
});

app.post("/api/documents/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded." });
  const content = req.file.buffer.toString("utf-8");
  const doc = store.addDocument(req.file.originalname, content, req.file.mimetype);
  res.json({ document: doc });
});

app.post("/api/documents/text", (req, res) => {
  const { name, content } = req.body;
  if (!name || !content) return res.status(400).json({ error: "Name and content required." });
  const doc = store.addDocument(name, content, "text/plain");
  res.json({ document: doc });
});

app.get("/api/documents/:id", (req, res) => {
  const doc = store.getDocument(req.params.id);
  if (!doc) return res.status(404).json({ error: "Not found" });
  res.json({ document: doc });
});

app.delete("/api/documents/:id", (req, res) => {
  store.deleteDocument(req.params.id);
  res.json({ success: true });
});

app.get("/api/documents/:id/search", (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: "Query required" });
  const results = store.searchDocuments(q);
  res.json({ results });
});

// ── API: Filesystem operations ──
app.post("/api/filesystem/write", (req, res) => {
  const { filepath, content, overwrite } = req.body;
  if (!filepath || content === undefined) {
    return res.status(400).json({ success: false, error: "filepath and content are required." });
  }
  try {
    const tool = getTool("create_file");
    if (!tool)
      return res.status(500).json({ success: false, error: "Filesystem tool not loaded." });
    tool
      .execute({ filepath, content, overwrite })
      .then((result) => {
        res.json(result);
      })
      .catch((e) => {
        res.status(500).json({ success: false, error: e.message });
      });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post("/api/filesystem/create-dir", (req, res) => {
  const { folderpath } = req.body;
  if (!folderpath) {
    return res.status(400).json({ success: false, error: "folderpath is required." });
  }
  try {
    const tool = getTool("create_folder");
    if (!tool)
      return res.status(500).json({ success: false, error: "Filesystem tool not loaded." });
    tool
      .execute({ folderpath })
      .then((result) => {
        res.json(result);
      })
      .catch((e) => {
        res.status(500).json({ success: false, error: e.message });
      });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post("/api/filesystem/read", (req, res) => {
  const { filepath } = req.body;
  if (!filepath) {
    return res.status(400).json({ success: false, error: "filepath is required." });
  }
  try {
    const tool = getTool("read_file");
    if (!tool)
      return res.status(500).json({ success: false, error: "Filesystem tool not loaded." });
    tool
      .execute({ filepath })
      .then((result) => {
        res.json(result);
      })
      .catch((e) => {
        res.status(500).json({ success: false, error: e.message });
      });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post("/api/filesystem/list", (req, res) => {
  const { dirpath = ".", maxDepth = 2 } = req.body;
  try {
    const tool = getTool("list_files");
    if (!tool)
      return res.status(500).json({ success: false, error: "Filesystem tool not loaded." });
    tool
      .execute({ dirpath, maxDepth })
      .then((result) => {
        res.json(result);
      })
      .catch((e) => {
        res.status(500).json({ success: false, error: e.message });
      });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Serve SPA (fallback to index.html) ──
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

// ── Export for Vercel (serverless) ──
module.exports = app;

// ── Start (local development only) ──
// Vercel handles this automatically; we only call listen() when running directly
if (!process.env.VERCEL) {
  app.listen(CONFIG.port, () => {
    console.log(`\n  🚀 Dubu AI v2.1.0 — Unified Agent Platform`);
    console.log(`  ⚡ Powered by NVIDIA NIM`);
    console.log(`  🤖 Auto model selection + fallback enabled`);
    console.log(`  🌐 http://localhost:${CONFIG.port}`);
    console.log(`  📚 API: http://localhost:${CONFIG.port}/api/health\n`);
  });
}
