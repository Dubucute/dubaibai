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

// Try DATABASE_URL first, then fall back to Supabase's auto-injected env vars
// POSTGRES_URL (pooled, port 6543) is preferred over NON_POOLING for serverless
const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING || "";
const DB_ENABLED = !!DATABASE_URL;

let pool = null;
let DB_READY = false;
let _initPromise = null;

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
    try {
      const sslConfig = { rejectUnauthorized: false };

      pool = new Pool({
        connectionString: DATABASE_URL,
        max: 5,
        idleTimeoutMillis: 10000,
        connectionTimeoutMillis: 5000,
        allowExitOnIdle: true,
        ssl: sslConfig,
      });

      // Handle pool-level errors (idle connection drops, etc.)
      pool.on("error", (err) => {
        console.warn("  ⚠️  Pool error:", err.message);
        // Don't set pool=null here — pg will auto-replace broken connections
      });

      // Test the connection (with retry) — fast fail on serverless cold starts
      let connected = false;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const client = await pool.connect();
          await client.query("SELECT 1");
          client.release();
          connected = true;
          break;
        } catch (e) {
          console.warn(`  ⚠️  Connection attempt ${attempt}/2 failed:`, e.message);
          if (attempt < 2) {await new Promise((r) => setTimeout(r, 500));}
        }
      }
      if (!connected) {throw new Error("Failed to connect after 3 attempts");}

      // Create tables
      await createTables();
      DB_READY = true;
      console.log("  🗄️  PostgreSQL connected — tables ready");
    } catch (e) {
      console.warn("  ⚠️  PostgreSQL connection failed:", e.message);
      console.log("  📄 Falling back to in-memory store");
      pool = null;
      DB_READY = false;
      _initPromise = null; // Allow retry on next request
    }
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
