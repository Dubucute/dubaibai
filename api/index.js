// ===== Dubu AI — Vercel Serverless Entry Point =====
// This file is the entry point for Vercel deployments.
// It exports a serverless function that handles requests without blocking on init.

// Suppress deprecation warnings from upstream dependencies (e.g., url.parse())
process.noDeprecation = true;

const app = require("../server/index");
const db = require("../server/db");
const { initBenchmarks } = require("../server/models");

let benchmarksReady = false;
let initStarted = false;

module.exports = async (req, res) => {
  // ── Fire-and-forget init (don't block the first request) ──
  // DB init + benchmark fetch run in background. The first request gets
  // served with cached/hardcoded data immediately; subsequent requests
  // benefit from the fully initialized state.
  if (!initStarted) {
    initStarted = true;

    // DB init (background — store falls back to in-memory if not ready)
    if (!db.DB_READY) {
      db.initDatabase().catch(() => {
        console.warn("⚠️  DB init failed (background), using in-memory fallback");
      });
    }

    // Benchmark init (background — getAllModels uses cache/file/hardcoded)
    initBenchmarks()
      .then(() => {
        benchmarksReady = true;
        console.log("  ✅ Benchmarks initialized (background)");
      })
      .catch((e) => {
        console.warn(`  ⚠️ Benchmark init failed (background): ${e.message}`);
      });
  }

  // Serve the request immediately — models and store work without benchmarks/DB
  app(req, res);
};
