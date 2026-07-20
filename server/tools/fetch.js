// ===== Fetch Webpage Tool =====
// Fetches and extracts readable content from any URL.
// Available to ALL models — models request it via !fetch[URL] syntax.

const { fetchPageContent } = require("../websearch");
const { register } = require("./index");

register({
  name: "fetch_webpage",
  description: "Fetch the content of a webpage by URL and return the readable text. Use when the user asks about a specific webpage or you need to read online content.",
  parameters: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The full URL of the webpage to fetch (must start with http:// or https://)",
      },
      maxChars: {
        type: "number",
        description: "Maximum characters to return (default 3000, max 8000)",
        default: 3000,
      },
    },
    required: ["url"],
  },
  async execute(args, context) {
    const url = args.url;
    const maxChars = Math.min(args.maxChars || 3000, 8000);

    if (!url || typeof url !== "string") {
      return { success: false, error: "URL is required" };
    }

    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return { success: false, error: "URL must start with http:// or https://" };
    }

    try {
      const content = await fetchPageContent(url, maxChars);
      return {
        success: true,
        url,
        content,
        charCount: content.length,
        truncated: content.length >= maxChars,
      };
    } catch (e) {
      return { success: false, url, error: e.message };
    }
  },
});

console.log("  📄 Tool registered: fetch_webpage");
