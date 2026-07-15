// ===== Dubu AI — Vercel Serverless Entry Point =====
// This file is the entry point for Vercel deployments.
// It exports a serverless function that waits for DB init before handling requests.

const app = require("../server/index");
const db = require("../server/db");

module.exports = async (req, res) => {
  // On Vercel cold starts, db.initDatabase() from server/index.js starts at module load
  // but might not have completed before the first request arrives.
  // Wait for it — if it fails, in-memory fallback will be used by store methods.
  if (!db.DB_READY) {
    try {
      await db.initDatabase();
    } catch {
      // DB not available — isDbReady() returns false, store falls back to in-memory
    }
  }
  app(req, res);
};
