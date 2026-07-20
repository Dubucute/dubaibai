// ===== Web Search & Deep Search =====
// Privacy-respecting meta search engine via 4get.sny.sh + full page content fetching

const https = require("https");
const http = require("http");

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
 * Deep search: search the web, then fetch full page content from each result.
 * Returns structured results with full page text for AI consumption.
 * @param {string} query - Search query
 * @param {object} opts - Options: { searchCount, fetchCount, maxCharsPerPage }
 * @returns {Promise<{ query: string, results: Array<{ title, url, snippet, content }>, raw: string }>}
 */
async function deepSearch(query, opts = {}) {
  const searchCount = opts.searchCount || 6;
  const fetchCount = opts.fetchCount || 4;
  const maxCharsPerPage = opts.maxCharsPerPage || 3000;

  // Step 1: Get search results
  const searchResult = await webSearch(query, { count: searchCount });
  const results = searchResult.results;

  // Step 2: Fetch full page content (top N results, in parallel)
  const pagesToFetch = results.slice(0, Math.min(fetchCount, results.length));
  const fetchPromises = pagesToFetch.map(async (r) => {
    try {
      const content = await fetchPageContent(r.url, maxCharsPerPage);
      return { ...r, content };
    } catch (e) {
      return { ...r, content: `[Failed to fetch: ${e.message}]` };
    }
  });

  const fetchedResults = await Promise.all(fetchPromises);

  // Merge fetched content back into results
  const contentMap = {};
  for (const fr of fetchedResults) {
    contentMap[fr.url] = fr.content;
  }
  for (const r of results) {
    r.content = contentMap[r.url] || null;
  }

  // Step 3: Build rich text for LLM context
  const raw = results
    .map((r, i) => {
      let block = `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}`;
      if (r.content) {
        block += `\n\n   **Page content:**\n   ${r.content}`;
      }
      return block;
    })
    .join("\n\n");

  return { query, results, raw };
}

/**
 * Fetch the full page content from a URL and extract readable text.
 * Strips HTML tags, scripts, and styles to get clean text.
 */
function fetchPageContent(url, maxChars = 3000) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    const req = client.get(
      url,
      {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
        },
        timeout: 8000,
      },
      (res) => {
        // Follow redirects up to 3 hops
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = new URL(res.headers.location, url).href;
          return resolve(fetchPageContent(redirectUrl, maxChars));
        }

        if (res.statusCode >= 400) {
          return resolve(`[Error: HTTP ${res.statusCode}]`);
        }

        // Check content type — skip binary content
        const contentType = res.headers["content-type"] || "";
        if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
          return resolve(`[Non-text content: ${contentType}]`);
        }

        let data = "";
        res.on("data", (chunk) => {
          data += chunk.toString("utf-8");
          if (data.length > maxChars * 2) {
            req.destroy();
            // We've got enough content, process what we have
          }
        });
        res.on("end", () => {
          const text = extractTextFromHtml(data);
          resolve(text.slice(0, maxChars));
        });
        res.on("error", () => {
          resolve(`[Connection error]`);
        });
      },
    );

    req.on("error", (err) => {
      resolve(`[Request failed: ${err.message}]`);
    });

    req.on("timeout", () => {
      req.destroy();
      resolve(`[Timeout]`);
    });
  });
}

/**
 * Extract readable text from HTML by stripping tags, scripts, styles.
 */
function extractTextFromHtml(html) {
  // Remove scripts and styles
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "");

  // Replace <br>, <p>, <div>, <li>, <h1-6> with newlines
  text = text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d|blockquote|tr|th|td)>/gi, "\n")
    .replace(/<[^>]+>/g, ""); // Strip remaining tags

  // Decode HTML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#\d+;/g, " ");

  // Clean up whitespace
  text = text
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();

  return text;
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

    if (seen.has(url) || isSearchEngineUrl(url)) {continue;}
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
      if (seen.has(url) || isSearchEngineUrl(url)) {continue;}
      seen.add(url);

      // Grab ~1000 chars after the <a> tag to find title/description
      const after = html.substring(match.index, match.index + 1500);
      const titleMatch = /<div[^>]*class="title"[^>]*>([\s\S]*?)<\/div>/i.exec(after);
      const descMatch = /<div[^>]*class="description"[^>]*>([\s\S]*?)<\/div>/i.exec(after);

      const title = titleMatch ? stripHtml(titleMatch[1]) : "";
      const snippet = descMatch ? stripHtml(descMatch[1]) : "";
      if (title) {results.push({ title, url, snippet });}
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

module.exports = { webSearch, fetchPageContent };
