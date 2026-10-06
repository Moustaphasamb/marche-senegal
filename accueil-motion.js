/* Animations progressives de l'accueil. Le contenu reste visible sans CDN. */
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const slowConnection = navigator.connection?.saveData || /(^|-)2g$/.test(navigator.connection?.effectiveType || '');

if (!reduceMotion.matches && !slowConnection && 'IntersectionObserver' in window) {
  try {
    const { animate, inView, stagger } = await import('https://cdn.jsdelivr.net/npm/motion@13.5.0/+esm');
    if (!reduceMotion.matches) {
      const heroItems = document.querySelectorAll('.hero-content > :not([hidden])');
      if (heroItems.length) {
        animate(heroItems, { opacity: [0, 1], transform: ['translateY(16px)', 'translateY(0)'] },
          { duration: 0.65, delay: stagger(0.09), ease: 'ease-out' });
      }

      const selectors = '.section-top, .universe-card, .hiw-card, .cta-section';
      inView(selectors, element => {
        if (reduceMotion.matches) return;
        animate(element, { opacity: [0, 1], transform: ['translateY(18px)', 'translateY(0)'] },
          { duration: 0.55, ease: 'ease-out' });
      }, { amount: 0.12 });
    }
  } catch (error) {
    // Le site fonctionne aussi hors ligne ou si le fournisseur CDN est bloqué.
    console.warn('Animations Motion indisponibles', error);
  }
}
