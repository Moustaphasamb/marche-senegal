/* Règles du studio, partagées avec les tests Node sans dépendance au DOM. */
(function (root) {
  'use strict';
  const MAX_POINTS = 50;
  const coordinate = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
  function safeImageUrl(value) {
    if (typeof value !== 'string') return null;
    try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; }
  }
  function snapshot(shop) {
    return JSON.stringify({ image: shop.showcaseUrl || null, points: (shop.showcaseHotspots || []).map(p => ({ productId: p.productId, x: p.x, y: p.y })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) });
  }
  function publication(state, products) {
    if (!state.image) throw new Error('Importez une photo avant de publier.');
    if (!Array.isArray(state.hotspots) || !state.hotspots.length) throw new Error('Ajoutez et validez au moins un point.');
    if (state.hotspots.length > MAX_POINTS) throw new Error('La vitrine peut contenir au maximum 50 points.');
    const ids = new Set(products.filter(p => p.status !== 'DELETED').map(p => p.id));
    return state.hotspots.map(p => {
      if (!ids.has(p.productId)) throw new Error('Un produit n’est plus dans votre catalogue. Corrigez son point.');
      if (!coordinate(p.x) || !coordinate(p.y)) throw new Error('Les positions doivent être comprises entre 0 et 100.');
      if (!p.approved) throw new Error('Vérifiez chaque point avant de publier.');
      return { productId: p.productId, x: p.x, y: p.y };
    });
  }
  function validDraft(value, ownerId, shopId) {
    return value && value.schema === 1 && value.ownerId === ownerId && value.shopId === shopId && typeof value.base === 'string'
      && Array.isArray(value.hotspots) && value.hotspots.length <= MAX_POINTS
      && value.hotspots.every(p => p && typeof p.id === 'string' && typeof p.productId === 'string' && coordinate(p.x) && coordinate(p.y) && typeof p.approved === 'boolean');
  }
  const api = { MAX_POINTS, coordinate, safeImageUrl, snapshot, publication, validDraft };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ShopVisionCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
