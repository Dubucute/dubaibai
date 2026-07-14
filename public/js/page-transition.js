// ===== Page Transition Animations =====
// Exit: overlay fades in (0.2s) to prevent white flash, then navigates
// Enter: page content fades+slides in using CSS animation

(function () {
  'use strict';

  // ── Entrance: animate page content ──
  function initEntrance() {
    const target =
      document.querySelector('.home-page') ||
      document.querySelector('.tool-page') ||
      document.querySelector('#app');
    if (!target) return;

    // Use rAF to ensure layout is complete before animating
    requestAnimationFrame(function () {
      target.classList.add('pte-in');
    });
  }

  // ── Exit: fade overlay in, then navigate ──
  let overlay = null;

  function getOverlay() {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'pt-overlay';
      overlay.setAttribute('aria-hidden', 'true');
      document.documentElement.appendChild(overlay);
    }
    return overlay;
  }

  function handleLinkClick(e) {
    // Skip modifier clicks (open in new tab/window)
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;

    const link = e.target.closest('a');
    if (!link) return;

    let href = link.getAttribute('href');
    if (!href) return;

    // Skip non-navigation links
    if (
      href.startsWith('#') ||
      href.startsWith('http') ||
      href.startsWith('javascript:') ||
      href.startsWith('mailto:') ||
      href.startsWith('tel:')
    )
      return;

    // Only intercept internal .html links or root /
    const isInternal =
      href.endsWith('.html') ||
      href === '/' ||
      (!href.includes('://') && !href.startsWith('//'));

    if (!isInternal) return;

    e.preventDefault();

    const ov = getOverlay();

    // Show overlay and fade in
    ov.style.display = 'block';
    ov.style.opacity = '0';
    ov.style.transition = 'opacity 0.15s ease';
    ov.style.pointerEvents = 'auto';

    // Force reflow so the initial opacity:0 is rendered before transitioning
    void ov.offsetHeight;

    ov.style.opacity = '1';

    // Navigate after overlay is fully opaque
    setTimeout(function () {
      window.location.href = href;
    }, 200);
  }

  // ── Init ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEntrance);
  } else {
    initEntrance();
  }

  document.addEventListener('click', handleLinkClick);
})();
