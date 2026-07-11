// ===== Dubu AI — Vercel Serverless Entry Point =====
// This file is the entry point for Vercel deployments.
// It exports the Express app so Vercel can handle requests as serverless functions.

const app = require("../server/index");
module.exports = app;
