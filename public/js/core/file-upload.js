// ===== File Upload, Drag & Drop, Clipboard Paste =====
(function() {
  window.attachFile = function () {
    document.getElementById("fileInput").click();
  };

  function setupFileInput() {
    var input = document.getElementById("fileInput");
    input.onchange = function(e) {
      var files = Array.from(e.target.files);
      for (var fi = 0; fi < files.length; fi++) {
        var file = files[fi];
        if (file.size > 20 * 1024 * 1024) {
          showToast(file.name + " is too large (max 20MB)", "error");
          continue;
        }
        if (file.type.startsWith("image/")) {
          var reader = new FileReader();
          reader.onload = (function(f) {
            return function(ev) {
              attachedFiles.push({
                name: f.name,
                size: f.size,
                type: "image",
                data: ev.target.result,
                file: f,
              });
              renderAttachments();
            };
          })(file);
          reader.readAsDataURL(file);
        } else {
          var reader2 = new FileReader();
          reader2.onload = (function(f) {
            return function(ev) {
              attachedFiles.push({
                name: f.name,
                size: f.size,
                type: "document",
                data: ev.target.result,
                file: f,
                content: ev.target.result,
              });
              renderAttachments();
            };
          })(file);
          reader2.readAsText(file);
        }
      }
      input.value = "";
    };
  }

  function renderAttachments() {
    var bar = document.getElementById("attachBar");
    var list = document.getElementById("attachList");
    if (attachedFiles.length === 0) {
      bar.style.display = "none";
      return;
    }
    bar.style.display = "block";
    list.innerHTML = attachedFiles.map(function(f, i) {
      var sizeStr = f.size < 1024 ? f.size + " B" : (f.size / 1024).toFixed(1) + " KB";
      var imgHtml = f.type === "image" ? '<img src="' + f.data + '" class="attach-chip-img" alt="">' : "";
      var iconHtml = !imgHtml
        ? '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M4 2h4l3 3v6.5a.5.5 0 01-.5.5h-6A.5.5 0 014 11.5V2z" stroke="currentColor" stroke-width="1.2"/><path d="M8 2v3h3" stroke="currentColor" stroke-width="1.2"/></svg>'
        : "";
      return '<div class="attach-chip">' + (imgHtml || iconHtml) + '<span class="attach-chip-name">' + escHtml(f.name) + '</span><span class="attach-chip-size">' + sizeStr + '</span><button class="attach-chip-remove" onclick="removeAttachment(' + i + ')">\u2715</button></div>';
    }).join("");
  }

  window.removeAttachment = function (idx) {
    attachedFiles.splice(idx, 1);
    renderAttachments();
  };

  function setupDragDrop() {
    var chatArea = document.getElementById("chatMessages");
    var dropzone = document.getElementById("dropzoneOverlay");
    var dragCounter = 0;

    chatArea.addEventListener("dragenter", function(e) {
      e.preventDefault();
      dragCounter++;
      if (e.dataTransfer.types.indexOf("Files") !== -1) {
        dropzone.classList.add("visible");
      }
    });

    chatArea.addEventListener("dragleave", function(e) {
      e.preventDefault();
      dragCounter--;
      if (dragCounter === 0) {
        dropzone.classList.remove("visible");
      }
    });

    chatArea.addEventListener("dragover", function(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    });

    chatArea.addEventListener("drop", function(e) {
      e.preventDefault();
      dragCounter = 0;
      dropzone.classList.remove("visible");
      var files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;
      var dt = new DataTransfer();
      for (var fi = 0; fi < files.length; fi++) dt.items.add(files[fi]);
      document.getElementById("fileInput").files = dt.files;
      document.getElementById("fileInput").dispatchEvent(new Event("change"));
    });

    document.body.addEventListener("dragover", function(e) {
      e.preventDefault();
    });

    document.body.addEventListener("drop", function(e) {
      e.preventDefault();
      dragCounter = 0;
      dropzone.classList.remove("visible");
    });

    document.addEventListener("keydown", function(e) {
      if (e.key === "Escape" && dropzone.classList.contains("visible")) {
        dropzone.classList.remove("visible");
      }
    });

    document.addEventListener("paste", function(e) {
      var items = Array.from(e.clipboardData?.items || []);
      var imageItems = items.filter(function(i) { return i.type.startsWith("image/"); });
      if (imageItems.length > 0) {
        e.preventDefault();
        for (var j = 0; j < imageItems.length; j++) {
          var blob = imageItems[j].getAsFile();
          if (blob) handlePastedImage(blob);
        }
      }
    });
  }

  function handlePastedImage(blob) {
    var reader = new FileReader();
    reader.onload = function(ev) {
      var dataUrl = ev.target.result;
      var fileName = "pasted-image-" + Date.now() + ".png";
      showPastePreview(dataUrl, fileName);
      attachedFiles.push({
        name: fileName,
        size: blob.size,
        type: "image",
        data: dataUrl,
        file: blob,
      });
      renderAttachments();
      showToast("Image pasted from clipboard", "success", 2000);
    };
    reader.readAsDataURL(blob);
  }

  function showPastePreview(dataUrl, fileName) {
    var existing = document.querySelector(".paste-preview");
    if (existing) existing.remove();
    var preview = document.createElement("div");
    preview.className = "paste-preview";
    preview.innerHTML = '<img src="' + dataUrl + '" alt="Pasted image"><div class="paste-preview-name">' + fileName + "</div>";
    document.body.appendChild(preview);
    setTimeout(function() {
      preview.style.opacity = "0";
      preview.style.transition = "opacity 0.2s ease";
      setTimeout(function() { preview.remove(); }, 200);
    }, 3000);
  }

  // Initialize
  setupFileInput();
  setupDragDrop();
})();
