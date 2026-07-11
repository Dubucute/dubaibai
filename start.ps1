# Dubu AI v2 — Start Script (Windows PowerShell)
Write-Host "`n  🚀 Dubu AI v2 — Autonomous Agent Platform" -ForegroundColor Magenta
Write-Host "  ⚡ Powered by NVIDIA NIM`n" -ForegroundColor Cyan

# Check if node is installed
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Node.js is required. Install from https://nodejs.org" -ForegroundColor Red
    exit 1
}

# Install dependencies if needed
if (-not (Test-Path "node_modules")) {
    Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
    npm install
}

# Start server
Write-Host "🌐 Starting server at http://localhost:3033`n" -ForegroundColor Green
node server/index.js
