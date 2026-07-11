// ===== Tool: Chat / LLM Completion =====
const CONFIG = require('../config');
const { register } = require('./index');

register({
  name: 'chat',
  description: 'Have a conversation with any LLM model. Use for general Q&A, writing, coding, analysis, and any text-based task.',
  parameters: {
    type: 'object',
    properties: {
      model: {
        type: 'string',
        description: 'Model ID to use. Smartest: Nemotron Ultra/Super, DeepSeek V4 Pro, Qwen 3.5, Llama 4. Fastest: DeepSeek V4 Flash, Phi-4 Mini, Step Fun, Gemma 3.',
        enum: [
          // ═══ SMARText (Quality 9-10) ═══
          'nvidia/llama-3.3-nemotron-super-49b-v1.5',
          'nvidia/llama-3.3-nemotron-super-49b-v1',
          'nvidia/llama-3.1-nemotron-ultra-253b-v1',
          'nvidia/nemotron-3-super-120b-a12b',
          'nvidia/nemotron-3-ultra-550b-a55b',
          'qwen/qwen3.5-397b-a17b',
          'qwen/qwen3.5-122b-a10b',
          'qwen/qwq-32b',
          'deepseek-ai/deepseek-v4-pro',
          'deepseek-ai/deepseek-v4-flash',
          'meta/llama-4-maverick-17b-128e-instruct',
          'meta/llama-3.3-70b-instruct',
          'mistralai/mistral-large-3-675b-instruct-2512',
          'mistralai/mistral-small-4-119b-2603',
          'mistralai/mistral-nemotron',
          'moonshotai/kimi-k2.6',
          'moonshotai/kimi-k2-instruct',
          'google/gemma-4-31b-it',
          'google/gemma-3-12b-it',
          'google/gemma-3-4b-it',

          // ═══ FAST & LIGHTWEIGHT ═══
          'microsoft/phi-4-mini-instruct',
          'stepfun-ai/step-3.5-flash',
          'stepfun-ai/step-3.7-flash',
          'minimaxai/minimax-m3',
          'meta/llama-3.1-70b-instruct',
          'meta/llama-3.1-8b-instruct',
          'meta/llama-3.2-3b-instruct',
          'mistralai/ministral-14b-instruct-2512',
          'mistralai/codestral-22b-instruct-v0.1',
          'nvidia/nvidia-nemotron-nano-9b-v2',
          'nvidia/llama-3.1-nemotron-nano-8b-v1',
          'nvidia/nemotron-nano-3-30b-a3b',
          'qwen/qwen3-next-80b-a3b-instruct',
          'ai21labs/jamba-1.5-large-instruct',
          'ibm/granite-34b-code-instruct',
          'deepseek-ai/deepseek-coder-6.7b-instruct',
        ],
      },
      message: { type: 'string', description: 'The user message or prompt.' },
      system_prompt: { type: 'string', description: 'Optional system prompt to set context.' },
      max_tokens: { type: 'number', description: 'Max tokens in response.', default: 1024 },
      temperature: { type: 'number', description: 'Sampling temperature (0-2).', default: 0.7 },
      stream: { type: 'boolean', description: 'Whether to stream the response.', default: false },
    },
    required: ['message'],
  },

  async execute(args, context) {
    const { message, system_prompt, max_tokens = 1024, temperature = 0.7, stream = false } = args;
    const model = args.model || context.model || CONFIG.defaultModel;

    const messages = [];
    if (system_prompt) messages.push({ role: 'system', content: system_prompt });
    if (context.history) messages.push(...context.history.slice(-20));
    messages.push({ role: 'user', content: message });

    const url = `${CONFIG.apiBase}/v1/chat/completions`;
    const body = { model, messages, max_tokens, temperature, stream };

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${context.apiKey || CONFIG.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Chat API error ${resp.status}: ${err}`);
    }

    if (stream) {
      return { stream: true, model, response: resp.body };
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || 'No response generated.';
    return {
      stream: false,
      model,
      content,
      usage: data.usage || null,
    };
  },
});
