// ===== NVIDIA NIM Benchmark Data =====
// Fetches real benchmark scores from the Dubu proxy at dubu.alwaysdata.net
// and uses them to rank models for each task type.

const https = require("https");

const PROXY_URL = process.env.BENCHMARK_PROXY_URL || "https://dubu.alwaysdata.net";
const FETCH_INTERVAL = 60 * 60 * 1000; // 1 hour

let _cache = null;
let _lastFetch = 0;

/**
 * Fetch ranked models from the proxy endpoint.
 * Returns { data: [...], benchmarkedCount, total }
 */
function fetchRanked(forceRefresh = false) {
  return new Promise((resolve, reject) => {
    if (!forceRefresh && _cache && Date.now() - _lastFetch < FETCH_INTERVAL) {
      return resolve(_cache);
    }

    const url = `${PROXY_URL}/v1/models/ranked?limit=50`;
    https.get(url, { headers: { "Accept": "application/json" } }, (res) => {
      let body = "";
      res.on("data", (d) => (body += d));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          _cache = parsed;
          _lastFetch = Date.now();
          console.log(`  📊 Benchmark: fetched ${parsed.benchmarkedCount} ranked models (${parsed.total} total)`);
          resolve(parsed);
        } catch (e) {
          reject(new Error(`Failed to parse benchmark data: ${e.message}`));
        }
      });
    }).on("error", (e) => {
      // If cache exists, use stale data
      if (_cache) {
        console.warn(`  ⚠️ Benchmark fetch failed, using cached data: ${e.message}`);
        resolve(_cache);
      } else {
        reject(e);
      }
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
 * Returns an array of model IDs sorted by benchmark score.
 * Uses task-specific strategies: fast tasks prefer small+fast models,
 * complex tasks prefer large+smart models.
 */
function buildChain(taskType, opts = {}) {
  if (!_cache?.data) return [];

  let models = _cache.data.filter((m) => m.benchmark);

  // ── Task-specific model selection strategies ──
  switch (taskType) {
    case "fast": {
      // Fast: small, quick models with good scores — exclude tiny models that can't follow system prompts
      models = models
        .filter((m) => m.benchmark.tags?.includes("fast"))
        .filter((m) => m.benchmark.combinedScore >= 7500)
        .filter((m) => !/[-_]1b[-_]|[-_]2b[-_]/i.test(m.id)) // exclude 1-2B models
        .sort((a, b) => a.benchmark.speed - b.benchmark.speed); // fastest first
      break;
    }

    case "code": {
      // Code: coding experts, sorted by score
      models = models
        .filter((m) => m.benchmark.tags?.includes("coding_expert"))
        .filter((m) => m.benchmark.combinedScore >= 7000)
        .sort((a, b) => b.benchmark.combinedScore - a.benchmark.combinedScore);
      break;
    }

    case "reasoning":
    case "websearch": {
      // Reasoning/websearch: prefer large, smart models — boost score by model size
      const sizeBoost = (id) => {
        if (/550b|397b|675b/i.test(id)) return 3000;
        if (/120b|119b|100b|90b|70b/i.test(id)) return 2000;
        if (/49b|30b|32b/i.test(id)) return 1000;
        return 0;
      };
      models = models
        .filter((m) => m.benchmark.tags?.includes("smart"))
        .filter((m) => m.benchmark.combinedScore >= 5000)
        .map((m) => ({ ...m, _adjustedScore: m.benchmark.combinedScore + sizeBoost(m.id) }))
        .sort((a, b) => b._adjustedScore - a._adjustedScore);
      break;
    }

    default: {
      // Chat / general: top smart models by score — exclude tiny models
      models = models
        .filter((m) => m.benchmark.tags?.includes("smart"))
        .filter((m) => m.benchmark.combinedScore >= 6000)
        .filter((m) => !/[-_]1b[-_]|[-_]2b[-_]/i.test(m.id)) // exclude 1-2B models
        .sort((a, b) => b.benchmark.combinedScore - a.benchmark.combinedScore);
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
