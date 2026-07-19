// ===== Model Comparison Panel =====
(function() {
  var overlay = document.getElementById('compareOverlay');
  var isOpen = false;
  var models = [];

  function loadModels() {
    fetch('/api/models')
      .then(function(resp) { return resp.json(); })
      .then(function(data) {
        models = data.models || [];
        populateSelects();
      })
      .catch(function(e) {
        console.warn('Failed to load models:', e);
      });
  }

  function populateSelects() {
    var selA = document.getElementById('compareModelA');
    var selB = document.getElementById('compareModelB');
    var currentModel = state.get('agentModel') || '';

    var options = models.map(function(m) {
      var name = m.name || m.id.split('/').pop();
      var selected = m.id === currentModel ? 'selected' : '';
      return '<option value="' + m.id + '" ' + selected + '>' + name + '</option>';
    }).join('');

    var autoOption = '<option value="">Auto-Select</option>';
    selA.innerHTML = autoOption + options;
    selB.innerHTML = autoOption + options;

    if (models.length > 1) {
      selB.selectedIndex = 2;
    }
  }

  var previousFocus = null;

  window.toggleCompareMode = function() {
    isOpen = !isOpen;
    overlay.classList.toggle('open', isOpen);
    if (isOpen) {
      previousFocus = document.activeElement;
      loadModels();
      document.getElementById('compareResults').innerHTML = '';
      setTimeout(function() {
        var firstInput = overlay.querySelector('select, textarea, button, input');
        if (firstInput) firstInput.focus();
      }, 50);
    } else {
      if (previousFocus) previousFocus.focus();
    }
  };

  // Focus trap within compare panel
  overlay.addEventListener('keydown', function(e) {
    if (e.key !== 'Tab') return;
    var focusable = overlay.querySelectorAll('select, textarea, button, input, [tabindex]:not([tabindex="-1"])');
    if (focusable.length === 0) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  window.runComparison = function() {
    var prompt = document.getElementById('comparePrompt').value.trim();
    if (!prompt) {
      window.showToast('Please enter a prompt to compare', 'warning');
      return;
    }

    var modelA = document.getElementById('compareModelA').value;
    var modelB = document.getElementById('compareModelB').value;

    var colA = document.getElementById('compareResultA').querySelector('.compare-col-content');
    var colB = document.getElementById('compareResultB').querySelector('.compare-col-content');

    colA.innerHTML = '<div class="thinking-indicator"><div class="thinking-dots"><span></span><span></span><span></span></div><span class="thinking-text">Generating...</span></div>';
    colB.innerHTML = '<div class="thinking-indicator"><div class="thinking-dots"><span></span><span></span><span></span></div><span class="thinking-text">Generating...</span></div>';

    var nameA = modelA ? (models.find(function(m) { return m.id === modelA; }) || {}).name || modelA.split('/').pop() : 'Auto-Select';
    var nameB = modelB ? (models.find(function(m) { return m.id === modelB; }) || {}).name || modelB.split('/').pop() : 'Auto-Select';
    document.getElementById('compareResultA').querySelector('.compare-col-header').textContent = nameA;
    document.getElementById('compareResultB').querySelector('.compare-col-header').textContent = nameB;

    var history = [{ role: 'user', content: prompt }];

    function runModel(model, col) {
      var text = '';
      window.AgentAPI.send(prompt, history, {}, {
        model: model || undefined,
        onUpdate: function(data) {
          if (data.type === 'token') {
            text += data.content || '';
            col.innerHTML = window.formatMessageHtml(text);
          } else if (data.type === 'model_info') {
            var modelName = data.modelName || (data.model || '').split('/').pop();
            col.innerHTML = '<div class="thinking-indicator"><div class="thinking-dots"><span></span><span></span><span></span></div><span class="thinking-text">Using ' + modelName + '...</span></div>';
          }
        },
        onDone: function() {
          if (text) col.innerHTML = window.formatMessageHtml(text);
        },
        onError: function(err) {
          col.innerHTML = '<div style="color: var(--danger);">Error: ' + err + '</div>';
        }
      });
    }

    runModel(modelA, colA);
    runModel(modelB, colB);
  };

  // Keyboard shortcut
  document.addEventListener('keydown', function(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'm') {
      e.preventDefault();
      window.toggleCompareMode();
    }
  });
})();
