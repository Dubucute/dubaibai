// ===== Message Formatting & Code Rendering =====
(function() {
  // ── HTML escape helper ──
  window.escHtml = function (text) {
    if (typeof text !== "string") return "";
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
  };

  // ── Sanitize text (strip HTML tags) ──
  window.sanitizeText = function (text) {
    if (typeof text !== "string") return "";
    return text.replace(/<[^>]*>/g, "");
  };

  // ── Format message HTML (markdown → styled HTML) ──
  window.formatMessageHtml = function (content) {
    if (!content || typeof content !== "string") return "";

    // Phase 1: Extract protected blocks (reasoning, code)
    var blocks = [];
    var idx = 0;
    // Extract ```reasoning ... ``` blocks
    content = content.replace(/```reasoning\s*([\s\S]*?)```/g, function(match, inner) {
      var key = "%%REASONING_BLOCK_" + idx + "%%";
      blocks.push({ type: "reasoning", content: inner.trim(), key: key });
      idx++;
      return key;
    });
    // Extract ```lang ... ``` code blocks
    content = content.replace(/```(\w*)\s*\n?([\s\S]*?)```/g, function(match, lang, code) {
      var key = "%%CODE_BLOCK_" + idx + "%%";
      blocks.push({ type: "code", lang: lang || "", code: code, key: key });
      idx++;
      return key;
    });

    // Phase 2: Escape remaining text (not inside protected blocks)
    content = escHtml(content);

    // Phase 3: Apply markdown formatting
    // Reasoning headers
    content = content.replace(/&lt;reasoning&gt;/g, '<div class="reasoning-block"><div class="reasoning-header" onclick="toggleReasoning(this)"><svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M3 2l4 3-4 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg> Thinking</div><div class="reasoning-content">');
    content = content.replace(/&lt;\/reasoning&gt;/g, "</div></div>");

    // Blockquotes
    content = content.replace(/^&gt;\s(.+)$/gm, "<blockquote><p>$1</p></blockquote>");

    // Tables
    content = content.replace(/\n(\|.+\|\n\|[-| :]+\|\n(?:\|.+\|\n?)*)/g, function(match) {
      var lines = match.split("\n").filter(function(l) { return l.trim(); });
      if (lines.length < 2) return match;
      var headerCells = lines[0].split("|").filter(function(c) { return c.trim(); });
      if (headerCells.length < 2) return match;
      var html = '<div class="table-wrap"><table><thead><tr>';
      headerCells.forEach(function(c) { html += "<th>" + c.trim() + "</th>"; });
      html += "</tr></thead><tbody>";
      for (var t = 2; t < lines.length; t++) {
        var cells = lines[t].split("|").filter(function(c) { return c.trim(); });
        if (cells.length > 0) {
          html += "<tr>";
          cells.forEach(function(c) { html += "<td>" + c.trim() + "</td>"; });
          html += "</tr>";
        }
      }
      html += "</tbody></table></div>";
      return html;
    });

    // Task lists
    content = content.replace(/^- \[(x| )\] (.+)$/gm, function(match, checked, text) {
      var done = checked === "x";
      var svg = done
        ? '<svg class="task-icon" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5" fill="currentColor" stroke="currentColor" stroke-width="1"/><path d="M4.5 7l2 2 3-3" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        : '<svg class="task-icon" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1"/></svg>';
      return '<div class="task-item' + (done ? " done" : "") + '">' + svg + '<span class="task-text">' + text + "</span></div>";
    });

    // Headers
    content = content.replace(/^######\s(.+)$/gm, "<h6>$1</h6>");
    content = content.replace(/^#####\s(.+)$/gm, "<h5>$1</h5>");
    content = content.replace(/^####\s(.+)$/gm, "<h4>$1</h4>");
    content = content.replace(/^###\s(.+)$/gm, "<h3>$1</h3>");
    content = content.replace(/^##\s(.+)$/gm, "<h2>$1</h2>");
    content = content.replace(/^#\s(.+)$/gm, "<h1>$1</h1>");

    // Horizontal rules
    content = content.replace(/^---$/gm, "<hr>");

    // Unordered lists (lines starting with - or *)
    content = content.replace(/^(\s*)[-*]\s+(.+)$/gm, "<ul><li>$2</li></ul>");
    content = content.replace(/<\/ul>\n<ul>/g, "");

    // Ordered lists
    content = content.replace(/^\d+\.\s+(.+)$/gm, "<ol><li>$1</li></ol>");
    content = content.replace(/<\/ol>\n<ol>/g, "");

    // Inline images
    content = content.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="msg-image" loading="lazy">');

    // Links
    content = content.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    // Bold
    content = content.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    // Strikethrough
    content = content.replace(/~~(.+?)~~/g, "<del>$1</del>");
    // Italic
    content = content.replace(/\*(.+?)\*/g, "<em>$1</em>");

    // Inline code
    content = content.replace(/`([^`]+)`/g, "<code>$1</code>");

    // Newlines to <br> (for content that is not inside block elements)
    content = content.replace(/\n/g, "<br>");

    // Phase 4: Restore protected blocks
    for (var b = 0; b < blocks.length; b++) {
      var block = blocks[b];
      if (block.type === "reasoning") {
        var cleanContent = escHtml(block.content.trim());
        var reasoningHtml = '<div class="reasoning-block"><div class="reasoning-header" onclick="toggleReasoning(this)"><svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M3 2l4 3-4 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg> Reasoning</div><div class="reasoning-content">' + cleanContent.replace(/\n/g, "<br>") + "</div></div>";
        content = content.replace(block.key, reasoningHtml);
      } else if (block.type === "code") {
        content = content.replace(block.key, renderCodeBlock(block.lang, block.code));
      }
    }

    return content;
  };

  // ── Render a code block with header, line numbers, and copy button ──
  function renderCodeBlock(lang, code) {
    var langLabel = lang || "text";
    var langClass = lang ? "language-" + lang : "";
    var copyBtn = '<button class="copy-btn" onclick="copyCodeBlock(this)" title="Copy code"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="3.5" y="2.5" width="6" height="7" rx="1" stroke="currentColor" stroke-width="1.2"/><path d="M2.5 4.5v5a1 1 0 001 1h3" stroke="currentColor" stroke-width="1.2"/></svg> Copy</button>';
    var codeHtml = escHtml(code);
    var lines = code.split("\n");
    var gutterHtml = '<div class="code-gutter">';
    for (var i = 1; i <= lines.length; i++) {
      gutterHtml += '<span class="code-ln">' + i + "</span>";
    }
    gutterHtml += "</div>";

    // Detect file name from code
    var fileName = detectFileName(code, lang);
    var fileBadgeHtml = fileName
      ? '<span class="code-file-badge"><svg viewBox="0 0 12 12" fill="none"><path d="M3 1h4l3 3v7H3V1z" stroke="currentColor" stroke-width="1.2"/><path d="M7 1v3h3" stroke="currentColor" stroke-width="1.2"/></svg>' + escHtml(fileName) + "</span>"
      : "";

    var fileUi = "";
    if (fileName) {
      var fileId = "file-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
      fileUi = '<div class="file-path-input" id="' + fileId + '-container">' +
        '<input type="text" class="form-input" value="' + escHtml(fileName) + '" style="width:auto;flex:1;min-width:120px;font-size:10px;padding:3px 6px" id="' + fileId + '-path">' +
        '<button class="file-create-btn" onclick="createFileFromCode(this, \'' + escHtml(fileName) + '\')" data-file-id="' + fileId + '">' +
        '<svg width="10" height="10" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> Create File</button></div>';
    }

    return '<div class="code-block-wrap"><div class="code-header"><span class="code-lang">' + langLabel + "</span>" + fileBadgeHtml + "</div>" + fileUi + '<div class="code-block line-numbers">' + gutterHtml + copyBtn + '<code class="' + langClass + '">' + codeHtml + "</code></div></div>";
  }

  // ── Detect file name from code comment ──
  function detectFileName(code, lang) {
    var patterns = [
      /\/\/\s*filename:\s*(\S+)/i,
      /\/\/\s*file:\s*(\S+)/i,
      /#\s*filename:\s*(\S+)/i,
      /#\s*file:\s*(\S+)/i,
      /\/\/\s*(\S+\.\w+)$/m,
      /#\s*(\S+\.\w+)$/m,
    ];
    for (var p = 0; p < patterns.length; p++) {
      var match = code.match(patterns[p]);
      if (match && match[1]) return match[1].replace(/[<>:"/\\|?*]/g, "").trim();
    }
    return null;
  }

  // ── Create file from code block ──
  window.createFileFromCode = function (btn, defaultName) {
    var codeBlock = btn.closest(".code-block-wrap") || btn.closest(".code-block");
    if (!codeBlock) return;
    var codeEl = codeBlock.querySelector("code");
    if (!codeEl) return;
    var code = codeEl.textContent;

    // Allow custom path (if the file-path-input container has a different value)
    var container = codeBlock.querySelector(".file-path-input");
    var filepath = defaultName;
    if (container) {
      var pathInput = container.querySelector("input");
      if (pathInput && pathInput.value.trim()) filepath = pathInput.value.trim();
    }

    btn.classList.add("saving");
    btn.textContent = "Saving...";

    AgentAPI.writeFile(filepath, code, false)
      .then(function () {
        btn.classList.remove("saving");
        btn.classList.add("saved");
        btn.innerHTML = '<svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> Saved';
        showToast("File created: " + filepath, "success", 3000);
      })
      .catch(function (e) {
        btn.classList.remove("saving");
        if (e.message && e.message.includes("already exists")) {
          btn.classList.add("error");
          btn.textContent = "Overwrite?";
          btn.onclick = function () {
            btn.textContent = "Saving...";
            AgentAPI.writeFile(filepath, code, true)
              .then(function () {
                btn.classList.remove("error");
                btn.classList.add("saved");
                btn.innerHTML = '<svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> Saved';
                showToast("File overwritten: " + filepath, "success", 3000);
              })
              .catch(function (e2) {
                btn.classList.remove("saving");
                btn.classList.add("error");
                btn.textContent = "Error";
                showToast("Failed to save: " + e2.message, "error");
              });
          };
        } else {
          btn.classList.add("error");
          btn.textContent = "Error";
          showToast("Failed to save: " + e.message, "error");
        }
      });
  };

  // ── Toggle reasoning block ──
  window.toggleReasoning = function (header) {
    var content = header.nextElementSibling;
    if (!content) return;
    header.classList.toggle("open");
    content.classList.toggle("open");
  };

  // ── Add line numbers to code blocks ──
  window.addLineNumbers = function (container) {
    if (!container) return;
    var codeBlocks = container.querySelectorAll(".code-block.line-numbers:not(.ln-processed)");
    codeBlocks.forEach(function (block) {
      block.classList.add("ln-processed");
      var code = block.querySelector("code");
      if (!code) return;
      var text = code.textContent || code.innerText || "";
      var lines = text.split("\n");
      // Only add gutter if multiple lines
      if (lines.length < 2) {
        block.classList.remove("line-numbers");
        return;
      }
      // If gutter already exists, skip
      if (block.querySelector(".code-gutter")) return;
      var gutter = document.createElement("div");
      gutter.className = "code-gutter";
      for (var i = 1; i <= lines.length; i++) {
        var ln = document.createElement("span");
        ln.className = "code-ln";
        ln.textContent = i;
        gutter.appendChild(ln);
      }
      block.insertBefore(gutter, block.firstChild);
    });
  };

  // ── Copy code block ──
  window.copyCodeBlock = function (btn) {
    var block = btn.closest(".code-block");
    if (!block) return;
    var code = block.querySelector("code");
    if (!code) return;
    var text = code.textContent || code.innerText || "";
    navigator.clipboard.writeText(text).then(function () {
      btn.classList.add("copied");
      btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> Copied';
      setTimeout(function () {
        btn.classList.remove("copied");
        btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="3.5" y="2.5" width="6" height="7" rx="1" stroke="currentColor" stroke-width="1.2"/><path d="M2.5 4.5v5a1 1 0 001 1h3" stroke="currentColor" stroke-width="1.2"/></svg> Copy';
      }, 2000);
    });
  };

  // ── Scroll to bottom ──
  window.scrollToBottom = function (el) {
    if (!el) el = document.getElementById("agentMessages");
    if (!el) el = document.getElementById("chatMessages");
    if (!el) return;
    // Only auto-scroll if user is already near the bottom
    var threshold = 150;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - threshold) {
      el.scrollTop = el.scrollHeight;
    }
  };
})();
