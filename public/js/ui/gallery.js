// ===== Image Gallery Panel =====
(function() {
  window.toggleGallery = function () {
    var overlay = document.getElementById("galleryOverlay");
    var panel = document.getElementById("galleryPanel");
    var isOpen = panel.classList.contains("open");
    overlay.classList.toggle("visible", !isOpen);
    panel.classList.toggle("open", !isOpen);
    if (!isOpen) renderGallery();
  };

  window.openGalleryImage = function (idx) {
    var entry = imageGallery[idx];
    if (!entry) return;
    var lightbox = document.getElementById("lightbox");
    var img = lightbox.querySelector(".lightbox-img");
    var info = lightbox.querySelector(".lightbox-info");
    var dlBtn = lightbox.querySelector(".lightbox-dl");
    img.src = entry.url;
    img.alt = entry.prompt || "Generated image";
    info.innerHTML = "<strong>Prompt:</strong> " + escHtml(entry.prompt) + "<br><strong>Model:</strong> " + escHtml(entry.model);
    dlBtn.setAttribute("data-url", entry.url);
    dlBtn.setAttribute("data-prompt", entry.prompt || "image");
    lightbox.classList.add("visible");
    document.addEventListener("keydown", lightboxKeyHandler);
  };

  function lightboxKeyHandler(e) {
    if (e.key === "Escape") closeLightbox();
  }

  window.closeLightbox = function () {
    var lightbox = document.getElementById("lightbox");
    lightbox.classList.remove("visible");
    document.removeEventListener("keydown", lightboxKeyHandler);
  };

  window.clearGallery = function () {
    if (imageGallery.length === 0) return;
    imageGallery = [];
    saveGalleryToStorage();
    updateGalleryBadge();
    renderGallery();
    showToast("Gallery cleared", "info", 1500);
  };

  function renderGallery() {
    var grid = document.getElementById("galleryGrid");
    if (imageGallery.length === 0) {
      grid.innerHTML = '<div style="grid-column:1/-1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:48px 16px;color:var(--text-muted);font-size:13px;gap:8px"><svg width="32" height="32" viewBox="0 0 32 32" fill="none"><rect x="4" y="6" width="24" height="20" rx="3" stroke="currentColor" stroke-width="1.5" opacity="0.3"/><circle cx="13" cy="15" r="3" fill="currentColor" opacity="0.3"/><path d="M4 22l8-8 6 6 4-4 6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.3"/></svg><span>No images yet</span><span style="font-size:11px">Use /imagine to generate images</span></div>';
      return;
    }
    grid.innerHTML = imageGallery.map(function(entry, i) {
      return '<div class="gallery-item" onclick="openGalleryImage(' + i + ')" role="button" tabindex="0" aria-label="Gallery image ' + (i + 1) + '"><img src="' + entry.url + '" alt="' + escHtml(entry.prompt || "Image") + '" loading="lazy"></div>';
    }).join("");
  }

  window.updateGalleryBadge = function () {
    var badge = document.getElementById("galleryBadge");
    if (badge) {
      if (imageGallery.length > 0) {
        badge.style.display = "inline";
        badge.textContent = imageGallery.length;
      } else {
        badge.style.display = "none";
      }
    }
  };

  window.downloadImage = function (url, name) {
    var a = document.createElement("a");
    a.href = url;
    a.download = (name || "image").replace(/[^a-zA-Z0-9_-]/g, "_") + ".png";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Save gallery metadata to localStorage
  window.saveGalleryToStorage = function () {
    try {
      var meta = imageGallery.map(function(entry) {
        return { prompt: entry.prompt, model: entry.model, timestamp: entry.timestamp };
      });
      localStorage.setItem("dubu_gallery_meta", JSON.stringify(meta));
    } catch (e) {
      // Storage full — silently skip
    }
  };

  // Restore gallery metadata from localStorage
  window.restoreGalleryFromStorage = function () {
    try {
      var stored = localStorage.getItem("dubu_gallery_meta");
      if (stored) {
        var meta = JSON.parse(stored);
        // Image data URLs can't be restored from reload (not persisted)
        imageGallery = [];
        updateGalleryBadge();
      }
    } catch (e) {
      // Silent
    }
  };
})();
