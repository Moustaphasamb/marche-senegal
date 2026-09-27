// Règles de la visite de boutique : aucune dépendance au DOM, testées avec Node.
(function (root) {
  'use strict';
  const JOUR = 86400000;

  const fcfa = n => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' FCFA';
  const coordonnee = v => typeof v === 'number' && v >= 0 && v <= 1;

  function urlImageSure(u) {
    if (typeof u !== 'string') return false;
    try { return new URL(u).protocol === 'https:'; } catch { return false; }
  }

  const enPromo = p => Number.isInteger(p.originalPrice) && p.originalPrice > p.price;

  function estNouveau(p, maintenant) {
    const t = Date.parse(p.createdAt);
    return Number.isFinite(t) && t <= maintenant && maintenant - t < 30 * JOUR;
  }

  function construireRayons(produits) {
    const parId = new Map();
    for (const p of produits) {
      const c = p.category;
      if (!c || !c.id) continue;
      const r = parId.get(c.id) || { id: c.id, label: c.name, emoji: c.emoji || '', count: 0 };
      r.count += 1;
      parId.set(c.id, r);
    }
    const rayons = [...parId.values()].sort((a, b) => a.label.localeCompare(b.label, 'fr'));
    return [{ id: 'all', label: 'Toute la boutique', emoji: '', count: produits.length }, ...rayons];
  }

  // L'API boutique ne renvoie que 20 produits : un point peut viser un produit
  // absent de la liste. La photo publiée joint alors sa fiche courte.
  function indexProduits(produits, scenes) {
    const index = new Map(produits.map(p => [p.id, p]));
    for (const s of scenes || []) {
      for (const h of s.hotspots || []) {
        if (!index.has(h.productId) && h.product && h.product.id === h.productId) {
          index.set(h.productId, { ...h.product, category: null });
        }
      }
    }
    return index;
  }

  function pointsVisibles(scene, index) {
    return ((scene && scene.hotspots) || []).filter(h => {
      const p = index.get(h.productId);
      return p && p.status === 'ACTIVE' && coordonnee(h.x) && coordonnee(h.y);
    });
  }

  function sceneDuRayon(scenes, rayonId, index, courante) {
    if (rayonId === 'all') return courante;
    const i = scenes.findIndex(s => pointsVisibles(s, index).some(h => {
      const c = index.get(h.productId).category;
      return c && c.id === rayonId;
    }));
    return i === -1 ? courante : i;
  }

  function etatStock(stock) {
    const n = Number(stock) || 0;
    if (n <= 0) return { code: 'out', texte: 'Rupture · bientôt de retour' };
    if (n <= 3) return { code: 'low', texte: `Plus que ${n} en stock` };
    return { code: 'ok', texte: 'En stock' };
  }

  function filtrerProduits(produits, { rayon = 'all', onglet = 'tous', maintenant = Date.now() } = {}) {
    return produits.filter(p =>
      (rayon === 'all' || (p.category && p.category.id === rayon))
      && (onglet !== 'promos' || enPromo(p))
      && (onglet !== 'nouveautes' || estNouveau(p, maintenant)));
  }

  function badge(p, maintenant) {
    if ((Number(p.stock) || 0) <= 0) return { code: 'out', texte: 'Rupture' };
    if (enPromo(p)) return { code: 'promo', texte: `−${Math.round((1 - p.price / p.originalPrice) * 100)} %` };
    if (estNouveau(p, maintenant)) return { code: 'new', texte: 'Nouveau' };
    return null;
  }

  function panierBoutique(cart, shopId) {
    const lignes = (Array.isArray(cart) ? cart : []).filter(l => l && l.shopId === shopId && l.quantity > 0);
    return {
      lignes,
      articles: lignes.reduce((a, l) => a + l.quantity, 0),
      total: lignes.reduce((a, l) => a + l.quantity * l.price, 0)
    };
  }

  function ajouterAuPanier(cart, produit, shop) {
    const stock = Number(produit.stock) || 0;
    const copie = (Array.isArray(cart) ? cart : []).map(l => ({ ...l }));
    const ligne = copie.find(l => l.productId === produit.id);
    if ((ligne ? ligne.quantity : 0) >= stock) return { cart: copie, ajoute: false };
    if (ligne) ligne.quantity += 1;
    else copie.push({ productId: produit.id, name: produit.name, price: produit.price, quantity: 1, shopId: shop.id, shopName: shop.name });
    return { cart: copie, ajoute: true };
  }

  function changerQuantite(cart, productId, delta, stockMax) {
    return cart
      .map(l => l.productId !== productId ? { ...l } : { ...l, quantity: Math.max(0, Math.min(l.quantity + delta, stockMax)) })
      .filter(l => l.quantity > 0);
  }

  const retirer = (cart, productId) => cart.filter(l => l.productId !== productId);
  const viderBoutique = (cart, shopId) => cart.filter(l => l.shopId !== shopId);

  function lignesConditions(shop) {
    const lignes = [];
    if (shop.deliveryEnabled && Number.isInteger(shop.deliveryFee)) {
      const a = shop.deliveryDaysMin, b = shop.deliveryDaysMax;
      let delai = '';
      if (Number.isInteger(a) && Number.isInteger(b)) delai = a === b ? ` · ${a} jour${a > 1 ? 's' : ''}` : ` · ${a} à ${b} jours`;
      lignes.push({ label: 'Livraison' + delai, valeur: shop.deliveryFee === 0 ? 'Gratuite' : fcfa(shop.deliveryFee) });
    }
    return lignes;
  }

  const api = {
    fcfa, urlImageSure, enPromo, construireRayons, indexProduits, pointsVisibles, sceneDuRayon,
    etatStock, filtrerProduits, badge, panierBoutique, ajouterAuPanier, changerQuantite,
    retirer, viderBoutique, lignesConditions
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BoutiqueVisiteCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
