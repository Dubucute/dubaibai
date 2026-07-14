// ===== Shared Tool Page Logic =====

// Set theme on load
(function() {
  const theme = localStorage.getItem('dubu_theme') || 'dark';
  document.documentElement.className = 'theme-' + theme;
})();

// ── Option buttons ──
document.querySelectorAll('.tool-option-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const group = btn.closest('.tool-options');
    if (group) {
      group.querySelectorAll('.tool-option-btn').forEach(b => b.classList.remove('active'));
    }
    btn.classList.add('active');
  });
});

// ── Copy result ──
window.copyResult = function() {
  const box = document.querySelector('.result-box');
  if (!box) return;
  navigator.clipboard.writeText(box.textContent).then(() => {
    const btn = document.querySelector('.result-action-btn');
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => btn.textContent = orig, 1500);
    }
  });
};

// ── Send to Chat ──
window.sendToChat = function(prefix) {
  const box = document.querySelector('.result-box');
  if (!box) return;
  const text = box.textContent;
  const msg = prefix ? `${prefix}\n\n${text}` : text;
  localStorage.setItem('dubu_tool_transfer', msg);
  window.location.href = 'index.html';
};

// ── Call NIM API ──
window.callNIM = async function(systemPrompt, userMessage, options = {}) {
  const model = options.model || 'nvidia/llama-3.3-nemotron-super-49b-v1.5';
  const temperature = options.temperature || 0.7;

  try {
    const resp = await fetch('/api/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature,
        max_tokens: options.maxTokens || 2048,
        stream: false
      })
    });

    if (!resp.ok) throw new Error(`API error: ${resp.status}`);
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || 'No response received.';
  } catch (e) {
    throw new Error('Failed to get AI response: ' + e.message);
  }
};

// ── Show/hide helpers ──
window.showLoading = function() {
  document.querySelector('.tool-loading')?.classList.add('visible');
  document.querySelector('.tool-result')?.classList.remove('visible');
};

window.hideLoading = function() {
  document.querySelector('.tool-loading')?.classList.remove('visible');
};

window.showResult = function(text) {
  const box = document.querySelector('.result-box');
  if (box) box.textContent = text;
  document.querySelector('.tool-result')?.classList.add('visible');
};

window.showError = function(msg) {
  showResult('Error: ' + msg);
};

// ── Custom Alert Modal ──
window.showAlert = function(message, title) {
  return new Promise((resolve) => {
    title = title || 'Alert';

    // Remove any existing alert
    const existing = document.querySelector('.custom-alert-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'custom-alert-overlay';
    overlay.innerHTML = `
      <div class="custom-alert-dialog" role="alertdialog" aria-labelledby="alertDialogTitle">
        <div class="custom-alert-header">
          <span class="custom-alert-title" id="alertDialogTitle">${escHtmlSafe(title)}</span>
          <button class="custom-alert-close" aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
        <div class="custom-alert-body">
          <div class="custom-alert-message">${escHtmlSafe(message)}</div>
        </div>
        <div class="custom-alert-footer">
          <button class="custom-alert-ok-btn">OK</button>
        </div>
      </div>
    `;

    const dialog = overlay.querySelector('.custom-alert-dialog');
    const okBtn = overlay.querySelector('.custom-alert-ok-btn');
    const closeBtn = overlay.querySelector('.custom-alert-close');

    function close() {
      document.removeEventListener('keydown', onKey);
      overlay.classList.remove('open');
      dialog.addEventListener('transitionend', function onEnd() {
        dialog.removeEventListener('transitionend', onEnd);
        overlay.remove();
        resolve();
      }, { once: true });
      // Fallback if transition doesn't fire
      setTimeout(() => {
        if (overlay.parentNode) {
          overlay.remove();
          resolve();
        }
      }, 300);
    }

    okBtn.addEventListener('click', close);
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    var onKey = function onKey(e) {
      if (e.key === 'Enter' || e.key === 'Escape') {
        document.removeEventListener('keydown', onKey);
        close();
      }
    };
    document.addEventListener('keydown', onKey);

    document.body.appendChild(overlay);
    // Trigger layout then animate in
    requestAnimationFrame(() => {
      overlay.classList.add('open');
    });
    okBtn.focus();
  });
};

// ── Custom Confirm Modal ──
window.showConfirm = function(message, title) {
  return new Promise((resolve) => {
    title = title || 'Confirm';

    const existing = document.querySelector('.custom-alert-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'custom-alert-overlay';
    overlay.innerHTML = `
      <div class="custom-alert-dialog" role="alertdialog" aria-labelledby="confirmDialogTitle">
        <div class="custom-alert-header">
          <span class="custom-alert-title" id="confirmDialogTitle">${escHtmlSafe(title)}</span>
          <button class="custom-alert-close" aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
        <div class="custom-confirm-body">
          <div class="custom-confirm-message">${escHtmlSafe(message)}</div>
        </div>
        <div class="custom-confirm-footer">
          <button class="custom-alert-cancel-btn" id="confirmCancelBtn">Cancel</button>
          <button class="custom-alert-ok-btn" id="confirmOkBtn">OK</button>
        </div>
      </div>
    `;

    const dialog = overlay.querySelector('.custom-alert-dialog');
    const okBtn = overlay.querySelector('#confirmOkBtn');
    const cancelBtn = overlay.querySelector('#confirmCancelBtn');
    const closeBtn = overlay.querySelector('.custom-alert-close');

    function closeWith(result) {
      document.removeEventListener('keydown', onKey);
      overlay.classList.remove('open');
      dialog.addEventListener('transitionend', function onEnd() {
        dialog.removeEventListener('transitionend', onEnd);
        overlay.remove();
        resolve(result);
      }, { once: true });
      setTimeout(() => {
        if (overlay.parentNode) {
          overlay.remove();
          resolve(result);
        }
      }, 300);
    }

    okBtn.addEventListener('click', () => closeWith(true));
    cancelBtn.addEventListener('click', () => closeWith(false));
    closeBtn.addEventListener('click', () => closeWith(false));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeWith(false); });
    var onKey = function onKey(e) {
      if (e.key === 'Enter') {
        document.removeEventListener('keydown', onKey);
        closeWith(true);
      } else if (e.key === 'Escape') {
        document.removeEventListener('keydown', onKey);
        closeWith(false);
      }
    };
    document.addEventListener('keydown', onKey);

    document.body.appendChild(overlay);
    requestAnimationFrame(() => {
      overlay.classList.add('open');
      cancelBtn.focus();
    });
  });
};

// ── Custom Prompt Modal ──
window.showPrompt = function(message, defaultValue, title) {
  return new Promise((resolve) => {
    title = title || 'Input';
    defaultValue = defaultValue ?? '';

    const existing = document.querySelector('.custom-alert-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'custom-alert-overlay';
    overlay.innerHTML = `
      <div class="custom-alert-dialog custom-prompt-dialog" role="alertdialog" aria-labelledby="promptDialogTitle">
        <div class="custom-alert-header">
          <span class="custom-alert-title" id="promptDialogTitle">${escHtmlSafe(title)}</span>
          <button class="custom-alert-close" aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
        <div class="custom-confirm-body">
          <div class="custom-confirm-message">${escHtmlSafe(message)}</div>
          <input class="custom-prompt-input" id="promptInput" type="text" value="${escHtmlSafe(defaultValue)}" placeholder="Type your answer..." autocomplete="off">
        </div>
        <div class="custom-confirm-footer">
          <button class="custom-alert-cancel-btn" id="promptCancelBtn">Cancel</button>
          <button class="custom-alert-ok-btn" id="promptOkBtn">OK</button>
        </div>
      </div>
    `;

    const dialog = overlay.querySelector('.custom-alert-dialog');
    const okBtn = overlay.querySelector('#promptOkBtn');
    const cancelBtn = overlay.querySelector('#promptCancelBtn');
    const closeBtn = overlay.querySelector('.custom-alert-close');
    const input = overlay.querySelector('#promptInput');

    function closeWith(result) {
      document.removeEventListener('keydown', onKey);
      overlay.classList.remove('open');
      dialog.addEventListener('transitionend', function onEnd() {
        dialog.removeEventListener('transitionend', onEnd);
        overlay.remove();
        resolve(result);
      }, { once: true });
      setTimeout(() => {
        if (overlay.parentNode) {
          overlay.remove();
          resolve(result);
        }
      }, 300);
    }

    okBtn.addEventListener('click', () => closeWith(input.value));
    cancelBtn.addEventListener('click', () => closeWith(null));
    closeBtn.addEventListener('click', () => closeWith(null));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeWith(null); });
    var onKey = function onKey(e) {
      if (e.key === 'Enter') {
        document.removeEventListener('keydown', onKey);
        closeWith(input.value);
      } else if (e.key === 'Escape') {
        document.removeEventListener('keydown', onKey);
        closeWith(null);
      }
    };
    document.addEventListener('keydown', onKey);

    document.body.appendChild(overlay);
    requestAnimationFrame(() => {
      overlay.classList.add('open');
      input.focus();
      input.select();
    });
  });
};

function escHtmlSafe(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Convert markdown to HTML for safe innerHTML rendering ──
window.mdToHtml = function(text) {
  let s = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  // Bold (**text**)
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic (*text* but not **)
  s = s.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
  // Inline code
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Links
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  // Headings
  s = s.replace(/^### (.+)$/gm, '<h5>$1</h5>');
  s = s.replace(/^## (.+)$/gm, '<h4>$1</h4>');
  s = s.replace(/^# (.+)$/gm, '<h3>$1</h3>');
  return s;
};
