// ===== Configuration =====
const CONFIG = {
  port: process.env.PORT || 3033,
  apiKey: process.env.NVIDIA_API_KEY || process.env.NVIDIA_NIM_API_KEY || '',
  apiBase: 'https://integrate.api.nvidia.com',
  defaultModel: 'nvidia/llama-3.3-nemotron-super-49b-v1',
  temperature: 0.7,
  maxTokens: 4096,
  maxFileSize: 50 * 1024 * 1024, // 50MB
  dataDir: './data',
  // Auto-fallback is always enabled — models will be tried in order until one works
  enableAutoFallback: true,
  // Auto model selection (route by intent) is always on
  enableAutoModelSelect: true,
};

module.exports = CONFIG;
