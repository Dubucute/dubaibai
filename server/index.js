// ===== Dubu AI v2 Server — Unified Agent =====
// Express server with:
// - Static file serving (SPA frontend)
// - Unified agent API with auto model selection & fallback
// - Document upload & management
// - Conversation management
// - Direct tool execution

// Suppress deprecation warnings from upstream dependencies (e.g., url.parse())
process.noDeprecation = true;

const express = require("express");
const path = require("path");
const multer = require("multer");
const CONFIG = require("./config");
const store = require("./store");
const db = require("./db");
const Orchestrator = require("./orchestrator");
const NIMClient = require("./nim");
const { getTaskRoute, getModelInfo, getAllModels, initBenchmarks } = require("./models");
const { detectIntent } = require("./router");
const { listTools, getTool } = require("./tools/index");
const { signIn, getSessionUser, authMiddleware, AUTH_ENABLED } = require("./auth");

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
require("./tools/fetch");

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: CONFIG.maxFileSize },
});

// ── Middleware ──
app.use(express.json({ limit: "50mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

// ── API: Benchmark Data (public, no auth required) ──
// GET /api/benchmark — Serve ranked_models_clean.json for the benchmark page
app.get("/api/benchmark", (req, res) => {
  try {
    const fs = require("fs");
    const path = require("path");
    const filePath = path.join(__dirname, "..", "ranked_models_clean.json");
    const raw = fs.readFileSync(filePath, "utf-8");
    res.setHeader("Content-Type", "application/json");
    res.send(raw);
  } catch (e) {
    res.status(500).json({ error: "Failed to load benchmark data" });
  }
});

// Apply auth middleware to all API routes (attaches req.user if authenticated)
app.use("/api", authMiddleware);

// ── API: Auth (Supabase) ──

// POST /api/auth/login — Sign in
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }
  const result = await signIn(email, password);
  if (result.error) {return res.status(401).json({ error: result.error });}
  res.json(result);
});

// POST /api/auth/logout — Sign out (no-op on server, frontend just clears token)
app.post("/api/auth/logout", (req, res) => {
  res.json({ success: true });
});

// GET /api/auth/session — Check session from authorization header
app.get("/api/auth/session", async (req, res) => {
  const authHeader = req.headers.authorization;
  const token =
    req.headers["x-session-token"] ||
    (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null);

  if (!token) {
    return res.json({ authenticated: false });
  }

  const user = await getSessionUser(token);
  if (!user) {
    return res.json({ authenticated: false });
  }

  res.json({
    authenticated: true,
    user,
  });
});

// GET /api/auth/profile — Get user profile (requires auth)
app.get("/api/auth/profile", async (req, res) => {
  const userId = uid(req);
  if (!userId) {return res.status(401).json({ error: "Not authenticated" });}
  try {
    const profile = await store.getProfile(userId);
    res.json({ profile });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/auth/profile — Update user profile (requires auth)
app.post("/api/auth/profile", async (req, res) => {
  const userId = uid(req);
  if (!userId) {return res.status(401).json({ error: "Not authenticated" });}
  try {
    const profile = await store.updateProfile(userId, req.body);
    res.json({ profile });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/auth/status — Check if auth is configured
app.get("/api/auth/status", (req, res) => {
  res.json({
    enabled: AUTH_ENABLED,
    supabaseUrl: AUTH_ENABLED ? process.env.SUPABASE_URL : null,
    supabasePublishableKey: AUTH_ENABLED ? process.env.SUPABASE_PUBLISHABLE_KEY : null,
  });
});

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
  if (!message) {return res.status(400).json({ error: "Message required" });}
  const intent = detectIntent(message, context || {});
  res.json(intent);
});

// ── API: AI Content Detection ──
const { detectAIContent } = require("./detect");
app.post("/api/detect-ai", async (req, res) => {
  const { text } = req.body;
  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "Text is required" });
  }
  try {
    const result = await detectAIContent(text, req.headers["x-api-key"] || CONFIG.apiKey);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── API: List tools ──
app.get("/api/tools", (req, res) => {
  res.json({ tools: listTools() });
});

// ── API: Execute a single tool directly ──
app.post("/api/tools/:name/execute", async (req, res) => {
  const { name } = req.params;
  const tool = getTool(name);
  if (!tool) {return res.status(404).json({ error: `Unknown tool: ${name}` });}

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
  if (!message) {return res.status(400).json({ error: "Message is required." });}

  const orchestrator = new Orchestrator({
    apiKey: req.headers["x-api-key"] || CONFIG.apiKey,
  });

  if (stream) {
    // SSE streaming for the agent
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    try {
      for await (const update of orchestrator.process(message, history, context, model)) {
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
      for await (const update of orchestrator.process(message, history, context, model)) {
        if (update.type === "result") {finalResult = update;}
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

// ── Helper: Get userId from authenticated request (or null for guests) ──
function uid(req) {
  return req.user?.id || null;
}

// ── API: Conversations ──
app.get("/api/conversations", async (req, res) => {
  try {
    const conversations = await store.listConversations(uid(req));
    res.json({ conversations });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/conversations", async (req, res) => {
  try {
    const { title, model } = req.body;
    const userId = uid(req);
    const convo = await store.createConversation(title, model, userId);
    console.log(`✅ Created conversation ${convo.id} for userId=${userId}, dbReady=${db.DB_READY}`);
    res.json({ conversation: convo });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/conversations/:id", async (req, res) => {
  try {
    const convo = await store.getConversation(req.params.id, uid(req));
    if (!convo) {return res.status(404).json({ error: "Not found" });}
    res.json({ conversation: convo });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/conversations/:id/messages", async (req, res) => {
  try {
    const userId = uid(req);
    const convo = await store.getConversation(req.params.id, userId);
    if (!convo) {
      console.warn(`⚠️  POST /messages/${req.params.id} → 404 (userId=${userId}, dbReady=${db.DB_READY})`);
      return res.status(404).json({ error: "Not found" });
    }
    // Support both { role, content } and { message: { role, content } } formats
    const src = req.body.message || req.body;
    const msg = {
      role: src.role,
      content: src.content,
    };
    if (src.tool_calls) {msg.tool_calls = src.tool_calls;}
    if (src.tool_call_id) {msg.tool_call_id = src.tool_call_id;}

    // Streaming update: if replaceLast=true AND the last message is also assistant,
    // update the last message instead of appending. If the last message is user,
    // fall through to append (we don't want to overwrite the user's message).
    if (src.replaceLast) {
      const msgs = convo.messages || [];
      if (msgs.length > 0 && msgs[msgs.length - 1].role === "assistant") {
        const lastIdx = msgs.length - 1;
        await store.updateMessage(convo.id, lastIdx, { content: src.content }, userId);
        res.json({ success: true });
        return;
      }
    }

    await store.addMessage(convo.id, msg, userId);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/conversations/:id", async (req, res) => {
  try {
    await store.deleteConversation(req.params.id, uid(req));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/conversations/:id/generate-title", async (req, res) => {
  try {
    const convo = await store.getConversation(req.params.id, uid(req));
    if (!convo) {return res.status(404).json({ error: "Not found" });}

    // Find the first user message to generate a title from
    const firstUserMsg = convo.messages.find((m) => m.role === "user");
    if (!firstUserMsg) {return res.status(400).json({ error: "No user messages to generate title from" });}

    try {
      const orchestrator = new Orchestrator({
        apiKey: req.headers["x-api-key"] || CONFIG.apiKey,
      });
      const title = await orchestrator.generateTitle(firstUserMsg.content);

      if (title) {
        await store.updateConversationTitle(convo.id, title, uid(req));
        res.json({ success: true, title });
      } else {
        // Fallback: use first 40 chars of the message
        const fallbackTitle = firstUserMsg.content.slice(0, 40) + (firstUserMsg.content.length > 40 ? "..." : "");
        await store.updateConversationTitle(convo.id, fallbackTitle, uid(req));
        res.json({ success: true, title: fallbackTitle });
      }
    } catch (e) {
      // Silent fallback
      const fallbackTitle = firstUserMsg.content.slice(0, 40) + (firstUserMsg.content.length > 40 ? "..." : "");
      await store.updateConversationTitle(convo.id, fallbackTitle, uid(req));
      res.json({ success: true, title: fallbackTitle, note: "Used fallback" });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/conversations/:id/fork", async (req, res) => {
  try {
    const fork = await store.forkConversation(req.params.id, uid(req));
    if (!fork) {return res.status(404).json({ error: "Not found" });}
    res.json({ conversation: fork });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── API: Documents ──
app.get("/api/documents", async (req, res) => {
  try {
    const documents = await store.listDocuments(uid(req));
    res.json({ documents });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/documents/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {return res.status(400).json({ error: "No file uploaded." });}
    const content = req.file.buffer.toString("utf-8");
    const doc = await store.addDocument(req.file.originalname, content, req.file.mimetype, uid(req));
    res.json({ document: doc });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/documents/text", async (req, res) => {
  try {
    const { name, content } = req.body;
    if (!name || !content) {return res.status(400).json({ error: "Name and content required." });}
    const doc = await store.addDocument(name, content, "text/plain", uid(req));
    res.json({ document: doc });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/documents/:id", async (req, res) => {
  try {
    const doc = await store.getDocument(req.params.id, uid(req));
    if (!doc) {return res.status(404).json({ error: "Not found" });}
    res.json({ document: doc });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/documents/:id", async (req, res) => {
  try {
    await store.deleteDocument(req.params.id, uid(req));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/documents/:id/search", async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {return res.status(400).json({ error: "Query required" });}
    const results = await store.searchDocuments(q, uid(req));
    res.json({ results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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
      {return res.status(500).json({ success: false, error: "Filesystem tool not loaded." });}
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
      {return res.status(500).json({ success: false, error: "Filesystem tool not loaded." });}
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
      {return res.status(500).json({ success: false, error: "Filesystem tool not loaded." });}
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
      {return res.status(500).json({ success: false, error: "Filesystem tool not loaded." });}
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

// ── Serve static files ──
// index.html = home page (served at /)
// chat.html = chat interface (served at /chat.html)
// *.html pages served directly by express.static

// ── Root → home page ──
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

// ── SPA fallback → chat page ──
// Express v5 uses path-to-regexp v8+ which requires named wildcards
app.get("/{*path}", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "chat.html"));
});

// ── Initialize database (runs on Vercel AND local) ──
// On Vercel serverless, init starts at module load time.
// The isDbReady() guard in store methods ensures safe fallback to in-memory
// if the DB connection hasn't completed yet.
db.initDatabase().catch(() => {
  /* DB not available — in-memory fallback will be used */
});

// ── Export for Vercel (serverless) ──
module.exports = app;

// ── Start (local development only) ──
// Vercel handles this automatically; we only call listen() when running directly
if (!process.env.VERCEL) {
  // Load benchmark data (only needed locally for model routing)
  initBenchmarks().catch(() => {});

  app.listen(CONFIG.port, () => {
    console.log(`\n  🚀 Dubu AI v2.1.0 — Unified Agent Platform`);
    console.log(`  ⚡ Powered by NVIDIA NIM`);
    console.log(`  🔐 Auth: ${AUTH_ENABLED ? "Supabase (enabled)" : "Disabled"}`);
    console.log(`  🗄️  DB: ${db.DB_READY ? "PostgreSQL" : "In-memory (JSON file)"}`);
    console.log(`  🤖 Auto model selection + fallback enabled`);
    console.log(`  🌐 http://localhost:${CONFIG.port}`);
    console.log(`  📚 API: http://localhost:${CONFIG.port}/api/health\n`);
  });
}
