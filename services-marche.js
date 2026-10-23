// Services du marché : paniers recettes et ravitaillement familial.
// La page compose un panier depuis GET /api/services/:slug/availability puis
// l'ajoute au panier habituel (localStorage « cart »), au même format que les
// autres pages. La liste familiale reste sur l'appareil (« ms-ravitaillement ») :
// aucun compte ni serveur ne la garde.
(function () {
  'use strict';
  const CLE_VISITE = 'ms-services-seen';
  const CLE_LISTE = 'ms-ravitaillement';
  const RAVITAILLEMENT = 'ravitaillement-famille';
  const PERSONNES_MAX = 30;

  const marketSelect = document.getElementById('service-market');
  const personnesSelect = document.getElementById('service-personnes');
  const frequenceSelect = document.getElementById('service-frequence');
  const listeZone = document.getElementById('service-liste');
  const result = document.getElementById('services-live-result');
  const status = document.getElementById('services-live-status');

  let currentSlug = 'panier-ceebu-jen';
  let currentItems = [];
  let catalogue = [];
  let requete = 0;

  function money(value) {
    return `${new Intl.NumberFormat('fr-FR').format(value || 0)} FCFA`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));
  }

  function lireJson(cle, defaut) {
    try { return JSON.parse(localStorage.getItem(cle)) ?? defaut; } catch (_) { return defaut; }
  }

  function ecrireJson(cle, valeur) {
    try { localStorage.setItem(cle, JSON.stringify(valeur)); } catch (_) { /* stockage indisponible */ }
  }

  // ── Liste familiale gardée sur l'appareil ──
  function lireListe() {
    const liste = lireJson(CLE_LISTE, {}) || {};
    return {
      articles: Array.isArray(liste.articles) ? liste.articles.filter((cle) => typeof cle === 'string') : null,
      personnes: Number(liste.personnes) || 4,
      frequence: liste.frequence === 'mois' ? 'mois' : 'semaine',
      marketId: typeof liste.marketId === 'string' ? liste.marketId : ''
    };
  }

  function articlesCoches() {
    return [...(listeZone?.querySelectorAll('input[type="checkbox"]:checked') || [])].map((caseACocher) => caseACocher.value);
  }

  function enregistrerListe() {
    ecrireJson(CLE_LISTE, {
      articles: articlesCoches(),
      personnes: Number(personnesSelect?.value) || 4,
      frequence: frequenceSelect?.value === 'mois' ? 'mois' : 'semaine',
      marketId: marketSelect?.value || ''
    });
  }

  function afficherListe() {
    if (!listeZone) return;
    const ravitaillement = catalogue.find((service) => service.slug === RAVITAILLEMENT);
    if (!ravitaillement) { listeZone.innerHTML = ''; return; }
    const memoire = lireListe();
    const coches = memoire.articles || ravitaillement.items.map((item) => item.key);
    listeZone.innerHTML = `<legend>Ma liste familiale <small>gardée sur cet appareil</small></legend>${
      ravitaillement.items.map((item) => `<label class="services-liste-article"><input type="checkbox" value="${escapeHtml(item.key)}" ${coches.includes(item.key) ? 'checked' : ''}/> ${escapeHtml(item.label)}</label>`).join('')
    }`;
    listeZone.querySelectorAll('input').forEach((caseACocher) => caseACocher.addEventListener('change', () => {
      enregistrerListe();
      loadAvailability();
    }));
  }

  function majModeRavitaillement() {
    const ravitaillement = currentSlug === RAVITAILLEMENT;
    document.querySelectorAll('[data-ravitaillement-seul]').forEach((zone) => { zone.hidden = !ravitaillement; });
    if (ravitaillement) {
      const memoire = lireListe();
      if (personnesSelect) personnesSelect.value = String(Math.min(Math.max(memoire.personnes, 1), PERSONNES_MAX));
      if (frequenceSelect) frequenceSelect.value = memoire.frequence;
    }
  }

  // ── Panier ──
  function addProductsToCart(products) {
    const cart = lireJson('cart', []) || [];
    const valides = products.filter(Boolean);
    valides.forEach((product) => {
      const existing = cart.find((item) => item.productId === String(product.id));
      if (existing) {
        existing.quantity += 1;
        return;
      }
      cart.push({
        productId: String(product.id),
        name: product.name,
        price: Number(product.price) || 0,
        quantity: 1,
        shopId: product.shop?.id || null,
        shopName: product.shop?.name || null,
        marketId: product.shop?.marketId || null,
        marketName: product.shop?.marketName || null,
        image: product.images?.[0] || null
      });
    });
    ecrireJson('cart', cart);
    return valides.length;
  }

  // Le produit retenu pour un ingrédient : le choix de la liste déroulante,
  // à défaut celui que le serveur propose en premier.
  function produitChoisi(index) {
    const item = currentItems[index];
    if (!item?.products?.length) return null;
    const select = result?.querySelector(`[data-service-choix="${index}"]`);
    return item.products.find((product) => String(product.id) === select?.value) || item.products[0];
  }

  function majTotal() {
    const choisis = currentItems.map((_, index) => produitChoisi(index)).filter(Boolean);
    const total = result?.querySelector('[data-service-total]');
    if (total) total.textContent = money(choisis.reduce((somme, product) => somme + (product.price || 0), 0));
    const vendeurs = result?.querySelector('[data-service-vendeurs]');
    if (vendeurs) {
      const n = new Set(choisis.map((product) => product.shop?.id).filter(Boolean)).size;
      vendeurs.textContent = n > 1
        ? `Ces articles viennent de ${n} vendeurs : votre panier les regroupe, chaque vendeur prépare sa part.`
        : 'Tous ces articles viennent du même vendeur.';
    }
  }

  function bindActions() {
    result?.querySelectorAll('[data-service-choix]').forEach((select) => {
      select.addEventListener('change', majTotal);
    });
    result?.querySelectorAll('[data-service-add]').forEach((button) => {
      button.addEventListener('click', () => {
        if (addProductsToCart([produitChoisi(Number(button.dataset.serviceAdd))])) {
          button.textContent = 'Ajouté ✓';
          button.disabled = true;
        }
      });
    });
    const tout = result?.querySelector('[data-service-add-all]');
    tout?.addEventListener('click', () => {
      const count = addProductsToCart(currentItems.map((_, index) => produitChoisi(index)));
      if (!count) return;
      tout.textContent = `${count} article${count > 1 ? 's' : ''} ajouté${count > 1 ? 's' : ''} ✓`;
      tout.disabled = true;
      result.querySelectorAll('[data-service-add]').forEach((button) => { button.textContent = 'Ajouté ✓'; button.disabled = true; });
    });
  }

  function ligneIngredient(item, index) {
    const produits = item.products || [];
    let choix = '<span class="is-missing">Pas encore proposé ici</span>';
    if (produits.length === 1) {
      choix = `<span class="is-available">${escapeHtml(produits[0].name)} · ${money(produits[0].price)} · ${escapeHtml(produits[0].shop?.name || 'Vendeur')}</span>`;
    } else if (produits.length > 1) {
      choix = `<select class="services-live-choix" data-service-choix="${index}" aria-label="Choisir le produit : ${escapeHtml(item.label)}">${
        produits.map((product) => `<option value="${escapeHtml(product.id)}">${escapeHtml(product.name)} · ${money(product.price)} · ${escapeHtml(product.shop?.name || 'Vendeur')}</option>`).join('')
      }</select>`;
    }
    return `<div class="services-live-item"><div><strong>${escapeHtml(item.label)}</strong><small>Conseillé : ${escapeHtml(item.quantityHint)}</small></div>${choix}${produits.length ? `<button type="button" class="services-live-add" data-service-add="${index}">Ajouter</button>` : ''}</div>`;
  }

  function renderAvailability(payload) {
    if (!result) return;
    const items = payload.items || [];
    currentItems = items;
    const disponibles = items.filter((item) => item.available).length;

    if (!items.length) {
      result.innerHTML = '<p>Cochez au moins un article de votre liste pour voir les prix.</p>';
      if (status) status.textContent = 'Liste vide';
      return;
    }
    if (!disponibles) {
      const dansMarche = Boolean(marketSelect?.value);
      result.innerHTML = `${items.map(ligneIngredient).join('')}<p class="services-live-vide">Aucun vendeur ${dansMarche ? 'de ce marché ' : ''}ne propose encore ces produits en ligne. ${dansMarche ? 'Essayez « Tous les marchés » ou ' : ''}<a href="marche-senegal-recherche.html">cherchez un produit</a>.</p>`;
      if (status) status.textContent = 'Pas encore disponible';
      return;
    }

    const resume = payload.complete
      ? 'Panier complet'
      : `${disponibles} article${disponibles > 1 ? 's' : ''} sur ${items.length} disponible${disponibles > 1 ? 's' : ''}`;
    result.innerHTML = items.map(ligneIngredient).join('')
      + `<div class="services-live-total"><span>${resume} · un exemplaire de chaque</span><strong data-service-total></strong></div>`
      + '<p class="services-live-vendeurs" data-service-vendeurs></p>'
      + `<div class="services-live-actions"><button type="button" class="services-live-add-all" data-service-add-all>Ajouter ${disponibles > 1 ? `les ${disponibles} articles` : "l'article"} au panier</button><a href="marche-senegal-panier.html">Voir mon panier <span aria-hidden="true">→</span></a></div>`;
    if (status) status.textContent = payload.complete ? 'Tout est disponible' : 'Disponibilité partielle';
    majTotal();
    bindActions();
  }

  async function loadAvailability() {
    if (!result || typeof apiCall !== 'function') return;
    const params = new URLSearchParams();
    if (marketSelect?.value) params.set('marketId', marketSelect.value);
    params.set('personnes', personnesSelect?.value || '4');
    const numero = ++requete;
    if (currentSlug === RAVITAILLEMENT) {
      params.set('frequence', frequenceSelect?.value === 'mois' ? 'mois' : 'semaine');
      const coches = articlesCoches();
      if (!coches.length) { renderAvailability({ items: [] }); return; }
      params.set('articles', coches.join(','));
    }

    result.innerHTML = '<p class="services-live-loading">Recherche des produits disponibles…</p>';
    if (status) status.textContent = 'Recherche…';
    const response = await apiCall(`/api/services/${encodeURIComponent(currentSlug)}/availability?${params}`, { redirectOnUnauthorized: false });
    if (numero !== requete) return; // une recherche plus récente a pris la main
    if (!response.success) {
      result.innerHTML = `<p>${escapeHtml(response.message || 'La disponibilité est momentanément indisponible.')} Réessayez dans un instant.</p>`;
      if (status) status.textContent = 'Connexion indisponible';
      return;
    }
    renderAvailability(response.data);
  }

  function choisirService(slug) {
    const tab = document.querySelector(`[data-service-slug="${slug}"]`);
    if (!tab) return;
    currentSlug = slug;
    document.querySelectorAll('[data-service-slug]').forEach((item) => {
      const actif = item === tab;
      item.classList.toggle('is-active', actif);
      item.setAttribute('aria-selected', actif ? 'true' : 'false');
    });
    majModeRavitaillement();
    loadAvailability();
  }

  async function loadMarkets(marcheVoulu) {
    if (!marketSelect || typeof getMarkets !== 'function') return;
    const response = await getMarkets();
    if (!response.success) return;
    (response.data || []).forEach((market) => {
      const option = document.createElement('option');
      option.value = market.id;
      option.textContent = market.city ? `${market.name} · ${market.city}` : market.name;
      marketSelect.appendChild(option);
    });
    if (marcheVoulu && [...marketSelect.options].some((option) => option.value === marcheVoulu)) {
      marketSelect.value = marcheVoulu;
    }
  }

  async function loadCatalogue() {
    const response = await apiCall('/api/services', { redirectOnUnauthorized: false });
    if (response.success) catalogue = response.data || [];
    afficherListe();
  }

  function remplirPersonnes() {
    if (!personnesSelect || personnesSelect.options.length) return;
    for (let n = 1; n <= PERSONNES_MAX; n += 1) {
      const option = document.createElement('option');
      option.value = String(n);
      option.textContent = `${n} personne${n > 1 ? 's' : ''}`;
      personnesSelect.appendChild(option);
    }
    personnesSelect.value = '4';
  }

  let demarre = false;
  async function demarrer() {
    if (demarre || !result || typeof apiCall !== 'function') return;
    demarre = true;
    remplirPersonnes();
    const params = new URLSearchParams(window.location.search);
    const veutRavitaillement = window.location.hash === '#mon-ravitaillement' || params.get('service') === RAVITAILLEMENT;
    const serviceVoulu = veutRavitaillement ? RAVITAILLEMENT : params.get('service');
    await Promise.all([loadMarkets(params.get('marche') || lireListe().marketId), loadCatalogue()]);
    choisirService(serviceVoulu && document.querySelector(`[data-service-slug="${serviceVoulu}"]`) ? serviceVoulu : currentSlug);
  }

  document.querySelectorAll('[data-service-slug]').forEach((tab) => {
    tab.addEventListener('click', () => choisirService(tab.dataset.serviceSlug));
  });
  document.querySelectorAll('[data-service-aller]').forEach((lien) => {
    lien.addEventListener('click', () => choisirService(lien.dataset.serviceAller));
  });
  [marketSelect, personnesSelect, frequenceSelect].forEach((select) => select?.addEventListener('change', () => {
    if (currentSlug === RAVITAILLEMENT) enregistrerListe();
    loadAvailability();
  }));
  document.querySelectorAll('[data-service-analytics]').forEach((link) => {
    link.addEventListener('click', () => {
      try { localStorage.setItem(CLE_VISITE, new Date().toISOString()); } catch (_) { /* stockage facultatif */ }
    });
  });
  document.addEventListener('DOMContentLoaded', demarrer);
})();
