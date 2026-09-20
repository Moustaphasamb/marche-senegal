/* Accueil : mouvement facultatif, navigation lisible, aucune donnée commerciale fictive. */
(() => {
  'use strict';
  const init = () => {
    const body = document.body;
    const hero = document.querySelector('.hero');
    if (!hero || !body.classList.contains('accueil-immersif')) return;
    const nav = document.querySelector('.nav');
    const drawer = document.getElementById('nav-drawer');
    const menu = document.getElementById('nav-hamburger');
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const connection = navigator.connection;
    const scenes = [...hero.querySelectorAll('.hero-scene')];
    const dots = [...hero.querySelectorAll('[data-scene]')];
    const motion = document.getElementById('hero-motion');
    const video = document.getElementById('hero-video');
    // Ajouter data-video-src="assets/senegal-hero.mp4" au <video> après
    // validation du film IA. Sans URL, aucun fichier vidéo n'est demandé.
    const sceneTitles = ['Au rythme des marchés', 'Patrimoine & rencontres', 'Au fil du Sénégal'];
    const sceneCredits = ['Visuel d’ambiance', 'Illustration · ville sainte', 'Illustration · marché du fleuve'];
    let scene = 0, timer, request = 0, visible = true, userPaused = false, videoFailed = false;
    let busy = false, controlsFocused = false;
    const constrained = () => media.matches || connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || '');
    const running = () => !userPaused && !constrained() && visible && !document.hidden && !controlsFocused;
    const clearTimer = () => { clearTimeout(timer); timer = null; };
    const showScene = async index => {
      const id = ++request;
      const img = scenes[index];
      if (!img) return;
      if (img.dataset.src && !img.getAttribute('src')) img.src = img.dataset.src;
      try { if (!img.complete || !img.naturalWidth) await img.decode(); } catch { return; }
      if (id !== request) return;
      scene = index;
      scenes.forEach((item, i) => item.classList.toggle('is-current', i === index));
      dots.forEach((item, i) => {
        item.classList.toggle('is-current', i === index);
        item.setAttribute('aria-pressed', String(i === index));
      });
      document.getElementById('scene-number').textContent = String(index + 1).padStart(2, '0') + ' / 03';
      document.getElementById('scene-title').textContent = sceneTitles[index];
      document.getElementById('scene-credit').textContent = sceneCredits[index];
    };
    const schedule = () => {
      clearTimer();
      if (!running() || hero.classList.contains('is-video')) return;
      timer = setTimeout(async () => {
        if (!running()) return;
        await showScene((scene + 1) % scenes.length);
        schedule();
      }, 8000);
    };
    const sync = () => {
      const on = running();
      hero.classList.toggle('is-animating', on);
      motion.disabled = constrained();
      motion.setAttribute('aria-pressed', String(userPaused || constrained()));
      motion.setAttribute('aria-label', constrained() ? 'Animations désactivées selon vos préférences' : userPaused ? 'Reprendre les animations' : 'Mettre les animations en pause');
      document.getElementById('motion-symbol').textContent = userPaused || constrained() ? '▷' : 'Ⅱ';
      schedule();
      if (!on) { video.pause(); return; }
      if (!video.dataset.videoSrc || videoFailed || busy) return;
      // Pas de préchargement vidéo pour les visiteurs économisant les données.
      if (!video.getAttribute('src')) video.src = video.dataset.videoSrc;
      busy = true;
      video.play().then(() => {
        if (!running()) { video.pause(); return; }
        hero.classList.add('is-video');
        clearTimer();
        dots.forEach(dot => { dot.hidden = true; });
        document.getElementById('scene-number').textContent = 'SÉNÉGAL';
        document.getElementById('scene-title').textContent = 'Un voyage au cœur des marchés';
        document.getElementById('scene-credit').textContent = 'Film d’ambiance · création IA';
      }).catch(() => { videoFailed = true; hero.classList.remove('is-video'); schedule(); }).finally(() => { busy = false; });
    };
    video.addEventListener('error', () => {
      videoFailed = true;
      hero.classList.remove('is-video');
      dots.forEach(dot => { dot.hidden = false; });
      showScene(scene);
      sync();
    });
    dots.forEach(dot => dot.addEventListener('click', () => {
      userPaused = true;
      showScene(Number(dot.dataset.scene));
      sync();
    }));
    motion.addEventListener('click', () => {
      userPaused = !userPaused;
      controlsFocused = false;
      sync();
    });
    const sceneControls = hero.querySelector('.hero-scene-control');
    sceneControls.addEventListener('focusin', () => { controlsFocused = true; sync(); });
    sceneControls.addEventListener('focusout', event => {
      if (!sceneControls.contains(event.relatedTarget)) { controlsFocused = false; sync(); }
    });
    const scroll = () => body.classList.toggle('home-scrolled', scrollY > 28);
    addEventListener('scroll', scroll, { passive: true });
    scroll();
    const closeMenu = (restore = false) => {
      if (!drawer?.classList.contains('open')) return;
      drawer.classList.remove('open');
      menu.classList.remove('open');
      menu.setAttribute('aria-expanded', 'false');
      if (restore) menu.focus();
    };
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(true); });
    drawer?.querySelectorAll('a').forEach(a => a.addEventListener('click', () => closeMenu()));
    // Les catégories et les cartes historiques sont rendues utilisables au clavier.
    const enhanceCards = root => {
      root.querySelectorAll('.cat-card[onclick],.prod-card[onclick],.shop-card[onclick],.market-card[onclick],.mn-item[onclick]').forEach(el => {
        if (el.dataset.homeKeyboard) return;
        el.dataset.homeKeyboard = 'true';
        el.tabIndex = 0;
        el.setAttribute('role', 'link');
        el.addEventListener('keydown', e => {
          if (e.target === el && e.key === 'Enter') { e.preventDefault(); el.click(); }
        });
      });
    };
    enhanceCards(document);
    const cardObserver = new MutationObserver(() => enhanceCards(document));
    ['markets-grid','products-grid','shops-grid'].forEach(id => {
      const el = document.getElementById(id);
      if (el) cardObserver.observe(el, { childList: true, subtree: true });
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(entries => {
        visible = entries[0].isIntersecting;
        sync();
      }, { threshold: 0.1 }).observe(hero);
      const reveals = document.querySelectorAll('.section-top,.universe-grid,.hiw-grid,.cta-section');
      const observer = new IntersectionObserver(entries => entries.forEach(entry => {
        if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
      }), { threshold: 0.08 });
      if (!media.matches) {
        body.classList.add('reveal-ready');
        reveals.forEach(el => { el.classList.add('home-reveal'); observer.observe(el); });
      }
    }
    media.addEventListener('change', () => {
      if (media.matches) body.classList.remove('reveal-ready');
      sync();
    });
    connection?.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    addEventListener('pagehide', () => { clearTimer(); video.pause(); });
    addEventListener('pageshow', sync);
    sync();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
