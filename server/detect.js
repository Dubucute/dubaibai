// ===== AI Content Detection =====
// Uses free HuggingFace Inference API (no API key needed for basic usage)
// Falls back to NVIDIA NIM prompt-based detection.
// Final fallback: Pollinations free OpenAI-compatible API.

const https = require("https");
const http = require("http");

const HF_API_BASE = "https://api-inference.huggingface.com";
const HF_MODEL = "roberta-base-openai-detector";
const POLLINATIONS_URL = "https://text.pollinations.ai/openai";

/**
 * Call HuggingFace free Inference API for AI text detection.
 * Uses the roberta-base-openai-detector model (fine-tuned for GPT-2/AI text).
 */
function callHFDetector(text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ inputs: text });
    const url = new URL(`${HF_API_BASE}/models/${HF_MODEL}`);

    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "User-Agent": "Mozilla/5.0 (compatible; DubuAI; +https://myaidubu.vercel.app)",
      },
      timeout: 15000,
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        // If HTML response — model is loading or blocked; treat as retryable
        if (data.trim().startsWith("<!DOCTYPE") || data.trim().startsWith("<html")) {
          return reject(new Error("Model not ready (HTML response)"));
        }
        try {
          const parsed = JSON.parse(data);
          // HF returns: [[{label: "Real", score: 0.xx}, {label: "Fake", score: 0.xx}]]
          if (Array.isArray(parsed) && parsed[0] && Array.isArray(parsed[0])) {
            const results = parsed[0];
            const fakeScore = results.find(r => r.label?.toLowerCase() === "fake")?.score || 0;
            const realScore = results.find(r => r.label?.toLowerCase() === "real")?.score || 0;
            resolve({
              aiScore: Math.round(fakeScore * 100),
              humanScore: Math.round(realScore * 100),
              source: "huggingface",
              raw: parsed,
            });
          } else if (parsed.error) {
            // Model is loading or error
            reject(new Error(parsed.error));
          } else {
            reject(new Error("Unexpected response format"));
          }
        } catch (e) {
          reject(new Error(`Parse error: ${  e.message}`));
        }
      });
    });

    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
    req.write(body);
    req.end();
  });
}

/**
 * Fallback: Use NVIDIA NIM with a detection-oriented prompt.
 */
function callNIMFallback(text, apiKey) {
  return new Promise((resolve, reject) => {
    if (!apiKey) {return reject(new Error("No API key for fallback"));}

    const payload = {
      model: "nvidia/llama-3.1-nemotron-70b-instruct",
      messages: [
        {
          role: "system",
          content: "You are an AI text detector. Analyze the text and return JSON: {\"aiScore\": 0-100, \"humanScore\": 0-100, \"signals\": [\"reason1\", \"reason2\"]}. aiScore = how likely AI wrote it. Only return JSON, nothing else.",
        },
        { role: "user", content: text.slice(0, 2000) },
      ],
      temperature: 0.1,
      max_tokens: 300,
    };
    const body = JSON.stringify(payload);

    const options = {
      hostname: "integrate.api.nvidia.com",
      path: "/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        Authorization: `Bearer ${apiKey}`,
      },
      timeout: 20000,
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.message?.content || "";
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            resolve({
              aiScore: Math.max(0, Math.min(100, result.aiScore || 50)),
              humanScore: Math.max(0, Math.min(100, result.humanScore || 50)),
              source: "nim-fallback",
              signals: result.signals || [],
            });
          } else {
            reject(new Error("Could not parse NIM response"));
          }
        } catch (e) {
          reject(new Error(`NIM parse error: ${  e.message}`));
        }
      });
    });

    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
    req.write(body);
    req.end();
  });
}

/**
 * Fallback: Use Pollinations free OpenAI-compatible API for detection.
 * No API key needed.
 */
function callPollinationsDetector(text) {
  return new Promise((resolve, reject) => {
    const payload = {
      model: "openai",
      messages: [
        {
          role: "system",
          content: "You are an AI text detector. Analyze the text and return ONLY valid JSON in exactly this format, no other text: {\"aiScore\":0-100,\"humanScore\":0-100,\"signals\":[\"reason1\"]}. aiScore = how likely (%) the text was written entirely by AI. humanScore = how likely (%) the text was written by a human.",
        },
        { role: "user", content: text.slice(0, 1500) },
      ],
      temperature: 0.1,
      max_tokens: 200,
    };
    const body = JSON.stringify(payload);
    const url = new URL(POLLINATIONS_URL);

    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
      timeout: 15000,
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.message?.content || "";
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            resolve({
              aiScore: Math.max(0, Math.min(100, result.aiScore ?? 50)),
              humanScore: Math.max(0, Math.min(100, result.humanScore ?? 50)),
              source: "pollinations",
              signals: result.signals || [],
            });
          } else {
            reject(new Error("No JSON in Pollinations response"));
          }
        } catch (e) {
          reject(new Error(`Pollinations parse error: ${  e.message}`));
        }
      });
    });

    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
    req.write(body);
    req.end();
  });
}

/**
 * Main detection function.
 * Tries HuggingFace first, falls back to Pollinations (free), then NIM.
 */
async function detectAIContent(text, nimApiKey) {
  // Truncate to reasonable length
  const cleanText = text.replace(/\s+/g, " ").trim().slice(0, 3000);

  if (cleanText.length < 20) {
    return {
      aiScore: 0,
      humanScore: 0,
      refinedScore: 0,
      aiLevel: "low",
      source: "insufficient",
      signals: ["Text too short for accurate detection"],
    };
  }

  // Try HuggingFace first (specialized model, best results)
  try {
    const result = await callHFDetector(cleanText);
    return formatResult(result, cleanText);
  } catch (hfError) {
    console.warn("  ⚠️ HuggingFace detection failed:", hfError.message);
  }

  // Fall back to Pollinations (free, no key needed)
  try {
    const result = await callPollinationsDetector(cleanText);
    return formatResult(result, cleanText);
  } catch (pollError) {
    console.warn("  ⚠️ Pollinations detector also failed:", pollError.message);
  }

  // Final fallback to NIM (requires API key)
  try {
    const result = await callNIMFallback(cleanText, nimApiKey);
    return formatResult(result, cleanText);
  } catch (nimError) {
    console.warn("  ⚠️ NIM detection fallback also failed:", nimError.message);
    return {
      aiScore: 50,
      humanScore: 30,
      refinedScore: 20,
      aiLevel: "medium",
      source: "estimated",
      signals: ["Could not reach detection service — showing estimate"],
    };
  }
}

function formatResult(result, text) {
  const aiScore = result.aiScore;
  const humanScore = result.humanScore;
  let refinedScore, aiLevel;

  if (aiScore > 65) {
    refinedScore = Math.max(0, Math.min(100, Math.round((100 - aiScore) * 0.3)));
    aiLevel = "high";
  } else if (aiScore > 35) {
    refinedScore = Math.max(0, aiScore - humanScore);
    aiLevel = "medium";
  } else {
    refinedScore = Math.max(0, Math.round(aiScore * 0.3));
    aiLevel = "low";
  }

  return {
    aiScore: Math.max(0, Math.min(100, aiScore)),
    humanScore: Math.max(0, Math.min(100, humanScore)),
    refinedScore: Math.max(0, Math.min(100, refinedScore)),
    aiLevel,
    source: result.source || "unknown",
    signals: result.signals || [],
    sample: text.length > 200 ? `${text.slice(0, 200)  }...` : text,
  };
}

module.exports = { detectAIContent };
