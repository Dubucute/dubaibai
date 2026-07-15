// ===== NVIDIA NIM Benchmark Data =====
// Fetches real benchmark scores from the Dubu proxy at dubu.alwaysdata.net
// and uses them to rank models for each task type.
// Falls back to local ranked_models_clean.json if the proxy is unavailable.

const https = require("https");
const fs = require("fs");
const path = require("path");
const os = require("os"); // For a writable temp directory on read-only filesystems

const PROXY_URL = process.env.BENCHMARK_PROXY_URL || "https://dubu.alwaysdata.net";
const FETCH_INTERVAL = 60 * 60 * 1000; // 1 hour

// Use a stable temp path for the canonical ranked models file (writable on Vercel)
const STABLE_TEMP_PATH = path.join(os.tmpdir(), "ranked_models_clean.json");
process.env.RANKED_CLEAN_PATH = STABLE_TEMP_PATH;

let _cache = null;
let _lastFetch = 0;

/**
 * Load ranked models from the local JSON file (fallback).
 * Uses the stable temp path (writable on Vercel) if available.
 */
function loadLocalRanked() {
  try {
    const raw = fs.readFileSync(STABLE_TEMP_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    console.log(`  📊 Loaded ${parsed.benchmarkedCount || parsed.data?.length || 0} ranked models from local file`);
    return parsed;
  } catch (e) {
    console.warn(`  ⚠️ Could not load local ranked models: ${e.message}`);
    return null;
  }
}

/**
 * Fetch ranked models from the proxy endpoint.
 * Falls back to local file if proxy is unavailable.
 * Returns { data: [...], benchmarkedCount, total }
 */
function fetchRanked(forceRefresh = false) {
  return new Promise((resolve, reject) => {
    if (!forceRefresh && _cache && Date.now() - _lastFetch < FETCH_INTERVAL) {
      console.log(`  📦 Using cached benchmark data (${_cache.data?.length || 0} models)`);
      return resolve(_cache);
    }

    // Try proxy first, fall back to local file
    const url = `${PROXY_URL}/v1/models/ranked?limit=50`;
    console.log(`  🔄 Fetching ranked models from ${url}`);
    https.get(url, { headers: { "Accept": "application/json" } }, (res) => {
      let body = "";
      res.on("data", (d) => (body += d));
      res.on("end", () => {
        try {
          // Parse the response
          const parsed = JSON.parse(body);
          
          // Save fresh data to cache
          _cache = {
            data: parsed.data,
            benchmarkedCount: parsed.benchmarkedCount,
            total: parsed.total,
          };
          _lastFetch = Date.now();

          // Write the raw response to the cleaned JSON file for getAllModels
          const outPath = path.join(__dirname, "..", "ranked_models_clean.json");
          fs.writeFileSync(STABLE_TEMP_PATH, JSON.stringify(_cache, null, 2), "utf-8");
          console.log(`  📊 Updated ${outPath} with ${parsed.benchmarkedCount || parsed.data?.length || 0} models`);
          return resolve(_cache);
        } catch (e) {
          console.warn(`  ⚠️ Could not parse proxy response: ${e.message}`);
        }
      });
    }).on("error", (e) => {
      console.warn(`  ⚠️ Proxy request failed (${e.message}), falling back to local file`);
      // Fall back to local file (if it exists)
      return resolve(loadLocalRanked());
    });
  });
}

/**
 * Get a model's benchmark info by ID.
 */
function getModelBenchmark(modelId) {
  if (!_cache?.data) return null;
  const found = _cache.data.find((m) => m.id === modelId);
  return found?.benchmark || null;
}

/**
 * Get top models by tag or score, useful for building dynamic chains.
 * @param {Object} opts
 * @param {string} opts.tag - Filter by tag: "fast", "smart", "coding_expert", "top_tier", "best_overall", "vision"
 * @param {number} opts.minScore - Minimum combined score
 * @param {number} opts.limit - Max models to return
 * @param {boolean} opts.visionOnly - Only models with vision capability
 * @param {string} opts.exclude - Comma-separated model IDs to exclude
 */
function getRankedModels(opts = {}) {
  if (!_cache?.data) return [];

  let models = _cache.data.filter((m) => m.benchmark); // only benchmarked

  if (opts.tag) {
    models = models.filter((m) => m.benchmark.tags?.includes(opts.tag));
  }
  if (opts.minScore) {
    models = models.filter((m) => m.benchmark.combinedScore >= opts.minScore);
  }
  if (opts.visionOnly) {
    models = models.filter((m) => m.capabilities?.vision === true);
  }
  if (opts.exclude) {
    const excludeSet = new Set(opts.exclude.split(",").map((s) => s.trim()));
    models = models.filter((m) => !excludeSet.has(m.id));
  }

  // Already sorted by rank from the API
  if (opts.limit) models = models.slice(0, opts.limit);
  return models;
}

/**
 * Build an optimized model chain for a specific task type.
 * Returns an array of model IDs sorted by benchmark RANK.
 * All tasks use rank as the primary sort (the ranked endpoint
 * already combines quality + speed into the ranking formula).
 */
function buildChain(taskType, opts = {}) {
  if (!_cache?.data) return [];

  let models = _cache.data.filter((m) => m.benchmark);

  // ── Task-specific model selection strategies ──
  switch (taskType) {
    case "fast": {
      // Fast: prioritize speed — sort by speed, prefer fast/very_fast/medium
      models = models
        .filter((m) => m.benchmark.speedRank !== "very_slow") // exclude very_slow
        .filter((m) => !/[-_]1b[-_]|[-_]2b[-_]/i.test(m.id)) // exclude 1-2B
        .filter((m) => m.capabilities?.chat === true)
        .sort((a, b) => {
          // Speed-first: faster models win
          const speedDiff = (a.benchmark.speed || 99) - (b.benchmark.speed || 99);
          if (speedDiff !== 0) return speedDiff;
          return (a.benchmark.rank || 999) - (b.benchmark.rank || 999);
        });
      break;
    }

    case "code": {
      // Code: chat-capable models, rank-ordered
      models = models
        .filter((m) => !/[-_]1b[-_]|[-_]2b[-_]|[-_]3b[-_]/i.test(m.id)) // exclude <8B
        .filter((m) => m.capabilities?.chat === true)
        .sort((a, b) => (a.benchmark.rank || 999) - (b.benchmark.rank || 999));
      break;
    }

    case "reasoning":
    case "websearch": {
      // Reasoning/websearch: rank-order with size boost for tie-breaking
      const sizeBoost = (id) => {
        if (/550b|397b|675b/i.test(id)) return 3000;
        if (/120b|119b|100b|90b|70b/i.test(id)) return 2000;
        if (/49b|30b|32b/i.test(id)) return 1000;
        return 0;
      };
      models = models
        .filter((m) => !/[-_]1b[-_]|[-_]2b[-_]|[-_]3b[-_]|[-_]4b[-_]/i.test(m.id))
        .filter((m) => m.capabilities?.chat === true)
        .sort((a, b) => {
          const rankDiff = (a.benchmark.rank || 999) - (b.benchmark.rank || 999);
          if (rankDiff !== 0) return rankDiff; // rank first
          return (sizeBoost(b.id) || 0) - (sizeBoost(a.id) || 0); // bigger model wins ties
        });
      break;
    }

    default: {
      // Chat / general: rank-ordered, exclude tiny models (<8B) and vision-only
      models = models
        .filter((m) => !/[-_]1b[-_]|[-_]2b[-_]|[-_]3b[-_]|[-_]4b[-_]/i.test(m.id))
        .filter((m) => m.capabilities?.chat === true)
        .sort((a, b) => (a.benchmark.rank || 999) - (b.benchmark.rank || 999));
      break;
    }
  }

  const limit = opts.limit || 8;
  return models.slice(0, limit).map((m) => m.id);
}

/**
 * Get benchmark summary stats.
 */
function getSummary() {
  if (!_cache) return null;
  return {
    total: _cache.total,
    benchmarked: _cache.benchmarkedCount,
    lastUpdated: _cache.data?.[0]?.created
      ? new Date(_cache.data[0].created * 1000).toISOString()
      : null,
  };
}

module.exports = {
  fetchRanked,
  getModelBenchmark,
  getRankedModels,
  buildChain,
  getSummary,
};
