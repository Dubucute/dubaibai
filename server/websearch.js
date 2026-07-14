// ===== Web Search via 4get.sny.sh =====
// Privacy-respecting meta search engine — scrapes results from HTML

const https = require("https");

const SEARCH_URL = "https://4get.sny.sh/web";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";

/**
 * Perform a web search via 4get.sny.sh and return structured results.
 * @param {string} query - Search query
 * @param {object} opts - Options: { count: number }
 * @returns {Promise<{ query: string, results: Array<{ title, url, snippet }>, raw: string }>}
 */
async function webSearch(query, opts = {}) {
  const count = opts.count || 8;
  const params = new URLSearchParams({ s: query });
  const url = `${SEARCH_URL}?${params.toString()}`;

  const html = await fetchHtml(url);

  // Parse results from HTML
  const results = parseSearchResults(html, count);

  // Build a compact text summary for LLM context
  const raw = results
    .map((r, i) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}`)
    .join("\n\n");

  return { query, results, raw };
}

/**
 * Fetch HTML from a URL with proper headers matching the user's curl config.
 */
function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.8",
          DNT: "1",
          Referer: "https://4get.sny.sh/",
          "sec-ch-ua":
            '"Not;A=Brand";v="8", "Chromium";v="150", "Brave";v="150"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"Windows"',
          "sec-fetch-dest": "document",
          "sec-fetch-mode": "navigate",
          "sec-fetch-site": "same-origin",
          "sec-fetch-user": "?1",
          "sec-gpc": "1",
          "upgrade-insecure-requests": "1",
          "User-Agent": USER_AGENT,
        },
        timeout: 10000,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          resolve(data);
        });
      },
    );

    let data = "";

    req.on("data", (chunk) => {
      data += chunk;
    });

    req.on("end", () => {
      resolve(data);
    });

    req.on("error", (err) => {
      reject(new Error(`Web search request failed: ${err.message}`));
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Web search request timed out"));
    });
  });
}

/**
 * Parse search results from 4get HTML.
 * 4get result structure:
 *   <a href="URL" class="hover">
 *     <div class="title">TITLE</div>
 *     <div class="greentext">DATE</div>
 *     <div class="description">SNIPPET</div>
 *   </a>
 */
function parseSearchResults(html, maxResults) {
  const results = [];
  const seen = new Set();

  // Match <a> blocks with class="hover" — each is a search result
  const resultPattern =
    /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*class="hover"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = resultPattern.exec(html)) !== null && results.length < maxResults) {
    const url = match[1];
    const block = match[2];

    if (seen.has(url) || isSearchEngineUrl(url)) continue;
    seen.add(url);

    // Extract title from <div class="title">
    const titleMatch = /<div[^>]*class="title"[^>]*>([\s\S]*?)<\/div>/i.exec(block);
    const title = titleMatch ? stripHtml(titleMatch[1]) : "";

    // Extract snippet from <div class="description">
    const descMatch = /<div[^>]*class="description"[^>]*>([\s\S]*?)<\/div>/i.exec(block);
    const snippet = descMatch ? stripHtml(descMatch[1]) : "";

    if (title) {
      results.push({ title, url, snippet });
    }
  }

  // Fallback: try matching <a> with class="hover" without capturing inner content,
  // then look for title/description divs nearby
  if (results.length === 0) {
    const simplePattern = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*class="hover"/gi;
    while ((match = simplePattern.exec(html)) !== null && results.length < maxResults) {
      const url = match[1];
      if (seen.has(url) || isSearchEngineUrl(url)) continue;
      seen.add(url);

      // Grab ~1000 chars after the <a> tag to find title/description
      const after = html.substring(match.index, match.index + 1500);
      const titleMatch = /<div[^>]*class="title"[^>]*>([\s\S]*?)<\/div>/i.exec(after);
      const descMatch = /<div[^>]*class="description"[^>]*>([\s\S]*?)<\/div>/i.exec(after);

      const title = titleMatch ? stripHtml(titleMatch[1]) : "";
      const snippet = descMatch ? stripHtml(descMatch[1]) : "";
      if (title) results.push({ title, url, snippet });
    }
  }

  return results;
}

/**
 * Strip HTML tags from a string.
 */
function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Check if a URL is from a search engine (to exclude self-references).
 */
function isSearchEngineUrl(url) {
  const engines = [
    "google.com",
    "bing.com",
    "yahoo.com",
    "duckduckgo.com",
    "4get.sny.sh",
    "startpage.com",
    "brave.com/search",
  ];
  return engines.some((e) => url.includes(e));
}

module.exports = { webSearch };
