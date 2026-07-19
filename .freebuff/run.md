# Run Doc

## Reproduce Artifacts
- `node_modules/` already present — no install needed
- `.env` file is encrypted via dotenvx and auto-injected at startup — no manual copy needed
- No `.env.local` required for basic local dev

## How to Run the Server
```bash
cd <project root>
PORT=3033 node server/index.js
```
- Default port from config: 3033
- `.env` may inject a different PORT (e.g. 57097) — override with `PORT=3033` if that port is in use
- Server serves static files from `public/` and API routes under `/api/`
- Health check: `GET /api/health`

## Notes
- Auth (Supabase) is optional — server works in guest mode without it
- PostgreSQL is optional — falls back to in-memory store if not configured
- NVIDIA API key can be set via `NVIDIA_API_KEY` env var for full functionality
