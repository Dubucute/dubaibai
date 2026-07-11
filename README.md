# Dubu AI — Unified Agent Platform

**Dubu AI** is an autonomous agent platform powered by the full [NVIDIA NIM](https://www.nvidia.com/en-us/ai/) model catalog. It features automatic model selection, intelligent task routing, and seamless fallback between models — all behind a clean chat interface.

## Features

- **Smart Task Routing** — Automatically detects intent (chat, code, reasoning, translation, etc.) and selects the best model for the job
- **Automatic Fallback** — If the primary model fails, falls back through a chain of alternatives so you always get a response
- **True Token Streaming** — Real-time SSE streaming from NVIDIA NIM, token by token
- **Multi-Model Chat** — Uses the best model from 120+ NVIDIA NIM models
- **Image Generation** — `/imagine` command with Flux, Stable Diffusion, and more
- **Vision Analysis** — Upload images for AI analysis via multimodal models
- **File Attachments** — Drag & drop text files for analysis
- **Image Gallery** — Browse and download generated images
- **Conversation History** — Saved conversations with sidebar navigation
- **6 Themes** — Dark, Light, Midnight, Slate, Emerald, Ruby
- **Edit & Regenerate** — Double-click your messages to edit, regenerate assistant responses
- **Stop Generation** — Cancel mid-stream generation at any time
- **Responsive** — Mobile-friendly with collapsible sidebar

## Prerequisites

- **Node.js** 18+ (local development) or a **Vercel** account (deployment)
- **NVIDIA API Key** — Get one free at [build.nvidia.com](https://build.nvidia.com)

## Quick Start (Local Development)

```bash
# 1. Clone the repo
git clone https://github.com/Dubucute/dubaibai.git
cd dubaibai

# 2. Install dependencies
npm install

# 3. Set your NVIDIA API key
export NVIDIA_API_KEY="nvapi-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# 4. Start the server
npm run dev
```

Open **http://localhost:3033** in your browser.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NVIDIA_API_KEY` | Yes | Your NVIDIA NIM API key from [build.nvidia.com](https://build.nvidia.com) |
| `NVIDIA_NIM_API_KEY` | No | Alternative env var name for the API key (fallback) |
| `PORT` | No | Server port (default: `3033`) |

## Deploy to Vercel

The project is pre-configured for Vercel deployment with `vercel.json`.

### 1-Click Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Dubucute/dubaibai)

### Manual Deploy

1. Push the repo to GitHub
2. Go to [vercel.com/new](https://vercel.com/new)
3. Import your GitHub repo
4. Add environment variable: `NVIDIA_API_KEY`
5. Click **Deploy**

That's it — Vercel auto-detects `vercel.json` and deploys the Express app as a serverless function.

## Project Structure

```
dubu-ai/
├── api/
│   └── index.js              # Vercel serverless entry point
├── server/
│   ├── index.js              # Express server + API routes
│   ├── config.js             # Configuration (env vars, defaults)
│   ├── nim.js                # NVIDIA NIM API client (chat, stream, vision, image, embeddings)
│   ├── orchestrator.js       # Agent orchestration (intent detection → model routing)
│   ├── models.js             # Model registry (120+ models, task routes, fallback chains)
│   ├── router.js             # Intent detection (classifies user messages)
│   ├── store.js              # Conversation & document persistence
│   └── tools/                # Tool plugins (chat, code, image, vision, search, fs...)
│       ├── index.js
│       ├── chat.js
│       ├── code.js
│       ├── image.js
│       ├── vision.js
│       └── ...
├── public/
│   ├── index.html            # SPA entry point
│   ├── css/
│   │   ├── main.css          # Core styles
│   │   ├── themes.css        # 6 theme color tokens
│   │   ├── glass.css         # Glassmorphism UI effects
│   │   └── syntax.css        # Code syntax highlighting
│   └── js/
│       ├── app.js            # Main frontend logic (chat, streaming, settings)
│       ├── agent.js          # AgentAPI client (SSE, fetch wrappers)
│       └── utils/
│           └── state.js      # State management + localStorage persistence
├── vercel.json               # Vercel deployment configuration
├── .prettierrc               # Code formatting rules
└── package.json
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start the server in production mode |
| `npm run dev` | Start with auto-reload (`--watch`) for development |

## How It Works

### Request Flow

```
User Message
    ↓
Intent Detection (router.js) — classifies the message
    ↓
Task Routing (models.js) — picks the best model chain
    ↓
NIM API Call (nim.js) — tries models in order with fallback
    ↓
SSE Streaming (orchestrator.js → frontend)
    ↓
Tokens appear in real-time
```

### Fallback Chain

Each task type has a prioritized chain of models. If the first model fails (rate limit, outage, etc.), the next is tried automatically:

```
chat:     Nemotron 49B → Nemotron Super → Ultra 253B → Llama 70B → Qwen 3.5 → DeepSeek Flash
code:     DeepSeek Flash → DeepSeek Pro → Nemotron 49B → Kimi K2.6 → Qwen 3.5 → Codestral
image:    Flux.1 Dev → Flux.1 Schnell → Flux.2 Klein → SD3 Medium → DiffusionGemma
vision:   Llama 3.2 90B Vision → Llama 4 Maverick → Phi-4 Multimodal → Llama 3.2 11B
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | Send message |
| `Cmd+K` / `Ctrl+K` | Focus input |
| `Cmd+L` / `Ctrl+L` | New chat |
| `Cmd+U` / `Ctrl+U` | Attach file |
| `Cmd+F` / `Ctrl+F` | Toggle web search |
| `Cmd+D` / `Ctrl+D` | Toggle deep reasoning |
| `Cmd+G` / `Ctrl+G` | Open image gallery |
| `Cmd+T` / `Ctrl+T` | Toggle theme |
| `Cmd+,` / `Ctrl+,` | Open settings |
| `Escape` | Close modals / sidebar |
| Double-click (on user message) | Edit message |
| Refresh button (on assistant message) | Regenerate response |

## Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Run `npx prettier --write .` to format code
5. Commit (`git commit -m "Add my feature"`)
6. Push and open a PR

## License

MIT
