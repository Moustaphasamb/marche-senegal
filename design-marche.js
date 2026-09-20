/* Progressive enhancement only: no accounts, API calls or commerce state. */
(() => {
  'use strict';
  function init() {
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
      requestAnimationFrame(() => { pending = false; enhance(document); });
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
