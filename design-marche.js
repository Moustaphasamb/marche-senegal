/* Progressive enhancement only: no accounts, API calls or commerce state. */
(() => {
  'use strict';
  const brandLogo = 'assets/logo-msn-2026.png';
  function enhanceBrand(root) {
    root.querySelectorAll('.nav-logo > .flag, .nav-logo > .brand-mark, .left-logo > .flag, .card-logo > .flag, .sb-logo > .flag, .st-logo > .flag, .footer-logo > .flag').forEach(oldMark => {
      const mark = document.createElement('span');
      mark.className = 'ms-brand-mark';
      mark.setAttribute('aria-hidden', 'true');
      oldMark.replaceWith(mark);
    });
  }
  function installFavicon() {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 256;
      const context = canvas.getContext('2d');
      if (!context) return;
      const side = Math.min(image.width, image.height) * 0.72;
      context.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, 256, 256);
      let icon = document.querySelector('link[rel="icon"]');
      if (!icon) { icon = document.createElement('link'); icon.rel = 'icon'; document.head.append(icon); }
      icon.type = 'image/png';
      icon.href = canvas.toDataURL('image/png');
    };
    image.src = brandLogo;
  }
  function init() {
    enhanceBrand(document);
    installFavicon();
    if (document.body.classList.contains('accueil-immersif')) return;
    const main = document.querySelector('main,.main,.search-hero,.page-wrap,.page,.messages-wrap,.form-box');
    if (main && !document.querySelector('.ms-skip')) {
      if (!main.id) main.id = 'ms-main';
      main.setAttribute('tabindex', '-1');
      const skip = document.createElement('a');
      skip.className = 'ms-skip'; skip.href = '#' + main.id;
      skip.textContent = 'Aller au contenu'; document.body.prepend(skip);
    }
    // Existing click handlers remain the single source of behavior.
    function enhance(root) {
      root.querySelectorAll('[onclick]:not(a):not(button):not(input):not(select):not(textarea):not(option)').forEach(el => {
        if (el.matches('.sb-overlay,.sidebar-overlay,.overlay,.modal-overlay,[id$="overlay"]') || el.getAttribute('onclick').trim() === 'event.stopPropagation()') return;
        if (!el.hasAttribute('tabindex')) { el.tabIndex = 0; el.dataset.msKeyboard = 'true'; }
        if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
      });
      root.querySelectorAll('.nav-cart,.nav-hamburger,.hamburger-btn,.send-btn,.rc-add,.prod-cart-btn').forEach(el => {
        if (el.hasAttribute('aria-label')) return;
        el.setAttribute('aria-label', el.matches('.nav-cart') ? 'Voir mon panier' : el.matches('.send-btn') ? 'Envoyer le message' : el.matches('.rc-add,.prod-cart-btn') ? 'Ajouter au panier' : 'Ouvrir le menu');
      });
      root.querySelectorAll('.nav-search input,.sh-bar input').forEach(el => {
        if (!el.hasAttribute('aria-label') && !el.labels?.length) el.setAttribute('aria-label', 'Rechercher un produit, une boutique ou un marché');
      });
    }
    enhance(document);
    document.addEventListener('keydown', e => {
      const el = e.target;
      if ((e.key === 'Enter' || e.key === ' ') && el.matches('[data-ms-keyboard="true"][role="button"][onclick]')) {
        e.preventDefault(); el.click();
      }
    });
    let pending = false;
    new MutationObserver(records => {
      if (pending || !records.some(r => r.addedNodes.length)) return;
      pending = true;
      requestAnimationFrame(() => { pending = false; enhance(document); enhanceBrand(document); });
    }).observe(document.body, {childList:true,subtree:true});
    const drawer = document.getElementById('nav-drawer');
    const trigger = document.getElementById('nav-hamburger');
    if (drawer && trigger) {
      trigger.setAttribute('aria-controls', drawer.id);
      const sync = () => trigger.setAttribute('aria-expanded', String(drawer.classList.contains('open')));
      sync();
      new MutationObserver(sync).observe(drawer, {attributes:true,attributeFilter:['class']});
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && drawer.classList.contains('open')) {
          drawer.classList.remove('open'); trigger.classList.remove('open'); trigger.focus();
        }
      });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
