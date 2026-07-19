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
    { id: 'new-chat', name: 'New Chat', desc: 'Start a fresh conversation', icon: '✨', category: 'Navigation', action: function() { window.clearAgent(); } },
    { id: 'home', name: 'Go to Home', desc: 'Navigate to home page', icon: '🏠', category: 'Navigation', action: function() { window.location.href = 'index.html'; } },
    { id: 'gallery', name: 'Image Gallery', desc: 'View generated images', icon: '🖼️', shortcut: '⌘G', category: 'Navigation', action: function() { window.toggleGallery(); } },
    { id: 'settings', name: 'Settings', desc: 'Open settings panel', icon: '⚙️', shortcut: '⌘,', category: 'Navigation', action: function() { window.switchPanel('settings'); } },

    // Models
    { id: 'model-auto', name: 'Auto-Select Model', desc: 'Let AI choose the best model', icon: '⚡', category: 'Models', action: function() { state.set('agentModel', ''); window.showToast('Model: Auto-Select', 'success', 1500); } },
    { id: 'model-deepseek-flash', name: 'DeepSeek V4 Flash', desc: 'Fast and efficient', icon: '🚀', category: 'Models', action: function() { state.set('agentModel', 'deepseek-ai/deepseek-v4-flash'); window.showToast('Model: DeepSeek Flash', 'success', 1500); } },
    { id: 'model-nemotron', name: 'Nemotron 49B', desc: 'High quality reasoning', icon: '🧠', category: 'Models', action: function() { state.set('agentModel', 'nvidia/llama-3.3-nemotron-super-49b-v1.5'); window.showToast('Model: Nemotron 49B', 'success', 1500); } },
    { id: 'model-deepseek-pro', name: 'DeepSeek V4 Pro', desc: 'Maximum quality', icon: '⭐', category: 'Models', action: function() { state.set('agentModel', 'deepseek-ai/deepseek-v4-pro'); window.showToast('Model: DeepSeek Pro', 'success', 1500); } },

    // Modes
    { id: 'toggle-websearch', name: 'Toggle Web Search', desc: 'Enable/disable real-time web search', icon: '🌐', shortcut: '⌘F', category: 'Modes', action: function() { window.toggleWebSearch(); } },
    { id: 'toggle-deepthink', name: 'Toggle Deep Thinking', desc: 'Enable/disable step-by-step reasoning', icon: '💡', shortcut: '⌘D', category: 'Modes', action: function() { window.toggleDeepThink(); } },

    // Theme
    { id: 'theme-dark', name: 'Theme: Dark', desc: 'Switch to dark theme', icon: '🌙', category: 'Theme', action: function() { window.selectTheme('dark'); } },
    { id: 'theme-light', name: 'Theme: Light', desc: 'Switch to light theme', icon: '☀️', category: 'Theme', action: function() { window.selectTheme('light'); } },
    { id: 'theme-midnight', name: 'Theme: Midnight', desc: 'Switch to midnight theme', icon: '🌑', category: 'Theme', action: function() { window.selectTheme('midnight'); } },
    { id: 'toggle-theme', name: 'Cycle Theme', desc: 'Switch to next theme', icon: '🎨', shortcut: '⌘T', category: 'Theme', action: function() { window.toggleTheme(); } },

    // Actions
    { id: 'export-md', name: 'Export as Markdown', desc: 'Download conversation as .md file', icon: '📄', category: 'Actions', action: function() { window.exportConversation(); } },
    { id: 'clear-chat', name: 'Clear Chat', desc: 'Clear all messages', icon: '🗑️', shortcut: '⌘L', category: 'Actions', action: function() { window.clearAgent(); } },
  ];

  function renderCommands(query) {
    query = query || '';
    var q = query.toLowerCase().trim();
    filteredCommands = q
      ? commands.filter(function(c) { return c.name.toLowerCase().indexOf(q) !== -1 || c.desc.toLowerCase().indexOf(q) !== -1 || c.category.toLowerCase().indexOf(q) !== -1; })
      : commands.slice();

    if (filteredCommands.length === 0) {
      results.innerHTML = '<div class="cmd-empty"><span>No results found</span></div>';
      return;
    }

    // Group by category
    var groups = {};
    filteredCommands.forEach(function(c) {
      if (!groups[c.category]) groups[c.category] = [];
      groups[c.category].push(c);
    });

    var html = '';
    var idx = 0;
    var categories = Object.keys(groups);
    for (var g = 0; g < categories.length; g++) {
      var cat = categories[g];
      var items = groups[cat];
      html += '<div class="cmd-section-label">' + cat + '</div>';
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var activeClass = idx === activeIndex ? 'active' : '';
        var shortcutHtml = item.shortcut
          ? '<div class="cmd-item-shortcut"><kbd>' + item.shortcut + '</kbd></div>'
          : '';
        html += '<div class="cmd-item ' + activeClass + '" id="cmd-item-' + idx + '" data-idx="' + idx + '" data-id="' + item.id + '" role="option" aria-selected="' + (idx === activeIndex) + '">'
          + '<div class="cmd-item-icon">' + item.icon + '</div>'
          + '<div class="cmd-item-info">'
          + '<div class="cmd-item-name">' + item.name + '</div>'
          + '<div class="cmd-item-desc">' + item.desc + '</div>'
          + '</div>'
          + shortcutHtml
          + '</div>';
        idx++;
      }
    }
    results.innerHTML = html;

    // Attach hover handlers
    var items = results.querySelectorAll('.cmd-item');
    for (var j = 0; j < items.length; j++) {
      (function(el) {
        el.addEventListener('mouseenter', function() {
          activeIndex = parseInt(el.getAttribute('data-idx'));
          updateActive();
        });
        el.addEventListener('click', function() {
          executeCommand(el.getAttribute('data-id'));
        });
      })(items[j]);
    }
  }

  function updateActive() {
    var items = results.querySelectorAll('.cmd-item');
    for (var i = 0; i < items.length; i++) {
      var isActive = parseInt(items[i].getAttribute('data-idx')) === activeIndex;
      items[i].classList.toggle('active', isActive);
      items[i].setAttribute('aria-selected', isActive ? 'true' : 'false');
    }
    var activeEl = results.querySelector('.cmd-item.active');
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
      input.setAttribute('aria-activedescendant', activeEl.id);
    }
  }

  function executeCommand(id) {
    var cmd = commands.find(function(c) { return c.id === id; });
    if (cmd) {
      close();
      cmd.action();
    }
  }

  var previousFocus = null;

  function open() {
    if (isOpen) return;
    isOpen = true;
    activeIndex = 0;
    previousFocus = document.activeElement;
    overlay.classList.add('open');
    input.value = '';
    renderCommands();
    setTimeout(function() { input.focus(); }, 50);
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    overlay.classList.remove('open');
    input.value = '';
    if (previousFocus) previousFocus.focus();
  }

  // Focus trap within the dialog
  overlay.addEventListener('keydown', function(e) {
    if (e.key !== 'Tab') return;
    var focusable = overlay.querySelectorAll('input, button, [tabindex]:not([tabindex="-1"])');
    if (focusable.length === 0) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // Keyboard navigation
  input.addEventListener('keydown', function(e) {
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
  input.addEventListener('input', function(e) {
    activeIndex = 0;
    renderCommands(e.target.value);
  });

  // Close on overlay click
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) close();
  });

  // Global keyboard shortcut
  document.addEventListener('keydown', function(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      if (isOpen) close();
      else open();
    }
  });

  // Expose API
  window.CommandPalette = { open: open, close: close };
})();
