// ===== Model Selector Dropdown =====
(function() {
  var GROUP_ORDER = { "Smart": 1, "Fast": 2, "Vision": 3, "Image Gen": 4, "Embeddings": 5, "Safety": 6, "Code": 7, "Chat": 8, "Finance": 9, "Medical": 10, "Creative": 11, "Other": 12 };
  // ── SVG model icons (Lucide-style, no emoji) ──
  var MODEL_ICONS = {
    "nvidia/": "<svg viewBox='0 0 16 16' fill='none' width='14' height='14'><rect x='3' y='3' width='10' height='10' rx='2' stroke='currentColor' stroke-width='1.3'/><rect x='6' y='6' width='4' height='4' rx='0.5' stroke='currentColor' stroke-width='1'/><path d='M5 2V1M11 2V1M5 15V14M11 15V14M2 5H1M2 11H1M15 5H14M15 11H14' stroke='currentColor' stroke-width='1' stroke-linecap='round'/></svg>",
    "deepseek-ai/deepseek": "<svg viewBox='0 0 16 16' fill='none' width='14' height='14'><path d='M8 2l2.5 3H14l-3 3 3 3h-3.5L8 14l-2.5-3H2l3-3-3-3h3.5L8 2z' stroke='currentColor' stroke-width='1.3' stroke-linejoin='round'/></svg>",
    "meta/": "<svg viewBox='0 0 16 16' fill='none' width='14' height='14'><circle cx='8' cy='8' r='5' stroke='currentColor' stroke-width='1.3'/><path d='M5.5 6.5h5M5.5 8h4M5.5 9.5h3' stroke='currentColor' stroke-width='1.2' stroke-linecap='round'/></svg>",
    "mistralai/": "<svg viewBox='0 0 16 16' fill='none' width='14' height='14'><path d='M2 12c0-4 3-8 6-8s6 4 6 8M2 12h12M6 12V8M10 12V8' stroke='currentColor' stroke-width='1.3' stroke-linecap='round'/></svg>",
    "google/": "<svg viewBox='0 0 16 16' fill='none' width='14' height='14'><path d='M7.5 2l5.5 3v6l-5.5 3L2 11V5l5.5-3z' stroke='currentColor' stroke-width='1.3' stroke-linejoin='round'/><circle cx='7.5' cy='8' r='2' stroke='currentColor' stroke-width='1.3'/></svg>",
    "qwen/": "<svg viewBox='0 0 16 16' fill='none' width='14' height='14'><circle cx='7' cy='7' r='4.5' stroke='currentColor' stroke-width='1.3'/><path d='M10.5 10.5l3 3' stroke='currentColor' stroke-width='1.3' stroke-linecap='round'/></svg>",
    "microsoft/": "<svg viewBox='0 0 16 16' fill='none' width='14' height='14'><path d='M8 2l4 2v4l-4 2-4-2V4l4-2z' stroke='currentColor' stroke-width='1.3' stroke-linejoin='round'/><circle cx='8' cy='5' r='1' stroke='currentColor' stroke-width='1'/></svg>",
    "black-forest-labs/": "<svg viewBox='0 0 16 16' fill='none' width='14' height='14'><circle cx='8' cy='7' r='4' stroke='currentColor' stroke-width='1.3'/><path d='M5 12l1-3h4l1 3' stroke='currentColor' stroke-width='1.3' stroke-linecap='round' stroke-linejoin='round'/></svg>",
    "stabilityai/": "<svg viewBox='0 0 16 16' fill='none' width='14' height='14'><circle cx='8' cy='7' r='4' stroke='currentColor' stroke-width='1.3'/><path d='M5 12l1-3h4l1 3' stroke='currentColor' stroke-width='1.3' stroke-linecap='round' stroke-linejoin='round'/></svg>",
    "nvidia/nv-embed": "<svg viewBox='0 0 16 16' fill='none' width='14' height='14'><rect x='2' y='4' width='3' height='8' rx='1' stroke='currentColor' stroke-width='1.2'/><rect x='6.5' y='2' width='3' height='12' rx='1' stroke='currentColor' stroke-width='1.2'/><rect x='11' y='5' width='3' height='6' rx='1' stroke='currentColor' stroke-width='1.2'/></svg>",
    "baai/": "<svg viewBox='0 0 16 16' fill='none' width='14' height='14'><rect x='2' y='4' width='3' height='8' rx='1' stroke='currentColor' stroke-width='1.2'/><rect x='6.5' y='2' width='3' height='12' rx='1' stroke='currentColor' stroke-width='1.2'/><rect x='11' y='5' width='3' height='6' rx='1' stroke='currentColor' stroke-width='1.2'/></svg>",
    "snowflake/": "<svg viewBox='0 0 16 16' fill='none' width='14' height='14'><rect x='2' y='4' width='3' height='8' rx='1' stroke='currentColor' stroke-width='1.2'/><rect x='6.5' y='2' width='3' height='12' rx='1' stroke='currentColor' stroke-width='1.2'/><rect x='11' y='5' width='3' height='6' rx='1' stroke='currentColor' stroke-width='1.2'/></svg>",
  };

  function getModelIcon(modelId) {
    if (!modelId) return "<svg viewBox='0 0 16 16' fill='none' width='14' height='14'><path d='M8 1l3 5 5 1-4 4 1 5-5-3-5 3 1-5-4-4 5-1 3-5z' stroke='currentColor' stroke-width='1.3' stroke-linejoin='round'/></svg>";
    for (var prefix in MODEL_ICONS) {
      if (modelId.indexOf(prefix) === 0) return MODEL_ICONS[prefix];
    }
    return "<svg viewBox='0 0 16 16' fill='none' width='14' height='14'><circle cx='8' cy='8' r='5' stroke='currentColor' stroke-width='1.3'/><path d='M5.5 6.5h5M5.5 8h4M5.5 9.5h3' stroke='currentColor' stroke-width='1.2' stroke-linecap='round'/></svg>";
  }

  function getModelGroup(info) {
    if (!info || !info.capabilities) return "Other";
    var caps = info.capabilities;
    if (caps.indexOf("vision") !== -1 || caps.indexOf("image_understanding") !== -1 || caps.indexOf("video") !== -1) return "Vision";
    if (caps.indexOf("text_to_image") !== -1 || caps.indexOf("image_generation") !== -1) return "Image Gen";
    if (caps.indexOf("embedding") !== -1 || caps.indexOf("retrieval") !== -1) return "Embeddings";
    if (caps.indexOf("content_safety") !== -1 || caps.indexOf("jailbreak_detect") !== -1 || caps.indexOf("topic_control") !== -1) return "Safety";
    if (caps.indexOf("code") !== -1 && caps.indexOf("chat") === -1) return "Code";
    if (caps.indexOf("finance") !== -1) return "Finance";
    if (caps.indexOf("medical") !== -1) return "Medical";
    if (caps.indexOf("writing") !== -1 || caps.indexOf("creative") !== -1) return "Creative";
    return (info.quality || 0) >= 7 ? "Smart" : "Fast";
  }

  window.loadModelsFromServer = function () {
    fetch("/api/models")
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var models = [];
        if (data.all) {
          for (var id in data.all) {
            if (data.all.hasOwnProperty(id)) {
              var info = data.all[id];
              models.push({ id: id, name: info.name || id.split("/").pop(), group: getModelGroup(info), quality: info.quality || 0, speed: info.speed || "medium", capabilities: info.capabilities || [], benchmark: info.benchmark || null });
            }
          }
        }
        // Add auto-select at top
        models.sort(function(a, b) {
          var ga = GROUP_ORDER[a.group] || 99;
          var gb = GROUP_ORDER[b.group] || 99;
          if (ga !== gb) return ga - gb;
          return (b.quality || 0) - (a.quality || 0);
        });
        loadedModels = models;
        renderDropdownContent();
        updateModelDropdownTrigger();
      })
      .catch(function(e) {
        console.warn("Failed to load models:", e.message);
      });
  };

  // ── Update model dropdown trigger ──
  window.updateModelDropdownTrigger = function () {
    var selected = state.get("agentModel") || "";
    var nameEl = document.getElementById("mdTriggerName");
    var iconEl = document.getElementById("mdTriggerIcon");
    if (!nameEl || !iconEl) return;
    if (!selected) {
      nameEl.textContent = "Auto-Select";
      iconEl.innerHTML = "<svg viewBox='0 0 16 16' fill='none' width='14' height='14'><path d='M8 1l3 5 5 1-4 4 1 5-5-3-5 3 1-5-4-4 5-1 3-5z' stroke='currentColor' stroke-width='1.3' stroke-linejoin='round'/></svg>";
      return;
    }
    var model = loadedModels.find(function(m) { return m.id === selected; });
    nameEl.textContent = model ? model.name : selected.split("/").pop();
    iconEl.innerHTML = getModelIcon(selected);
  }

  // ── Toggle model dropdown ──
  window.toggleModelDropdown = function () {
    var panel = document.getElementById("mdPanel");
    var trigger = document.getElementById("mdTrigger");
    var isOpen = panel.classList.contains("open");
    // Close all open dropdowns
    document.querySelectorAll(".md-panel.open").forEach(function(p) {
      if (p !== panel) p.classList.remove("open");
    });
    document.querySelectorAll(".md-trigger.open").forEach(function(t) {
      if (t !== trigger) t.classList.remove("open");
    });
    if (isOpen) {
      panel.classList.remove("open");
      trigger.classList.remove("open");
      return;
    }
    panel.classList.add("open");
    trigger.classList.add("open");
    // Load models if needed
    if (loadedModels.length === 0) loadModelsFromServer();
    else renderDropdownContent();
    // Focus search input
    setTimeout(function() {
      var search = document.getElementById("mdSearchInput");
      if (search) search.focus();
    }, 50);
    // Collision detection — flip upward if no room below
    var rect = trigger.getBoundingClientRect();
    var spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < 380) {
      panel.classList.add("upward");
    } else {
      panel.classList.remove("upward");
    }
  };

  // ── Filter model dropdown ──
  window.filterModelDropdown = function (query) {
    renderDropdownContent(query);
  };

  // ── Render dropdown content ──
  function renderDropdownContent(query) {
    query = query || "";
    var q = query.toLowerCase().trim();
    var list = document.getElementById("mdList");
    var empty = document.getElementById("mdEmpty");
    if (!list) return;

    var filtered = q ? loadedModels.filter(function(m) {
      return m.name.toLowerCase().indexOf(q) !== -1 || m.id.toLowerCase().indexOf(q) !== -1 || (m.capabilities && m.capabilities.some(function(c) { return c.toLowerCase().indexOf(q) !== -1; }));
    }) : loadedModels;

    if (filtered.length === 0) {
      if (empty) empty.style.display = "flex";
      list.innerHTML = "";
      return;
    }
    if (empty) empty.style.display = "none";

    var selected = state.get("agentModel") || "";
    var isAutoSelected = !selected;

    // Always render Auto-Select first — even when search returns no results
    var html = '<div class="md-item ' + (isAutoSelected ? "active" : "") + '" data-model-id="auto" tabindex="0" role="option" aria-selected="' + (isAutoSelected ? "true" : "false") + '">' +
      '<div class="md-item-icon"><svg viewBox="0 0 16 16" fill="none" width="14" height="14"><path d="M8 1l3 5 5 1-4 4 1 5-5-3-5 3 1-5-4-4 5-1 3-5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg></div>' +
      '<div class="md-item-info">' +
      '<div class="md-item-name">Auto-Select</div>' +
      '<div class="md-item-id">Automatic model selection</div>' +
      '</div>' +
      '<div class="md-item-check"><svg viewBox="0 0 10 10" fill="none"><path d="M2 5l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>' +
      '</div>';

    var groups = {};
    filtered.forEach(function(m) {
      if (!groups[m.group]) groups[m.group] = [];
      groups[m.group].push(m);
    });

    var sortedGroups = Object.keys(groups).sort(function(a, b) {
      return (GROUP_ORDER[a] || 99) - (GROUP_ORDER[b] || 99);
    });

    sortedGroups.forEach(function(group) {
      html += '<div class="md-group-label">' + group + "</div>";
      groups[group].forEach(function(m) {
        var active = m.id === selected ? "active" : "";
        var icon = getModelIcon(m.id);
        html += '<div class="md-item ' + active + '" data-model-id="' + m.id + '" tabindex="0" role="option" aria-selected="' + (active ? "true" : "false") + '">' +
          '<div class="md-item-icon">' + icon + "</div>" +
          '<div class="md-item-info">' +
          '<div class="md-item-name">' + (m.name || m.id.split("/").pop()) + "</div>" +
          '<div class="md-item-id">' + m.id + "</div>" +
          "</div>" +
          '<div class="md-item-check"><svg viewBox="0 0 10 10" fill="none"><path d="M2 5l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>' +
          "</div>";
      });
    });
    list.innerHTML = html;

    // Attach click and hover handlers
    var items = list.querySelectorAll(".md-item");
    items.forEach(function(el) {
      el.addEventListener("click", function() {
        selectModelFromDropdown(el.getAttribute("data-model-id"));
      });
      el.addEventListener("mouseenter", function() {
        var modelId = el.getAttribute("data-model-id");
        var model = loadedModels.find(function(m) { return m.id === modelId; });
        if (model) showTooltip(el, model);
      });
      el.addEventListener("mouseleave", function() {
        hideTooltip();
      });
    });
  }

  // ── Select model from dropdown ──
  function selectModelFromDropdown(modelId) {
    var selectedValue = modelId === "auto" ? "" : modelId;
    state.set("agentModel", selectedValue);
    updateModelDropdownTrigger();
    // Close dropdown
    var panel = document.getElementById("mdPanel");
    var trigger = document.getElementById("mdTrigger");
    if (panel) panel.classList.remove("open");
    if (trigger) trigger.classList.remove("open");
    var modelName = selectedValue ? (loadedModels.find(function(m) { return m.id === selectedValue; }) || {}).name || selectedValue.split("/").pop() : "Auto-Select";
    showToast("Model: " + modelName, "success", 1500);
  }

  // ── Close model dropdown ──
  window.closeModelDropdown = function () {
    document.getElementById("mdTrigger")?.classList.remove("open");
    document.getElementById("mdPanel")?.classList.remove("open");
    var searchInput = document.getElementById("mdSearchInput");
    if (searchInput) {
      searchInput.value = "";
      filterModelDropdown("");
    }
  };

  // ── Close all model dropdowns ──
  window.closeModelDropdowns = function () {
    document.querySelectorAll(".md-panel.open").forEach(function(p) { p.classList.remove("open"); });
    document.querySelectorAll(".md-trigger.open").forEach(function(t) { t.classList.remove("open"); });
  };

  // ── Tooltip system ──
  function showTooltip(triggerEl, model) {
    var tooltip = document.getElementById("mdTooltip");
    if (!tooltip) return;
    var nameEl = document.getElementById("mdtName");
    var iconEl = document.getElementById("mdtIcon");
    var descEl = document.getElementById("mdtDesc");
    var badgesEl = document.getElementById("mdtBadges");
    var capsEl = document.getElementById("mdtCaps");
    if (nameEl) nameEl.textContent = model.name || model.id.split("/").pop();
    if (iconEl) iconEl.innerHTML = getModelIcon(model.id);
    if (descEl) descEl.textContent = model.id + (model.capabilities && model.capabilities.length > 0 ? " \u2022 " + model.capabilities.slice(0, 4).join(", ") : "");
    if (badgesEl) {
      badgesEl.innerHTML = "";
      if (model.benchmark && model.benchmark.rank) {
        var rankBadge = document.createElement("span");
        rankBadge.className = "mdt-badge quality-high";
        rankBadge.textContent = "#" + model.benchmark.rank;
        badgesEl.appendChild(rankBadge);
      }
      if (model.quality >= 8) {
        var qBadge = document.createElement("span");
        qBadge.className = "mdt-badge quality-high";
        qBadge.textContent = "High Quality";
        badgesEl.appendChild(qBadge);
      }
      if (model.speed === "very_fast") {
        var sBadge = document.createElement("span");
        sBadge.className = "mdt-badge speed-fast";
        sBadge.textContent = "Fast";
        badgesEl.appendChild(sBadge);
      }
      var gBadge = document.createElement("span");
      gBadge.className = "mdt-badge group";
      gBadge.textContent = model.group || "Other";
      badgesEl.appendChild(gBadge);
    }
    if (capsEl) {
      capsEl.innerHTML = (model.capabilities || []).slice(0, 6).map(function(c) {
        return "<span>" + c + "</span>";
      }).join("");
    }
    tooltip.classList.add("visible");
    // Position tooltip relative to list item
    var panel = document.getElementById("mdPanel");
    if (panel) {
      var panelRect = panel.getBoundingClientRect();
      var triggerRect = triggerEl.getBoundingClientRect();
      tooltip.style.position = "fixed";
      tooltip.style.top = Math.max(8, triggerRect.top - panelRect.top + panel.scrollTop) + "px";
      var spaceLeft = triggerRect.left - panelRect.left;
      if (spaceLeft > 220) {
        tooltip.style.left = "auto";
        tooltip.style.right = (panelRect.right - triggerRect.left + 8) + "px";
        tooltip.classList.remove("flip");
      } else {
        tooltip.style.right = "auto";
        tooltip.style.left = (triggerRect.right - panelRect.left + 8) + "px";
        tooltip.classList.add("flip");
      }
    }
  }

  function hideTooltip() {
    var tooltip = document.getElementById("mdTooltip");
    if (tooltip) tooltip.classList.remove("visible");
  }

  // ── Auto-close dropdowns on outside click ──
  document.addEventListener("click", function(e) {
    var dropdown = document.querySelector(".model-dropdown");
    var panel = document.getElementById("mdPanel");
    if (panel && panel.classList.contains("open") && dropdown && !dropdown.contains(e.target)) {
      panel.classList.remove("open");
      var trigger = document.getElementById("mdTrigger");
      if (trigger) trigger.classList.remove("open");
    }
  });
})();
