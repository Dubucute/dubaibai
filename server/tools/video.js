// ===== Tool: Video Generation =====
const CONFIG = require('../config');
const { register } = require('./index');

register({
  name: 'generate_video',
  description: 'Generate video from text descriptions or image inputs.',
  parameters: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'Description of the video to generate.' },
      model: {
        type: 'string',
        description: 'Video generation model.',
        default: 'stabilityai/stable-video-diffusion',
      },
      frames: { type: 'number', description: 'Number of frames.', default: 14 },
      fps: { type: 'number', description: 'Frames per second.', default: 8 },
    },
    required: ['prompt'],
  },

  async execute(args) {
    const { prompt, model = 'stabilityai/stable-video-diffusion', frames = 14, fps = 8 } = args;
    const apiKey = CONFIG.apiKey;

    const url = `https://ai.api.nvidia.com/v1/genai/${model}`;
    const body = { prompt, seed: 0, steps: 30, frames, fps };

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Video API error ${resp.status}: ${err}`);
    }

    const data = await resp.json();
    return {
      video: data.video || null,
      image: data.image || null,
      model,
      prompt,
      data,
    };
  },
});
