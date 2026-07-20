// ===== PostgreSQL Database Module =====
// Connection pool for Supabase PostgreSQL with auto schema initialization.

const { Pool } = require("pg");

// Load dotenv in case it wasn't loaded already
try {
  const path = require("path");
  require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
} catch (e) {
  /* dotenv not installed, skip */
}

// ── Connection URL selection with diagnostics ──
// Order: POSTGRES_URL (pooled, prefer serverless) → NON_POOLING (direct) → DATABASE_URL (manual)
const CANDIDATE_KEYS = [
  { key: "POSTGRES_URL", desc: "pooled (port 6543)" },
  { key: "POSTGRES_URL_NON_POOLING", desc: "direct (port 5432)" },
  { key: "DATABASE_URL", desc: "manual" },
];

for (const c of CANDIDATE_KEYS) {
  const raw = process.env[c.key];
  if (raw) {
    const hostMatch = raw.match(/@([^:/]+)/);
    const portMatch = raw.match(/:([0-9]+)\//);
    const host = hostMatch ? hostMatch[1] : "?";
    const port = portMatch ? portMatch[1] : "?";
    console.log(`  🔍 Checking ${c.key} (${c.desc}): ${host}:${port}`);
  }
}

// Collect all candidate URLs (trimmed, non-empty, deduplicated)
const CANDIDATE_URLS = [];
const seen = new Set();
for (const c of CANDIDATE_KEYS) {
  const raw = (process.env[c.key] || "").trim();
  if (raw && !seen.has(raw)) {
    seen.add(raw);
    CANDIDATE_URLS.push(raw);
  }
}

let DB_ENABLED = CANDIDATE_URLS.length > 0;
let pool = null;
let DB_READY = false;
let _initPromise = null;

/**
 * Prepare a connection URL: strip sslmode, ensure ?pgbouncer=true on pooler.
 */
function prepareUrl(url) {
  if (!url) return "";
  let result = url;
  // Strip sslmode — it can override our ssl config below
  try {
    const parsed = new URL(result);
    parsed.searchParams.delete("sslmode");
    result = parsed.toString();
  } catch {
    // skip
  }
  // Auto-fix pooler URLs: ensure ?pgbouncer=true is present
  if (result.includes(":6543/") && !result.includes("pgbouncer=true")) {
    result += (result.includes("?") ? "&" : "?") + "pgbouncer=true";
    console.log("  🔧 Auto-added ?pgbouncer=true to pooler connection");
  }
  return result;
}

/**
 * Log a connection URL safely (password redacted).
 */
function redactUrl(url) {
  return url.replace(/:[^@]+@/, ":***@");
}

const sslConfig = { rejectUnauthorized: false };

/**
 * Initialize the database pool and create tables if they don't exist.
 * Sets DB_READY to true on success.
 * Safe to call multiple times — returns the same promise if already running.
 */
async function initDatabase() {
  if (!DB_ENABLED) {
    console.log("  📄 No DATABASE_URL set — using in-memory store");
    return;
  }
  // Guard: return existing promise if already initializing
  if (_initPromise) {return _initPromise;}

  _initPromise = (async () => {
    // Try each candidate URL in order until one works
    for (let urlIdx = 0; urlIdx < CANDIDATE_URLS.length; urlIdx++) {
      const rawUrl = CANDIDATE_URLS[urlIdx];
      const connUrl = prepareUrl(rawUrl);
      const label = CANDIDATE_KEYS[urlIdx]?.key || `candidate ${urlIdx + 1}`;

      console.log(`  🔌 Trying ${label} ... ${redactUrl(connUrl)}`);

      const tempPool = new Pool({
        connectionString: connUrl,
        max: 3,
        idleTimeoutMillis: 5000,
        connectionTimeoutMillis: 8000,
        allowExitOnIdle: true,
        ssl: sslConfig,
      });

      let connected = false;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const client = await tempPool.connect();
          await client.query("SELECT 1");
          client.release();
          connected = true;
          break;
        } catch (e) {
          const errCode = e.code || "";
          console.warn(`  ⚠️  ${label} attempt ${attempt}/2 failed [${errCode}]: ${e.message}`);
          if (attempt < 2) {await new Promise((r) => setTimeout(r, 1000));}
        }
      }

      if (connected) {
        // Success! Promote this pool and set up error handler
        pool = tempPool;
        pool.on("error", (err) => {
          console.warn("  ⚠️  Pool error:", err.message);
        });

        try {
          await createTables();
          DB_READY = true;
          console.log(`  🗄️  PostgreSQL connected via ${label} — tables ready`);
          return;
        } catch (e) {
          console.warn(`  ⚠️  Table creation failed on ${label}:`, e.message);
          await tempPool.end().catch(() => {});
          pool = null;
        }
      } else {
        await tempPool.end().catch(() => {});
      }
    }

    // All URLs failed
    console.warn("  ⚠️  All connection candidates failed");
    console.log("  📄 Falling back to in-memory store");
    pool = null;
    DB_READY = false;
    _initPromise = null; // Allow retry on next request
  })();

  return _initPromise;
}

/**
 * Create the schema tables if they don't exist.
 */
async function createTables() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── Conversations table ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id UUID PRIMARY KEY,
        user_id UUID,
        title TEXT NOT NULL DEFAULT 'New Chat',
        model TEXT,
        messages JSONB NOT NULL DEFAULT '[]',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Index for listing conversations by user
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_conversations_user_id
      ON conversations (user_id, updated_at DESC)
    `);

    // Index for looking up a single conversation
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_conversations_id
      ON conversations (id)
    `);

    // ── Documents table ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id UUID PRIMARY KEY,
        user_id UUID,
        name TEXT NOT NULL,
        content TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'text',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_documents_user_id
      ON documents (user_id)
    `);

    // ── User profiles / settings table ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_settings (
        user_id UUID PRIMARY KEY,
        username TEXT,
        display_name TEXT,
        avatar_url TEXT,
        bio TEXT,
        theme TEXT NOT NULL DEFAULT 'dark',
        temperature REAL NOT NULL DEFAULT 0.7,
        settings JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ── Ranked models table (benchmark data from proxy) ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS ranked_models (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        model_id TEXT NOT NULL UNIQUE,
        name TEXT,
        owned_by TEXT,
        type TEXT,
        capabilities JSONB NOT NULL DEFAULT '{}',
        benchmark JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ranked_models_benchmark_rank
      ON ranked_models ((benchmark->>'rank'))
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ranked_models_benchmark_speed
      ON ranked_models ((benchmark->>'speedRank'))
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_user_settings_username
      ON user_settings (username) WHERE username IS NOT NULL
    `);

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Execute a parameterized query.
 * Returns the rows array.
 */
async function query(text, params = []) {
  if (!pool) {throw new Error("Database not available");}
  try {
    const result = await pool.query(text, params);
    return result.rows;
  } catch (e) {
    // If connection was lost, try to re-init once
    if (e.code === "ECONNRESET" || e.code === "57P01" || e.code === "57P03" || e.message.includes("connection terminated")) {
      console.warn("  ⚠️  Connection lost, attempting reconnect...");
      DB_READY = false;
      _initPromise = null;
      pool = null;
      await initDatabase();
      if (!pool) {throw new Error("Database reconnection failed");}
      const result = await pool.query(text, params);
      return result.rows;
    }
    throw e;
  }
}

/**
 * Get a single row or null.
 */
async function queryOne(text, params = []) {
  const rows = await query(text, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Save ranked models to the database (upsert).
 * @param {Array} models - Array of model objects from the proxy
 */
async function saveRankedModels(models) {
  if (!pool) {throw new Error("Database not available");}
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const model of models) {
      await client.query(
        `INSERT INTO ranked_models (model_id, name, owned_by, type, capabilities, benchmark, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (model_id) DO UPDATE SET
           name = EXCLUDED.name,
           owned_by = EXCLUDED.owned_by,
           type = EXCLUDED.type,
           capabilities = EXCLUDED.capabilities,
           benchmark = EXCLUDED.benchmark,
           updated_at = NOW()`,
        [
          model.id,
          model.name || null,
          model.owned_by || null,
          model.type || null,
          JSON.stringify(model.capabilities || {}),
          JSON.stringify(model.benchmark || null),
        ],
      );
    }
    await client.query("COMMIT");
    console.log(`  💾 Saved ${models.length} ranked models to database`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Load ranked models from the database (async version).
 * @returns {Object} { data: [...], benchmarkedCount, total }
 */
async function loadRankedModels() {
  if (!pool) {throw new Error("Database not available");}
  const rows = await pool.query(
    `SELECT model_id, name, owned_by, type, capabilities, benchmark
     FROM ranked_models
     ORDER BY 
       CASE WHEN benchmark->>'rank' IS NOT NULL THEN (benchmark->>'rank')::int ELSE 999 END ASC,
       model_id ASC`,
  );
  const data = rows.rows.map((r) => ({
    id: r.model_id,
    name: r.name,
    owned_by: r.owned_by,
    type: r.type,
    capabilities: r.capabilities || {},
    benchmark: r.benchmark,
  }));
  return {
    data,
    benchmarkedCount: data.filter((m) => m.benchmark).length,
    total: data.length,
  };
}

/**
 * Gracefully close the pool (for shutdown).
 */
async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  pool,
  initDatabase,
  query,
  queryOne,
  closePool,
  DB_ENABLED,
  get DB_READY() { return DB_READY; },
  saveRankedModels,
  loadRankedModels,
};
