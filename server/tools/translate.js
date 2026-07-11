// ===== Tool: Translation =====
const CONFIG = require('../config');
const { register } = require('./index');

register({
  name: 'translate',
  description: 'Translate text between languages using NVIDIA Riva or any LLM.',
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Text to translate.' },
      source_lang: { type: 'string', description: 'Source language code (e.g. en, es, fr, de, ja, zh).', default: 'en' },
      target_lang: { type: 'string', description: 'Target language code (e.g. es, fr, de, ja, zh).' },
      model: {
        type: 'string',
        description: 'Translation model.',
        default: 'nvidia/riva-translate-4b-instruct-v1_1',
      },
    },
    required: ['text', 'target_lang'],
  },

  async execute(args) {
    const { text, source_lang = 'en', target_lang, model = 'nvidia/riva-translate-4b-instruct-v1_1' } = args;
    const apiKey = CONFIG.apiKey;

    const url = `${CONFIG.apiBase}/v1/chat/completions`;
    const body = {
      model,
      messages: [{
        role: 'user',
        content: `Translate the following ${source_lang} text to ${target_lang}. Only respond with the translation, no explanation.\n\n${text}`,
      }],
      max_tokens: 1024,
      temperature: 0.1,
    };

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await resp.json();
    const translation = data.choices?.[0]?.message?.content || text;

    return {
      translation,
      source_lang,
      target_lang,
      source_text: text,
      model,
    };
  },
});
