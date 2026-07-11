# Contributing to Dubu AI

Thank you for your interest in contributing to Dubu AI! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Code Style](#code-style)
- [Project Architecture](#project-architecture)
- [Adding a New Model](#adding-a-new-model)
- [Adding a New Tool](#adding-a-new-tool)
- [Pull Request Process](#pull-request-process)
- [Commit Guidelines](#commit-guidelines)

## Code of Conduct

By participating in this project, you agree to:

- **Be respectful** — Treat others with kindness and professionalism
- **Be constructive** — Focus on solutions, not blame
- **Be collaborative** — Work together to improve the project
- **Be inclusive** — Welcome contributors of all backgrounds

## Getting Started

### 1. Fork the repository

```bash
# Click "Fork" on GitHub, then clone your fork
git clone https://github.com/YOUR_USER/dubaibai.git
cd dubaibai
```

### 2. Add the upstream remote

```bash
git remote add upstream https://github.com/Dubucute/dubaibai.git
```

### 3. Create a feature branch

```bash
git checkout -b feature/my-feature-name
```

Use a descriptive branch name:

| Prefix | Purpose |
|--------|---------|
| `feature/` | New features (e.g., `feature/image-gallery-sorting`) |
| `fix/` | Bug fixes (e.g., `fix/streaming-connection-loss`) |
| `refactor/` | Code restructuring (e.g., `refactor/orchestrator-split`) |
| `docs/` | Documentation (e.g., `docs/api-reference`) |
| `style/` | Formatting only (e.g., `style/prettier-reformat`) |

## Development Setup

### Prerequisites

- **Node.js** 18+ (uses native `fetch`, `ReadableStream`)
- An **NVIDIA API key** from [build.nvidia.com](https://build.nvidia.com)

### Install & Run

```bash
# Install dependencies
npm install

# Set your API key
export NVIDIA_API_KEY="nvapi-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# Start in dev mode (auto-restart on changes)
npm run dev
```

Open http://localhost:3033 in your browser.

### Verify Your Setup

```bash
# Check the health endpoint
curl http://localhost:3033/api/health

# Expected response:
# {"status":"ok","version":"2.1.0","name":"Dubu AI — Unified Agent",...}
```

## Code Style

### Formatter

We use **Prettier** for consistent formatting across all JavaScript, CSS, HTML, and JSON files.

```bash
# Format all files
npx prettier --write .

# Check formatting (without changing files)
npx prettier --check .
```

### Prettier Settings

These are defined in `.prettierrc` at the project root:

```json
{
  "semi": true,
  "singleQuote": false,
  "tabWidth": 2,
  "trailingComma": "all",
  "printWidth": 100,
  "bracketSpacing": true,
  "arrowParens": "always"
}
```

### Styling Rules

- **Indentation**: 2 spaces, no tabs
- **Quotes**: Double quotes for strings (except JSX attributes)
- **Semicolons**: Required at end of statements
- **Trailing commas**: Required everywhere (objects, arrays, function params, function calls)
- **Line length**: Maximum 100 characters
- **Arrow functions**: Always use parentheses around parameters

### Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Variables | `camelCase` | `modelName`, `userMessage` |
| Functions | `camelCase` | `sendToAgent()`, `formatMessageHtml()` |
| Classes | `PascalCase` | `NIMClient`, `Orchestrator` |
| Constants | `UPPER_SNAKE_CASE` | `CONFIG`, `MODEL_GROUP_ORDER` |
| Files | `kebab-case` | `nim.js`, `chat.js`, `main.css` |
| CSS classes | `kebab-case` | `.msg-content`, `.input-send-btn` |
| CSS custom props | `kebab-case` | `--text-primary`, `--accent-glow` |

### JavaScript Best Practices

- Use `const` by default, `let` when reassigning — never `var`
- Use optional chaining (`?.`) and nullish coalescing (`??`)
- Use template literals over string concatenation
- Prefer `async/await` over `.then()` chains
- Use early returns to reduce nesting
- Add JSDoc comments for exported functions and classes
- Avoid magic numbers — use named constants

```javascript
// ✅ Good
const maxTokens = CONFIG.maxTokens;
const result = await nim.chat(messages, { max_tokens: maxTokens });

// ❌ Avoid
const result = await nim.chat(messages, { max_tokens: 4096 });
```

## Project Architecture

```
dubu-ai/
├── api/index.js              # Vercel entry point — re-exports the Express app
├── server/
│   ├── index.js              # Express server: routes, middleware, file serving
│   ├── config.js             # Environment config (env vars → constants)
│   ├── nim.js                # NVIDIA NIM API client:
│   │                         #   chat(), chatStream() — async generator for SSE
│   │                         #   vision(), generateImage(), generateEmbeddings()
│   ├── orchestrator.js       # Agent orchestration:
│   │                         #   detects intent, routes to handler, yields SSE updates
│   ├── models.js             # Model registry (120+ models) + task route chains
│   ├── router.js             # Intent detection (classifies user messages by task)
│   └── tools/                # Plugin tools (each exports name, description, execute())
│       ├── index.js          # Tool registry (registerTool, listTools, getTool)
│       ├── chat.js           # General LLM chat
│       ├── code.js           # Code generation & analysis
│       ├── image.js          # Image generation
│       ├── vision.js         # Vision/multimodal analysis
│       └── ...
├── public/
│   ├── index.html            # SPA — chat interface
│   ├── css/                  # Styles divided by concern
│   └── js/                   # app.js (main logic), agent.js (API client), utils/
└── vercel.json               # Vercel deploy config
```

### Key Flow

```
User message → Express route → Orchestrator.process()
  → Intent detection (router.js)
  → Task routing (models.js — picks model chain)
  → NIM API call (nim.js — tries models with fallback)
  → SSE streaming back to frontend
```

## Adding a New Model

Adding a model to the registry is straightforward. Models are defined in `server/models.js`.

### 1. Add the model entry

In the `MODELS` object, add your model under the appropriate category:

```javascript
// In the chat section's models object:
"provider/model-name": {
  name: "Display Name",
  capabilities: ["chat", "code"],        // Capabilities for routing & UI
  speed: "very_fast",                    // "slow" | "medium" | "fast" | "very_fast"
  quality: 8,                            // 1-10 scale (used for sorting)
  context: 131072,                       // Context window in tokens (optional)
}
```

### 2. Add it to a task route (optional)

To make the model actively used, add it to a `TASK_ROUTES` chain:

```javascript
chat: {
  chain: [
    "provider/model-name",        // ← Add here
    "nvidia/llama-3.3-nemotron-super-49b-v1.5",
    // ... rest of chain
  ],
}
```

Models earlier in the chain are tried first. If they fail, fallback models are used automatically.

### 3. Add a quick-select button (optional)

To show the model in the frontend's preset bar, add a button in `public/index.html`:

```html
<button class="preset-btn" data-model="provider/model-name" onclick="selectModelPreset(this)">
  🚀 Model Name
</button>
```

### 4. Add tooltip info (optional)

To show a hover tooltip, add an entry in the `MODEL_INFO` object in `public/js/app.js`:

```javascript
"provider/model-name": {
  name: "Model Name",
  icon: "🚀",
  desc: "Description of the model's strengths.",
  capabilities: ["Fast", "Code", "Reasoning"],
}
```

## Adding a New Tool

Tools are plugins that the orchestrator can call. They live in `server/tools/`.

### 1. Create the tool file

```javascript
// server/tools/example.js
const { registerTool } = require("./index");

registerTool({
  name: "example_tool",
  description: "What this tool does",

  async execute(args, context) {
    // args: tool-specific parameters from the orchestrator
    // context: { apiKey, ... }

    // Your logic here
    return {
      success: true,
      result: "Tool output",
    };
  },
});
```

### 2. Load the tool in the server

Add a require line in `server/index.js`:

```javascript
require("./tools/example");
```

That's it! The tool auto-registers via `registerTool()`.

### Tool Interface

```typescript
interface Tool {
  name: string;                    // Unique identifier
  description: string;             // Human-readable description
  execute(args: any, context: {
    apiKey: string;
    [key: string]: any;
  }): Promise<{
    success: boolean;
    result?: any;
    error?: string;
  }>;
}
```

## Pull Request Process

### 1. Before You Submit

- [ ] Run `npx prettier --check .` and fix any formatting issues
- [ ] Test your changes locally: `npm run dev`
- [ ] Verify the server starts without errors
- [ ] Check the health endpoint: `curl http://localhost:3033/api/health`
- [ ] Test any new API endpoints
- [ ] Ensure your branch is up to date with `main`

```bash
git fetch upstream
git rebase upstream/main
```

### 2. Submit the PR

- Give your PR a clear, descriptive title
- Link any related issues
- Describe what the change does and why
- Include screenshots for UI changes
- Note any breaking changes or migration steps

### 3. Review Process

1. A maintainer will review your PR within a few days
2. Address any feedback or requested changes
3. Once approved, a maintainer will merge it

### 4. After Merge

- Delete your feature branch
- Pull the latest `main` to stay up to date

```bash
git checkout main
git pull upstream main
git branch -d feature/my-feature-name
```

## Commit Guidelines

### Structure

```
type(scope): Short description (max 72 chars)

Optional longer description. Wrap at 72 characters.
Explain what and why, not how.

Fixes #123
```

### Types

| Type | When to use |
|------|-------------|
| `feat` | A new feature |
| `fix` | A bug fix |
| `refactor` | Code change that neither fixes nor adds |
| `style` | Formatting only (Prettier, whitespace) |
| `docs` | Documentation only |
| `perf` | Performance improvement |
| `test` | Adding or fixing tests |
| `chore` | Build, CI, dependencies |

### Examples

```
feat(orchestrator): add streaming fallback for vision models

When a vision model fails during streaming, fall back to the next
model in the chain instead of failing entirely.

feat(nim): add chatStream async generator

Replaces the old non-streaming chat() with a streaming version
that yields tokens one-by-one via SSE parsing.

fix(app): restore send button after mid-stream clearAgent

When the user clicked "New Chat" during generation, the stop
button stayed visible and the send button stayed hidden.

style: apply Prettier formatting to all source files

docs(contributing): add PR process and commit guidelines
```

### Rules

- Use the imperative mood ("Add" not "Added" or "Adds")
- First line is a concise summary (max 72 chars)
- Body explains the motivation, not the implementation
- Reference issues with `Fixes #123` or `Closes #456`

## Questions?

Open a [Discussion](https://github.com/Dubucute/dubaibai/discussions) or an [Issue](https://github.com/Dubucute/dubaibai/issues) for help.
