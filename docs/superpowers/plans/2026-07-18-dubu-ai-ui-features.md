# Dubu AI UI Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 5 major UI enhancements to Dubu AI: Command Palette, Model Comparison, Drag & Drop Upload, Skeleton Loading States, and Export Options Panel.

**Architecture:** Each feature is implemented as a self-contained module in `public/js/components/` with corresponding CSS in `public/css/main.css`. Features hook into the existing `AgentAPI` and `AppState` systems. All components use vanilla JS with no external dependencies.

**Tech Stack:** Vanilla JavaScript, CSS custom properties, existing glass morphism design system, AgentAPI for backend communication.

## Global Constraints

- No external dependencies (vanilla JS only)
- Follow existing design system (glass morphism, CSS variables)
- Maintain mobile responsiveness
- Support keyboard navigation and accessibility (ARIA attributes)
- Use existing `state` manager for persistence
- All new components go in `public/js/components/`
- All new CSS goes in `public/css/main.css`

---

## Feature 1: Command Palette (Cmd+K)

### File Structure

- Create: `public/js/components/command-palette.js`
- Modify: `public/css/main.css` (add palette styles)
- Modify: `public/chat.html` (add script tag)

### Task 1.1: Create Command Palette HTML Structure

**Files:**
- Modify: `public/chat.html`

**Interfaces:**
- Consumes: `window.state` for theme, model settings
- Produces: `window.CommandPalette` API

- [ ] **Step 1: Add command palette container to chat.html**

Add before closing `</body>` tag:

```html
<!-- ===== COMMAND PALETTE (Cmd+K) ===== -->
<div class="cmd-overlay" id="cmdOverlay">
  <div class="cmd-dialog">
    <div class="cmd-search">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M11 11l3 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      </svg>
      <input type="text" id="cmdInput" class="cmd-input" placeholder="Type a command or search..." spellcheck="false" autocomplete="off">
      <kbd class="cmd-kbd">ESC</kbd>
    </div>
    <div class="cmd-results" id="cmdResults"></div>
    <div class="cmd-footer">
      <span><kbd>↑↓</kbd> Navigate</span>
      <span><kbd>↵</kbd> Select</span>
      <span><kbd>esc</kbd> Close</span>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add public/chat.html
git commit -m "feat: add command palette HTML structure"
```

---

### Task 1.2: Create Command Palette CSS

**Files:**
- Modify: `public/css/main.css`

**Interfaces:**
- Consumes: CSS variables from design system
- Produces: `.cmd-overlay`, `.cmd-dialog`, `.cmd-search`, `.cmd-input`, `.cmd-results`, `.cmd-item`, `.cmd-footer` styles

- [ ] **Step 1: Add command palette styles to main.css**

```css
/* ===== Command Palette ===== */
.cmd-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(8px);
  z-index: 99999;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 20vh;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
}

.cmd-overlay.open {
  opacity: 1;
  pointer-events: all;
}

.cmd-dialog {
  width: 520px;
  max-width: 90vw;
  max-height: 460px;
  background: var(--glass-bg);
  backdrop-filter: blur(20px);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  box-shadow:
    0 24px 64px rgba(0, 0, 0, 0.3),
    0 8px 20px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transform: scale(0.95) translateY(-10px);
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.cmd-overlay.open .cmd-dialog {
  transform: scale(1) translateY(0);
}

.cmd-search {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-color);
  background: var(--input-bg);
}

.cmd-search svg {
  flex-shrink: 0;
  color: var(--text-muted);
}

.cmd-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-family: inherit;
  font-size: 14px;
  color: var(--text-primary);
  min-width: 0;
}

.cmd-input::placeholder {
  color: var(--text-muted);
}

.cmd-kbd {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--tag-bg);
  border: 1px solid var(--border-color);
  font-size: 10px;
  font-family: var(--font-mono);
  color: var(--text-muted);
}

.cmd-results {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  min-height: 200px;
  max-height: 340px;
}

.cmd-section-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
  padding: 8px 10px 4px;
}

.cmd-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.1s ease;
}

.cmd-item:hover,
.cmd-item.active {
  background: var(--hover-bg);
}

.cmd-item.active {
  background: var(--accent-muted);
}

.cmd-item-icon {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-xs);
  background: var(--tag-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  flex-shrink: 0;
  font-size: 14px;
}

.cmd-item.active .cmd-item-icon {
  background: var(--accent-muted);
  color: var(--accent);
}

.cmd-item-info {
  flex: 1;
  min-width: 0;
}

.cmd-item-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.cmd-item-desc {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 1px;
}

.cmd-item-shortcut {
  display: flex;
  gap: 4px;
}

.cmd-item-shortcut kbd {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--tag-bg);
  border: 1px solid var(--border-color);
  font-size: 10px;
  font-family: var(--font-mono);
  color: var(--text-muted);
}

.cmd-footer {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 16px;
  border-top: 1px solid var(--border-color);
  font-size: 11px;
  color: var(--text-muted);
}

.cmd-footer span {
  display: flex;
  align-items: center;
  gap: 4px;
}

.cmd-footer kbd {
  display: inline-block;
  padding: 1px 4px;
  border-radius: 3px;
  background: var(--tag-bg);
  border: 1px solid var(--border-color);
  font-size: 9px;
  font-family: var(--font-mono);
}

.cmd-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  color: var(--text-muted);
  font-size: 13px;
  gap: 8px;
}
```

- [ ] **Step 2: Commit**

```bash
git add public/css/main.css
git commit -m "feat: add command palette CSS styles"
```

---

### Task 1.3: Create Command Palette JavaScript

**Files:**
- Create: `public/js/components/command-palette.js`

**Interfaces:**
- Consumes: `window.state`, `AgentAPI`, model list
- Produces: `window.CommandPalette.open()`, `window.CommandPalette.close()`

- [ ] **Step 1: Create command-palette.js**

```javascript
// ===== Command Palette (Cmd+K) =====
(function() {
  const overlay = document.getElementById('cmdOverlay');
  const input = document.getElementById('cmdInput');
  const results = document.getElementById('cmdResults');
  let isOpen = false;
  let activeIndex = 0;
  let filteredCommands = [];

  // Command registry
  const commands = [
    // Navigation
    { id: 'new-chat', name: 'New Chat', desc: 'Start a fresh conversation', icon: '✨', category: 'Navigation', action: () => { window.clearAgent?.(); } },
    { id: 'home', name: 'Go to Home', desc: 'Navigate to home page', icon: '🏠', category: 'Navigation', action: () => { window.location.href = 'index.html'; } },
    { id: 'gallery', name: 'Image Gallery', desc: 'View generated images', icon: '🖼️', shortcut: '⌘G', category: 'Navigation', action: () => { window.toggleGallery?.(); } },
    { id: 'settings', name: 'Settings', desc: 'Open settings panel', icon: '⚙️', shortcut: '⌘,', category: 'Navigation', action: () => { window.switchPanel?.('settings'); } },

    // Models
    { id: 'model-auto', name: 'Auto-Select Model', desc: 'Let AI choose the best model', icon: '⚡', category: 'Models', action: () => { state.set('agentModel', ''); showToast('Model: Auto-Select', 'success', 1500); } },
    { id: 'model-deepseek-flash', name: 'DeepSeek V4 Flash', desc: 'Fast and efficient', icon: '🚀', category: 'Models', action: () => { state.set('agentModel', 'deepseek-ai/deepseek-v4-flash'); showToast('Model: DeepSeek Flash', 'success', 1500); } },
    { id: 'model-nemotron', name: 'Nemotron 49B', desc: 'High quality reasoning', icon: '🧠', category: 'Models', action: () => { state.set('agentModel', 'nvidia/llama-3.3-nemotron-super-49b-v1.5'); showToast('Model: Nemotron 49B', 'success', 1500); } },
    { id: 'model-deepseek-pro', name: 'DeepSeek V4 Pro', desc: 'Maximum quality', icon: '⭐', category: 'Models', action: () => { state.set('agentModel', 'deepseek-ai/deepseek-v4-pro'); showToast('Model: DeepSeek Pro', 'success', 1500); } },

    // Modes
    { id: 'toggle-websearch', name: 'Toggle Web Search', desc: 'Enable/disable real-time web search', icon: '🌐', shortcut: '⌘F', category: 'Modes', action: () => { window.toggleWebSearch?.(); } },
    { id: 'toggle-deepthink', name: 'Toggle Deep Thinking', desc: 'Enable/disable step-by-step reasoning', icon: '💡', shortcut: '⌘D', category: 'Modes', action: () => { window.toggleDeepThink?.(); } },

    // Theme
    { id: 'theme-dark', name: 'Theme: Dark', desc: 'Switch to dark theme', icon: '🌙', category: 'Theme', action: () => { window.selectTheme?.('dark'); } },
    { id: 'theme-light', name: 'Theme: Light', desc: 'Switch to light theme', icon: '☀️', category: 'Theme', action: () => { window.selectTheme?.('light'); } },
    { id: 'theme-midnight', name: 'Theme: Midnight', desc: 'Switch to midnight theme', icon: '🌑', category: 'Theme', action: () => { window.selectTheme?.('midnight'); } },
    { id: 'toggle-theme', name: 'Cycle Theme', desc: 'Switch to next theme', icon: '🎨', shortcut: '⌘T', category: 'Theme', action: () => { window.toggleTheme?.(); } },

    // Actions
    { id: 'export-md', name: 'Export as Markdown', desc: 'Download conversation as .md file', icon: '📄', category: 'Actions', action: () => { window.exportConversation?.(); } },
    { id: 'clear-chat', name: 'Clear Chat', desc: 'Clear all messages', icon: '🗑️', shortcut: '⌘L', category: 'Actions', action: () => { window.clearAgent?.(); } },
  ];

  function renderCommands(query = '') {
    const q = query.toLowerCase().trim();
    filteredCommands = q
      ? commands.filter(c => c.name.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q) || c.category.toLowerCase().includes(q))
      : [...commands];

    if (filteredCommands.length === 0) {
      results.innerHTML = `<div class="cmd-empty"><span>No results found</span></div>`;
      return;
    }

    // Group by category
    const groups = {};
    filteredCommands.forEach(c => {
      if (!groups[c.category]) groups[c.category] = [];
      groups[c.category].push(c);
    });

    let html = '';
    let idx = 0;
    for (const [cat, items] of Object.entries(groups)) {
      html += `<div class="cmd-section-label">${cat}</div>`;
      for (const item of items) {
        const activeClass = idx === activeIndex ? 'active' : '';
        const shortcutHtml = item.shortcut
          ? `<div class="cmd-item-shortcut"><kbd>${item.shortcut}</kbd></div>`
          : '';
        html += `
          <div class="cmd-item ${activeClass}" data-idx="${idx}" data-id="${item.id}">
            <div class="cmd-item-icon">${item.icon}</div>
            <div class="cmd-item-info">
              <div class="cmd-item-name">${item.name}</div>
              <div class="cmd-item-desc">${item.desc}</div>
            </div>
            ${shortcutHtml}
          </div>`;
        idx++;
      }
    }
    results.innerHTML = html;

    // Attach hover handlers
    results.querySelectorAll('.cmd-item').forEach(el => {
      el.addEventListener('mouseenter', () => {
        activeIndex = parseInt(el.dataset.idx);
        updateActive();
      });
      el.addEventListener('click', () => {
        executeCommand(el.dataset.id);
      });
    });
  }

  function updateActive() {
    results.querySelectorAll('.cmd-item').forEach((el, i) => {
      el.classList.toggle('active', parseInt(el.dataset.idx) === activeIndex);
    });
    // Scroll into view
    const activeEl = results.querySelector('.cmd-item.active');
    if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
  }

  function executeCommand(id) {
    const cmd = commands.find(c => c.id === id);
    if (cmd) {
      close();
      cmd.action();
    }
  }

  function open() {
    if (isOpen) return;
    isOpen = true;
    activeIndex = 0;
    overlay.classList.add('open');
    input.value = '';
    renderCommands();
    setTimeout(() => input.focus(), 50);
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    overlay.classList.remove('open');
    input.value = '';
  }

  // Keyboard navigation
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, filteredCommands.length - 1);
      updateActive();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      updateActive();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCommands[activeIndex]) {
        executeCommand(filteredCommands[activeIndex].id);
      }
    } else if (e.key === 'Escape') {
      close();
    }
  });

  // Search on input
  input.addEventListener('input', (e) => {
    activeIndex = 0;
    renderCommands(e.target.value);
  });

  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  // Global keyboard shortcut
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      if (isOpen) close();
      else open();
    }
  });

  // Expose API
  window.CommandPalette = { open, close };
})();
```

- [ ] **Step 2: Add script tag to chat.html**

Add before closing `</body>`:

```html
<script src="js/components/command-palette.js"></script>
```

- [ ] **Step 3: Run browser check to verify palette opens with Cmd+K**

- [ ] **Step 4: Commit**

```bash
git add public/js/components/command-palette.js public/chat.html
git commit -m "feat: add command palette with Cmd+K shortcut"
```

---

## Feature 2: Model Comparison

### File Structure

- Create: `public/js/components/model-compare.js`
- Modify: `public/css/main.css` (add compare styles)
- Modify: `public/chat.html` (add compare button and container)

### Task 2.1: Add Compare Button and Container HTML

**Files:**
- Modify: `public/chat.html`

- [ ] **Step 1: Add compare toggle button in topbar-right**

Add inside `.topbar-right` before the export button:

```html
<button class="tb-btn" id="compareToggleBtn" onclick="toggleCompareMode()" title="Compare Models (Cmd+M)">
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="1" y="3" width="6" height="10" rx="1" stroke="currentColor" stroke-width="1.2"/>
    <rect x="9" y="3" width="6" height="10" rx="1" stroke="currentColor" stroke-width="1.2"/>
  </svg>
</button>
```

- [ ] **Step 2: Add compare panel container before closing `</div>` of `#app`**

```html
<!-- ===== MODEL COMPARE PANEL ===== -->
<div class="compare-overlay" id="compareOverlay">
  <div class="compare-panel">
    <div class="compare-header">
      <h3>Compare Models</h3>
      <button class="settings-close" onclick="toggleCompareMode()">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
    <div class="compare-models">
      <div class="compare-slot" id="compareSlotA">
        <label>Model A</label>
        <select id="compareModelA" class="compare-select"></select>
      </div>
      <div class="compare-vs">VS</div>
      <div class="compare-slot" id="compareSlotB">
        <label>Model B</label>
        <select id="compareModelB" class="compare-select"></select>
      </div>
    </div>
    <div class="compare-prompt-area">
      <textarea id="comparePrompt" class="compare-textarea" placeholder="Enter a prompt to compare both models..." rows="3"></textarea>
      <button class="btn-primary" onclick="runComparison()">Compare</button>
    </div>
    <div class="compare-results" id="compareResults">
      <div class="compare-col" id="compareResultA">
        <div class="compare-col-header">Model A</div>
        <div class="compare-col-content"></div>
      </div>
      <div class="compare-col" id="compareResultB">
        <div class="compare-col-header">Model B</div>
        <div class="compare-col-content"></div>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add public/chat.html
git commit -m "feat: add model comparison HTML structure"
```

---

### Task 2.2: Add Compare Panel CSS

**Files:**
- Modify: `public/css/main.css`

- [ ] **Step 1: Add compare panel styles**

```css
/* ===== Model Compare Panel ===== */
.compare-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(8px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
}

.compare-overlay.open {
  opacity: 1;
  pointer-events: all;
}

.compare-panel {
  width: 900px;
  max-width: 95vw;
  max-height: 85vh;
  background: var(--glass-bg);
  backdrop-filter: blur(20px);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.3);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transform: scale(0.95);
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.compare-overlay.open .compare-panel {
  transform: scale(1);
}

.compare-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
}

.compare-header h3 {
  font-size: 15px;
  font-weight: 600;
}

.compare-models {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
}

.compare-slot {
  flex: 1;
}

.compare-slot label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.compare-select {
  width: 100%;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  background: var(--input-bg);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 12px;
  outline: none;
  cursor: pointer;
  transition: var(--transition);
}

.compare-select:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-glow);
}

.compare-vs {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-muted);
  padding: 0 8px;
}

.compare-prompt-area {
  display: flex;
  gap: 10px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
}

.compare-textarea {
  flex: 1;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  background: var(--input-bg);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 13px;
  resize: none;
  outline: none;
  transition: var(--transition);
}

.compare-textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-glow);
}

.compare-results {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.compare-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border-color);
  overflow: hidden;
}

.compare-col:last-child {
  border-right: none;
}

.compare-col-header {
  padding: 10px 16px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--tag-bg);
  border-bottom: 1px solid var(--border-color);
}

.compare-col-content {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-primary);
}

.compare-col-content .thinking-indicator {
  padding: 8px 0;
}
```

- [ ] **Step 2: Commit**

```bash
git add public/css/main.css
git commit -m "feat: add model comparison panel CSS"
```

---

### Task 2.3: Create Model Comparison JavaScript

**Files:**
- Create: `public/js/components/model-compare.js`

- [ ] **Step 1: Create model-compare.js**

```javascript
// ===== Model Comparison Panel =====
(function() {
  const overlay = document.getElementById('compareOverlay');
  let isOpen = false;
  let models = [];

  async function loadModels() {
    try {
      const resp = await fetch('/api/models');
      const data = await resp.json();
      models = data.models || [];
      populateSelects();
    } catch (e) {
      console.warn('Failed to load models:', e);
    }
  }

  function populateSelects() {
    const selA = document.getElementById('compareModelA');
    const selB = document.getElementById('compareModelB');
    const currentModel = state.get('agentModel') || '';

    const options = models.map(m => {
      const name = m.name || m.id.split('/').pop();
      const selected = m.id === currentModel ? 'selected' : '';
      return `<option value="${m.id}" ${selected}>${name}</option>`;
    }).join('');

    // Add auto-select option
    const autoOption = `<option value="">Auto-Select</option>`;

    selA.innerHTML = autoOption + options;
    selB.innerHTML = autoOption + options;

    // Default B to a different model
    if (models.length > 1) {
      selB.selectedIndex = 2;
    }
  }

  window.toggleCompareMode = function() {
    isOpen = !isOpen;
    overlay.classList.toggle('open', isOpen);
    if (isOpen) {
      loadModels();
      document.getElementById('compareResults').innerHTML = '';
    }
  };

  window.runComparison = async function() {
    const prompt = document.getElementById('comparePrompt').value.trim();
    if (!prompt) {
      showToast('Please enter a prompt to compare', 'warning');
      return;
    }

    const modelA = document.getElementById('compareModelA').value;
    const modelB = document.getElementById('compareModelB').value;

    const colA = document.getElementById('compareResultA').querySelector('.compare-col-content');
    const colB = document.getElementById('compareResultB').querySelector('.compare-col-content');

    // Reset columns
    colA.innerHTML = '<div class="thinking-indicator"><div class="thinking-dots"><span></span><span></span><span></span></div><span class="thinking-text">Generating...</span></div>';
    colB.innerHTML = '<div class="thinking-indicator"><div class="thinking-dots"><span></span><span></span><span></span></div><span class="thinking-text">Generating...</span></div>';

    // Update headers
    const nameA = modelA ? models.find(m => m.id === modelA)?.name || modelA.split('/').pop() : 'Auto-Select';
    const nameB = modelB ? models.find(m => m.id === modelB)?.name || modelB.split('/').pop() : 'Auto-Select';
    document.getElementById('compareResultA').querySelector('.compare-col-header').textContent = nameA;
    document.getElementById('compareResultB').querySelector('.compare-col-header').textContent = nameB;

    // Send both requests in parallel
    const history = [{ role: 'user', content: prompt }];

    const runModel = async (model, col) => {
      let text = '';
      AgentAPI.send(prompt, history, {}, {
        model: model || undefined,
        onUpdate: (data) => {
          if (data.type === 'token') {
            text += data.content || '';
            col.innerHTML = formatMessageHtml(text);
          } else if (data.type === 'model_info') {
            const modelName = data.modelName || data.model?.split('/').pop();
            col.innerHTML = `<div class="thinking-indicator"><div class="thinking-dots"><span></span><span></span><span></span></div><span class="thinking-text">Using ${modelName}...</span></div>`;
          }
        },
        onDone: () => {
          if (text) col.innerHTML = formatMessageHtml(text);
        },
        onError: (err) => {
          col.innerHTML = `<div style="color: var(--danger);">Error: ${err}</div>`;
        }
      });
    };

    await Promise.all([
      runModel(modelA, colA),
      runModel(modelB, colB)
    ]);
  };

  // Keyboard shortcut
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'm') {
      e.preventDefault();
      toggleCompareMode();
    }
  });
})();
```

- [ ] **Step 2: Add script tag to chat.html**

```html
<script src="js/components/model-compare.js"></script>
```

- [ ] **Step 3: Commit**

```bash
git add public/js/components/model-compare.js public/chat.html
git commit -m "feat: add model comparison panel with split-view"
```

---

## Feature 3: Drag & Drop Upload Enhancement

### File Structure

- Modify: `public/js/app.js` (enhance existing drag-drop)
- Modify: `public/css/main.css` (add drop zone overlay styles)

### Task 3.1: Add Drop Zone Overlay Styles

**Files:**
- Modify: `public/css/main.css`

- [ ] **Step 1: Add drop zone overlay styles**

```css
/* ===== Drag & Drop Overlay ===== */
.dropzone-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
}

.dropzone-overlay.visible {
  opacity: 1;
  pointer-events: all;
}

.dropzone-box {
  width: 400px;
  padding: 48px 32px;
  border: 3px dashed var(--accent);
  border-radius: var(--radius-lg);
  background: var(--glass-bg);
  backdrop-filter: blur(20px);
  text-align: center;
  transform: scale(0.95);
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.dropzone-overlay.visible .dropzone-box {
  transform: scale(1);
}

.dropzone-icon {
  width: 64px;
  height: 64px;
  margin: 0 auto 16px;
  border-radius: 50%;
  background: var(--accent-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent);
}

.dropzone-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.dropzone-desc {
  font-size: 13px;
  color: var(--text-muted);
  margin-bottom: 16px;
}

.dropzone-formats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
}

.dropzone-format {
  padding: 4px 10px;
  border-radius: 6px;
  background: var(--tag-bg);
  font-size: 10px;
  font-weight: 500;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

/* Paste preview thumbnail */
.paste-preview {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 9998;
  padding: 8px;
  border-radius: var(--radius-md);
  background: var(--glass-bg);
  backdrop-filter: blur(16px);
  border: 1px solid var(--glass-border);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  animation: paste-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes paste-in {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.9);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.paste-preview img {
  width: 120px;
  height: 120px;
  object-fit: cover;
  border-radius: var(--radius-sm);
}

.paste-preview-name {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 6px;
  text-align: center;
}
```

- [ ] **Step 2: Commit**

```bash
git add public/css/main.css
git commit -m "feat: add drag-and-drop overlay and paste preview styles"
```

---

### Task 3.2: Enhance Drag & Drop and Add Clipboard Paste

**Files:**
- Modify: `public/js/app.js`

- [ ] **Step 1: Add dropzone overlay HTML to chat.html**

Add before the toast container:

```html
<!-- ===== DROP ZONE OVERLAY ===== -->
<div class="dropzone-overlay" id="dropzoneOverlay">
  <div class="dropzone-box">
    <div class="dropzone-icon">
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <path d="M16 6v14M10 14l6 6 6-6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M6 22v2a2 2 0 002 2h16a2 2 0 002-2v-2" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
      </svg>
    </div>
    <div class="dropzone-title">Drop files here</div>
    <div class="dropzone-desc">Images, documents, and code files supported</div>
    <div class="dropzone-formats">
      <span class="dropzone-format">PNG</span>
      <span class="dropzone-format">JPG</span>
      <span class="dropzone-format">PDF</span>
      <span class="dropzone-format">TXT</span>
      <span class="dropzone-format">JS</span>
      <span class="dropzone-format">PY</span>
      <span class="dropzone-format">MD</span>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Enhance setupDragDrop() in app.js**

Replace the existing `setupDragDrop` function with:

```javascript
function setupDragDrop() {
  const chatArea = document.getElementById('chatMessages');
  const dropzone = document.getElementById('dropzoneOverlay');
  let dragCounter = 0;

  // Enhanced drag over with overlay
  chatArea.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    if (e.dataTransfer.types.includes('Files')) {
      dropzone.classList.add('visible');
    }
  });

  chatArea.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter === 0) {
      dropzone.classList.remove('visible');
    }
  });

  chatArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });

  chatArea.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    dropzone.classList.remove('visible');
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    handleDroppedFiles(files);
  });

  // Also handle drop on the entire window
  document.body.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  document.body.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    dropzone.classList.remove('visible');
  });

  // Close dropzone on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dropzone.classList.contains('visible')) {
      dropzone.classList.remove('visible');
    }
  });

  // Clipboard paste (Ctrl+V / Cmd+V)
  document.addEventListener('paste', (e) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imageItems = items.filter(i => i.type.startsWith('image/'));

    if (imageItems.length > 0) {
      e.preventDefault();
      for (const item of imageItems) {
        const blob = item.getAsFile();
        if (blob) handlePastedImage(blob);
      }
    }
  });
}

function handleDroppedFiles(files) {
  const dt = new DataTransfer();
  for (const f of files) dt.items.add(f);
  const fileInput = document.getElementById('fileInput');
  fileInput.files = dt.files;
  fileInput.dispatchEvent(new Event('change'));
}

function handlePastedImage(blob) {
  // Create a preview thumbnail
  const reader = new FileReader();
  reader.onload = (ev) => {
    const dataUrl = ev.target.result;
    const fileName = `pasted-image-${Date.now()}.png`;

    // Show paste preview
    showPastePreview(dataUrl, fileName);

    // Add to attached files
    attachedFiles.push({
      name: fileName,
      size: blob.size,
      type: 'image',
      data: dataUrl,
      file: blob
    });
    renderAttachments();
    showToast('Image pasted from clipboard', 'success', 2000);
  };
  reader.readAsDataURL(blob);
}

function showPastePreview(dataUrl, fileName) {
  // Remove existing preview
  const existing = document.querySelector('.paste-preview');
  if (existing) existing.remove();

  const preview = document.createElement('div');
  preview.className = 'paste-preview';
  preview.innerHTML = `
    <img src="${dataUrl}" alt="Pasted image">
    <div class="paste-preview-name">${fileName}</div>
  `;
  document.body.appendChild(preview);

  // Auto-remove after 3 seconds
  setTimeout(() => {
    preview.style.opacity = '0';
    preview.style.transition = 'opacity 0.2s ease';
    setTimeout(() => preview.remove(), 200);
  }, 3000);
}
```

- [ ] **Step 3: Update setupFileInput to call setupDragDrop**

In the existing `setupFileInput` function, add at the end:

```javascript
// Initialize enhanced drag & drop
setupDragDrop();
```

- [ ] **Step 4: Commit**

```bash
git add public/js/app.js public/css/main.css public/chat.html
git commit -m "feat: enhance drag-drop with overlay and add clipboard paste"
```

---

## Feature 4: Skeleton Loading States

### File Structure

- Modify: `public/js/app.js` (add skeleton rendering)
- Modify: `public/css/main.css` (add skeleton styles)

### Task 4.1: Add Skeleton Styles

**Files:**
- Modify: `public/css/main.css`

- [ ] **Step 1: Add skeleton loading styles**

```css
/* ===== Skeleton Loading States ===== */
.skeleton-msg {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
}

.skeleton-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--tag-bg);
  flex-shrink: 0;
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}

.skeleton-body {
  flex: 1;
  min-width: 0;
}

.skeleton-name {
  width: 80px;
  height: 12px;
  border-radius: 4px;
  background: var(--tag-bg);
  margin-bottom: 8px;
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}

.skeleton-lines {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skeleton-line {
  height: 14px;
  border-radius: 4px;
  background: var(--tag-bg);
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}

.skeleton-line:nth-child(1) { width: 100%; }
.skeleton-line:nth-child(2) { width: 90%; }
.skeleton-line:nth-child(3) { width: 75%; }
.skeleton-line:nth-child(4) { width: 60%; }

@keyframes skeleton-pulse {
  0%, 100% {
    opacity: 0.4;
  }
  50% {
    opacity: 0.7;
  }
}

/* Code block skeleton */
.skeleton-code {
  width: 100%;
  height: 80px;
  border-radius: var(--radius-sm);
  background: var(--tag-bg);
  margin-top: 8px;
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}

/* Image skeleton */
.skeleton-image {
  width: 200px;
  height: 200px;
  border-radius: var(--radius-md);
  background: var(--tag-bg);
  margin-top: 8px;
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}
```

- [ ] **Step 2: Commit**

```bash
git add public/css/main.css
git commit -m "feat: add skeleton loading animation styles"
```

---

### Task 4.2: Add Skeleton Rendering Function

**Files:**
- Modify: `public/js/app.js`

- [ ] **Step 1: Add skeleton helper function**

Add after the `setupDragDrop` function:

```javascript
// ===== Skeleton Loading States =====
function createSkeletonMessage() {
  const div = document.createElement('div');
  div.className = 'skeleton-msg';
  div.id = 'skeletonLoader';
  div.innerHTML = `
    <div class="skeleton-avatar"></div>
    <div class="skeleton-body">
      <div class="skeleton-name"></div>
      <div class="skeleton-lines">
        <div class="skeleton-line"></div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line"></div>
      </div>
    </div>
  `;
  return div;
}

function showSkeletonLoader() {
  const container = document.getElementById('agentMessages');
  // Remove existing skeleton if any
  removeSkeletonLoader();
  const skeleton = createSkeletonMessage();
  container.appendChild(skeleton);
  scrollToBottom(container);
}

function removeSkeletonLoader() {
  const existing = document.getElementById('skeletonLoader');
  if (existing) existing.remove();
}
```

- [ ] **Step 2: Add skeleton to sendToAgent flow**

In the `sendToAgent` function, replace the thinking indicator creation with:

```javascript
// Show skeleton loader while waiting for first token
showSkeletonLoader();
const thinkingDiv = document.createElement("div");
thinkingDiv.className = "msg msg-agent";
thinkingDiv.style.display = "none"; // Hidden until first token
```

- [ ] **Step 3: Modify token handler to swap skeleton for streaming content**

In the `case "token":` handler, replace the first-token logic:

```javascript
case "token":
  if (!thinkingDiv.dataset.streaming) {
    // First token — remove skeleton, show streaming content
    removeSkeletonLoader();
    thinkingDiv.style.display = "";
    thinkingDiv.dataset.streaming = "true";
    _streamText = "";
    bubble.innerHTML = `<div class="msg-name">${escHtml(modelName || "Dubu AI")}</div><div class="msg-content streaming"><div class="streaming-text"></div><span class="streaming-cursor">▊</span></div>`;
  }
  _streamText += data.content || "";
  const streamTextEl = bubble.querySelector(".streaming-text");
  if (streamTextEl) {
    streamTextEl.innerHTML = formatMessageHtml(_streamText);
  }
  scrollToBottom();
  break;
```

- [ ] **Step 4: Remove skeleton on error**

In the `case "error":` handler, add at the start:

```javascript
case "error":
  removeSkeletonLoader();
  thinkingDiv.remove();
  // ... rest of error handling
```

- [ ] **Step 5: Commit**

```bash
git add public/js/app.js
git commit -m "feat: add skeleton loading states during generation"
```

---

## Feature 5: Export Options Panel

### File Structure

- Modify: `public/js/app.js` (add export dropdown)
- Modify: `public/css/main.css` (add dropdown styles)

### Task 5.1: Add Export Dropdown Styles

**Files:**
- Modify: `public/css/main.css`

- [ ] **Step 1: Add export dropdown styles**

```css
/* ===== Export Dropdown ===== */
.export-wrapper {
  position: relative;
}

.export-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  width: 200px;
  background: var(--glass-bg);
  backdrop-filter: blur(20px);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  box-shadow:
    0 12px 48px rgba(0, 0, 0, 0.2),
    0 4px 12px rgba(0, 0, 0, 0.1);
  padding: 6px;
  z-index: 100;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-4px) scale(0.98);
  transition: all 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.export-dropdown.open {
  opacity: 1;
  pointer-events: all;
  transform: translateY(0) scale(1);
}

.export-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--radius-xs);
  cursor: pointer;
  transition: all 0.1s ease;
  font-size: 12px;
  color: var(--text-secondary);
}

.export-item:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}

.export-item-icon {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  background: var(--tag-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 12px;
}

.export-item:hover .export-item-icon {
  background: var(--accent-muted);
  color: var(--accent);
}

.export-item-text {
  flex: 1;
}

.export-item-desc {
  font-size: 10px;
  color: var(--text-muted);
}
```

- [ ] **Step 2: Commit**

```bash
git add public/css/main.css
git commit -m "feat: add export dropdown menu styles"
```

---

### Task 5.2: Replace Export Button with Dropdown

**Files:**
- Modify: `public/chat.html`
- Modify: `public/js/app.js`

- [ ] **Step 1: Replace the export button in chat.html**

Replace the existing export button:

```html
<!-- Old -->
<button class="tb-btn" onclick="exportConversation()" title="Export conversation as Markdown">
  <svg ...></svg>
</button>

<!-- New -->
<div class="export-wrapper">
  <button class="tb-btn" id="exportBtn" onclick="toggleExportDropdown()" title="Export options">
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3 10v2a1 1 0 001 1h8a1 1 0 001-1v-2M8 3v6M5.5 6.5L8 9l2.5-2.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </button>
  <div class="export-dropdown" id="exportDropdown">
    <div class="export-item" onclick="exportConversation()">
      <div class="export-item-icon">📄</div>
      <div class="export-item-text">
        <div>Markdown</div>
        <div class="export-item-desc">Download as .md file</div>
      </div>
    </div>
    <div class="export-item" onclick="exportAsJSON()">
      <div class="export-item-icon">📋</div>
      <div class="export-item-text">
        <div>JSON</div>
        <div class="export-item-desc">Download as .json file</div>
      </div>
    </div>
    <div class="export-item" onclick="copyConversationToClipboard()">
      <div class="export-item-icon">📎</div>
      <div class="export-item-text">
        <div>Copy to Clipboard</div>
        <div class="export-item-desc">Copy all messages</div>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Add export functions to app.js**

Add after the existing `exportConversation` function:

```javascript
// ===== Export Options =====
window.toggleExportDropdown = function() {
  const dropdown = document.getElementById('exportDropdown');
  const isOpen = dropdown.classList.contains('open');
  
  // Close all dropdowns first
  document.querySelectorAll('.export-dropdown').forEach(d => d.classList.remove('open'));
  
  if (!isOpen) {
    dropdown.classList.add('open');
    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', closeExportDropdown, { once: true });
    }, 0);
  }
};

function closeExportDropdown(e) {
  const dropdown = document.getElementById('exportDropdown');
  const wrapper = document.querySelector('.export-wrapper');
  if (!wrapper.contains(e.target)) {
    dropdown.classList.remove('open');
  }
}

window.exportAsJSON = function() {
  const data = {
    conversation: {
      id: currentConversationId,
      title: document.querySelector('.topbar-model-label')?.textContent || 'Conversation',
      exported: new Date().toISOString()
    },
    messages: agentHistory.map(msg => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp || null
    }))
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dubu-conversation-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Exported as JSON', 'success', 2000);
};

window.copyConversationToClipboard = async function() {
  const text = agentHistory.map(msg => {
    const role = msg.role === 'user' ? 'You' : 'Dubu AI';
    return `**${role}:**\n${msg.content}`;
  }).join('\n\n---\n\n');

  try {
    await navigator.clipboard.writeText(text);
    showToast('Conversation copied to clipboard', 'success', 2000);
  } catch (e) {
    showToast('Failed to copy to clipboard', 'error');
  }
};

// Close dropdown on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.export-dropdown').forEach(d => d.classList.remove('open'));
  }
});
```

- [ ] **Step 3: Commit**

```bash
git add public/js/app.js public/chat.html
git commit -m "feat: add export options dropdown with JSON and clipboard"
```

---

## Final Validation

### Task 6.1: Run Browser Check

**Files:**
- All modified files

- [ ] **Step 1: Verify all features work in browser**

1. Open http://localhost:3033/chat.html
2. Test Cmd+K command palette
3. Test Cmd+M model comparison
4. Test drag-and-drop file upload
5. Test Ctrl+V image paste
6. Test skeleton loading during generation
7. Test export dropdown options

- [ ] **Step 2: Fix any issues found**

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete UI enhancement suite (palette, compare, drag-drop, skeletons, export)"
```

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-18-dubu-ai-ui-features.md`.**

**Two execution options:**

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
