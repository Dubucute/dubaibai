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

const DATABASE_URL = process.env.DATABASE_URL;
const DB_ENABLED = !!DATABASE_URL;

let pool = null;
let DB_READY = false;

/**
 * Initialize the database pool and create tables if they don't exist.
 * Sets DB_READY to true on success.
 */
async function initDatabase() {
  if (!DB_ENABLED) {
    console.log("  📄 No DATABASE_URL set — using in-memory store");
    return;
  }

  try {
    pool = new Pool({
      connectionString: DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    // Test the connection
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();

    // Create tables
    await createTables();
    DB_READY = true;
    console.log("  🗄️  PostgreSQL connected — tables ready");
  } catch (e) {
    console.warn("  ⚠️  PostgreSQL connection failed:", e.message);
    console.log("  📄 Falling back to in-memory store");
    pool = null;
  }
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

    // ── User settings table ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_settings (
        user_id UUID PRIMARY KEY,
        theme TEXT NOT NULL DEFAULT 'dark',
        temperature REAL NOT NULL DEFAULT 0.7,
        settings JSONB NOT NULL DEFAULT '{}',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
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
  if (!pool) throw new Error("Database not available");
  const result = await pool.query(text, params);
  return result.rows;
}

/**
 * Get a single row or null.
 */
async function queryOne(text, params = []) {
  const rows = await query(text, params);
  return rows.length > 0 ? rows[0] : null;
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
};
