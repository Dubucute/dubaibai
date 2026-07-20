const path = require("path");
const fs = require("fs");

const rankedPath = path.join(__dirname, "..", "ranked_models_clean.json");
console.log("Path:", rankedPath);
console.log("Exists:", fs.existsSync(rankedPath));

const data = fs.readFileSync(rankedPath, "utf-8");
console.log("File length:", data.length);
console.log("First 100 chars:", data.substring(0, 100));

const parsed = JSON.parse(data);
console.log("Parsed OK, data length:", parsed.data?.length);
console.log("First item:", parsed.data?.[0]?.id);
console.log("benchmarkedCount:", parsed.benchmarkedCount);

// Now test getAllModels
const { getAllModels } = require("./models");
const models = getAllModels();
console.log("\nModels loaded:", Object.keys(models).length);
console.log("Sample:", Object.entries(models).slice(0, 5).map(([k, v]) => ({ id: k, name: v.name, group: v.group, quality: v.quality, capabilities: v.capabilities })));
