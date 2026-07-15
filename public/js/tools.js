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

// ── Markdown renderer for tool results ──
window.renderMarkdown = function(text) {
  let html = text;

  // Phase 1: Extract code/reasoning blocks BEFORE HTML escaping
  const blocks = [];
  html = html.replace(/```reasoning\s*\n([\s\S]*?)```/g, (m, r) => {
    const idx = blocks.length;
    blocks.push({ type: 'collapsible', title: 'Show reasoning', content: r.trim() });
    return `%%BLOCK_${idx}%%`;
  });
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (m, lang, code) => {
    const idx = blocks.length;
    blocks.push({ type: 'code', lang: lang || 'code', code: code });
    return `%%BLOCK_${idx}%%`;
  });

  // Phase 2: HTML-escape remaining text (blocks are safe placeholders)
  html = escHtml(html);

  // Phase 3: Markdown processing on non-block text
  // Blockquotes — use &gt; since text is HTML-escaped
  html = html.replace(/((?:^|\n)(?:&gt;\s?[^\n]*)+)/g, (m) => {
    const lines = m.trim().split('\n');
    const inner = lines.map(l => l.replace(/^&gt;\s?/, '').trim()).join('<br>');
    return '\n<blockquote>' + inner + '</blockquote>\n';
  });

  // Tables
  html = html.replace(/((?:^|\n)(?:\s*\|[^\n]*\|[\s]*\n?)+)/g, (m, tableBlock) => {
    const rows = tableBlock.trim().split('\n').filter(r => r.trim().startsWith('|'));
    if (rows.length < 2) return m;
    const parsed = rows.map(row => row.trim().split('|').filter(c => c.trim() !== '').map(c => c.trim()));
    const sepRow = parsed[1];
    if (!sepRow || sepRow.length < 2 || !sepRow.every(c => /^-+\s*$/.test(c))) return m;
    let tbl = '<table><thead><tr>';
    parsed[0].forEach(c => { tbl += '<th>' + c + '</th>'; });
    tbl += '</tr></thead><tbody>';
    for (let i = 2; i < parsed.length; i++) {
      tbl += '<tr>'; parsed[i].forEach(c => { tbl += '<td>' + c + '</td>'; }); tbl += '</tr>';
    }
    tbl += '</tbody></table>';
    return '\n' + tbl + '\n';
  });

  // Task lists
  html = html.replace(/^- \[([ x])\] ([^\n]*)/gm, (m, checked, text) => {
    const done = checked === 'x';
    return '<div class="task-item' + (done ? ' done' : '') + '">' +
      '<input type="checkbox"' + (done ? ' checked' : '') + ' disabled>' +
      '<span>' + text.trim() + '</span></div>';
  });

  // Headers
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

  // Horizontal rules
  html = html.replace(/^(?:[-*_=]){3,}\s*$/gm, '<hr>');

  // Unordered lists
  html = html.replace(/(?:^|\n)([*-])\s+([^\n]+)((?:\n\1\s+[^\n]+)*)/g, (match, marker, first, rest) => {
    const items = [first, ...rest.split('\n').filter(Boolean).map(l => l.replace(/^[*-]\s+/, ''))];
    return '<ul>' + items.map(c => '<li>' + c + '</li>').join('') + '</ul>';
  });

  // Ordered lists
  html = html.replace(/(?:^|\n)\d+\.\s+([^\n]+)((?:\n\d+\.\s+[^\n]+)*)/g, (match, first, rest) => {
    const items = [first, ...rest.split('\n').filter(Boolean).map(l => l.replace(/^\d+\.\s+/, ''))];
    return '<ol>' + items.map(c => '<li>' + c + '</li>').join('') + '</ol>';
  });

  // Inline images
  html = html.replace(/!\[(.*?)\]\((.*?)\)/g, (m, alt, src) => {
    if (src.startsWith('data:') || src.startsWith('http'))
      return '<img src="' + src + '" alt="' + alt + '" style="max-width:100%;border-radius:8px;margin:8px 0">';
    return m;
  });

  // Markdown links (before bold so ** doesn't break them)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, bracket, paren) => {
    const cleanB = bracket.replace(/\*\*/g, '').replace(/\*/g, '');
    const cleanP = paren.replace(/\*\*/g, '').replace(/\*/g, '');
    if (cleanP.startsWith('http') || cleanP.startsWith('#'))
      return '<a href="' + cleanP + '" target="_blank" rel="noopener" style="color:var(--accent,#818cf8);text-decoration:underline">' + cleanB + '</a>';
    if (cleanB.startsWith('http'))
      return '<a href="' + cleanB + '" target="_blank" rel="noopener" style="color:var(--accent,#818cf8);text-decoration:underline">' + cleanP + '</a>';
    return m;
  });

  // Bare URLs
  html = html.replace(/(https?:\/\/[^\s<"'>]+)/g,
    '<a href="$1" target="_blank" rel="noopener" style="color:var(--accent,#818cf8);text-decoration:underline">$1</a>');

  // Bold/Italic/Inline code
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/~~(.*?)~~/g, '<del>$1</del>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Newlines to <br>
  html = html.replace(/\n/g, '<br>');

  // Phase 4: Restore blocks (content already raw, needs HTML-escaping)
  html = html.replace(/%%BLOCK_(\d+)%%/g, (m, idx) => {
    const block = blocks[parseInt(idx)];
    if (!block) return m;
    if (block.type === 'collapsible') {
      return '<details style="margin:12px 0;background:var(--surface-bg,rgba(15,15,20,0.4));border-radius:8px;border:1px solid var(--border-color,rgba(255,255,255,0.06));padding:8px 12px">' +
        '<summary style="cursor:pointer;font-weight:600;color:var(--accent,#818cf8)">' + block.title + '</summary>' +
        '<div style="margin-top:8px;white-space:pre-wrap">' + escHtml(block.content) + '</div></details>';
    }
    if (block.type === 'code') {
      return '<pre style="background:rgba(0,0,0,0.3);border-radius:8px;padding:16px;overflow-x:auto;font-size:13px;line-height:1.5;border:1px solid var(--border-color,rgba(255,255,255,0.06))"><code>' +
        escHtml(block.code) + '</code></pre>';
    }
    return m;
  });

  return html;
};

function escHtml(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

window.showLoading = function() {
  document.querySelector('.tool-loading')?.classList.add('visible');
  document.querySelector('.tool-result')?.classList.remove('visible');
};

window.hideLoading = function() {
  document.querySelector('.tool-loading')?.classList.remove('visible');
};

window.showResult = function(text) {
  const box = document.querySelector('.result-box');
  if (box) {
    box.innerHTML = renderMarkdown(text);
  }
  document.querySelector('.tool-result')?.classList.add('visible');
  updateResultWordCount(text);
};

// ── Update word count to reflect result text instead of user input ──
window.updateResultWordCount = function(text) {
  const wc = document.getElementById('wordCount');
  if (!wc) return;
  const trimmed = (text || '').trim();
  if (wc.textContent.includes('cards')) {
    const qMatch = trimmed.match(/\*\*Card \d+/gi);
    const qCount = qMatch ? qMatch.length : (trimmed ? 1 : 0);
    wc.textContent = qCount + ' card' + (qCount !== 1 ? 's' : '');
  } else if (wc.textContent.includes('questions')) {
    const qMatch = trimmed.match(/\*\*Question \d+/gi);
    const qCount = qMatch ? qMatch.length : (trimmed ? 1 : 0);
    wc.textContent = qCount + ' question' + (qCount !== 1 ? 's' : '');
  } else {
    const words = trimmed ? trimmed.split(/\s+/).length : 0;
    wc.textContent = words + ' word' + (words !== 1 ? 's' : '') + ' · ' + trimmed.length + ' characters';
  }
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
