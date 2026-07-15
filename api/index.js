// ===== Dubu AI — Vercel Serverless Entry Point =====
// This file is the entry point for Vercel deployments.
// It exports a serverless function that waits for DB init before handling requests.

// Suppress deprecation warnings from upstream dependencies (e.g., url.parse())
process.noDeprecation = true;

const app = require("../server/index");
const db = require("../server/db");
const { initBenchmarks } = require("../server/models");

let benchmarksReady = false;

module.exports = async (req, res) => {
  // On Vercel cold starts, db.initDatabase() from server/index.js starts at module load
  // but might not have completed before the first request arrives.
  // Wait for it — if it fails, in-memory fallback will be used by store methods.
  if (!db.DB_READY) {
    try {
      await db.initDatabase();
    } catch {
      // DB not available — isDbReady() returns false, store falls back to in-memory
      console.warn("⚠️  DB init failed in Vercel entry, falling back to in-memory");
    }
  }
  // Ensure benchmark-driven model chains are loaded (uses local file if proxy is down)
  if (!benchmarksReady) {
    try {
      await initBenchmarks();
      benchmarksReady = true;
    } catch {
      // Benchmarks not available — hardcoded chains will be used
    }
  }
  app(req, res);
};
