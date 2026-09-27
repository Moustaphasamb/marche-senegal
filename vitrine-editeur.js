// Règles de l'éditeur de vitrine (assistant vendeur) : aucune dépendance au DOM ni au réseau.
(function (root) {
  'use strict';
  const MAX_VUES = 8;
  const MAX_POINTS = 50;
  const TYPES_PHOTO = ['image/jpeg', 'image/png', 'image/webp'];
  const POIDS_MAX = 15 * 1024 * 1024;

  const borne = v => Math.min(1, Math.max(0, v));
  const arrondi = v => Math.round(v * 10000) / 10000;

  // Position d'un toucher en fraction (0 à 1) de la photo affichée : la photo change
  // de taille selon l'écran, des pixels décaleraient les points.
  function positionDansPhoto(rect, clientX, clientY) {
    if (!rect || !(rect.width > 0) || !(rect.height > 0)) return null;
    return { x: arrondi(borne((clientX - rect.left) / rect.width)), y: arrondi(borne((clientY - rect.top) / rect.height)) };
  }

  function verifierFichier(fichier) {
    if (!fichier) return 'Aucune photo choisie.';
    if (!TYPES_PHOTO.includes(fichier.type)) return 'Choisissez une photo JPG, PNG ou WebP.';
    if (fichier.size > POIDS_MAX) return 'Cette photo dépasse 15 Mo. Choisissez une version plus légère.';
    return null;
  }

  function deplacer(liste, index, sens) {
    const cible = index + sens;
    const copie = liste.slice();
    if (index < 0 || index >= liste.length || cible < 0 || cible >= liste.length) return copie;
    [copie[index], copie[cible]] = [copie[cible], copie[index]];
    return copie;
  }

  function rayonsOrdonnes(rayons, ordre) {
    const rang = new Map((Array.isArray(ordre) ? ordre : []).map((id, i) => [id, i]));
    const place = r => (rang.has(r.id) ? rang.get(r.id) : Infinity);
    return rayons.slice().sort((a, b) => (place(a) !== place(b) ? place(a) - place(b) : a.name.localeCompare(b.name, 'fr')));
  }

  const point = p => ({ productId: p.productId, x: p.x, y: p.y });
  const etiquette = l => ({ categoryId: l.categoryId, x: l.x, y: l.y });

  function ajouterPoint(vue, p) {
    const pts = vue.hotspots || [];
    if (pts.length >= MAX_POINTS) return null;
    return { ...vue, hotspots: [...pts, point(p)] };
  }
  const remplacerPoint = (vue, index, p) => ({ ...vue, hotspots: (vue.hotspots || []).map((q, i) => (i === index ? point(p) : q)) });
  const retirerPoint = (vue, index) => ({ ...vue, hotspots: (vue.hotspots || []).filter((_, i) => i !== index) });

  // Une étiquette par rayon sur l'ensemble des vues. La vue qui la perd est
  // enregistrée avant celle qui la reçoit : jamais deux étiquettes du même rayon.
  function poserEtiquette(vues, sceneId, categoryId, pos) {
    const perdent = [];
    const nouvelles = vues.map(v => {
      const sans = (v.labels || []).filter(l => l.categoryId !== categoryId);
      if (v.id === sceneId) return { ...v, labels: [...sans, { categoryId, x: pos.x, y: pos.y }] };
      if (sans.length !== (v.labels || []).length) { perdent.push(v.id); return { ...v, labels: sans }; }
      return v;
    });
    return { vues: nouvelles, modifiees: [...perdent, sceneId] };
  }

  function retirerEtiquette(vues, categoryId) {
    const modifiees = [];
    const nouvelles = vues.map(v => {
      const sans = (v.labels || []).filter(l => l.categoryId !== categoryId);
      if (sans.length === (v.labels || []).length) return v;
      modifiees.push(v.id);
      return { ...v, labels: sans };
    });
    return { vues: nouvelles, modifiees };
  }

  function etiquetteDe(vues, categoryId) {
    for (const v of vues) {
      const l = (v.labels || []).find(x => x.categoryId === categoryId);
      if (l) return { sceneId: v.id, x: l.x, y: l.y };
    }
    return null;
  }

  function produitsNonPlaces(vues, produits) {
    const places = new Set(vues.flatMap(v => (v.hotspots || []).map(p => p.productId)));
    return (produits || []).filter(p => p.status === 'ACTIVE' && !places.has(p.id));
  }

  // Liste affichée à l'étape 4. Le serveur refait ces contrôles à la publication.
  function controles({ boutiqueActive, vues, produits }) {
    const enVente = (produits || []).filter(p => p.status === 'ACTIVE');
    const idsEnVente = new Set(enVente.map(p => p.id));
    const rayonsEnVente = new Set(enVente.filter(p => p.category).map(p => p.category.id));
    const s = n => (n > 1 ? 's' : '');
    const lignes = [
      { ok: !!boutiqueActive, texte: boutiqueActive ? 'Votre boutique est active.' : 'Votre boutique doit être validée avant de publier.' },
      { ok: vues.length > 0, texte: vues.length ? `${vues.length} photo${s(vues.length)} prête${s(vues.length)}.` : 'Ajoutez au moins une photo.' }
    ];
    for (const v of vues) {
      const horsVente = (v.hotspots || []).filter(p => !idsEnVente.has(p.productId)).length;
      if (horsVente) lignes.push({ ok: false, sceneId: v.id, etape: 2, texte: `« ${v.title} » : ${horsVente} point${s(horsVente)} vise${horsVente > 1 ? 'nt' : ''} un produit qui n’est plus en vente.` });
      for (const l of v.labels || []) {
        if (!rayonsEnVente.has(l.categoryId)) lignes.push({ ok: false, sceneId: v.id, etape: 3, texte: `« ${v.title} » : une étiquette vise un rayon sans produit en vente.` });
      }
    }
    return { pret: lignes.every(l => l.ok), lignes };
  }

  // Chaque action de l'éditeur et sa route serveur (plan 1).
  function creerApi({ apiCall, envoyerFichier }) {
    const base = '/api/shops/me/shopvision';
    const avec = (method, corps) => ({ method, body: JSON.stringify(corps) });
    const scene = id => base + '/scenes/' + encodeURIComponent(id);
    return {
      ouvrir: () => apiCall(base + '/draft'),
      catalogue: () => apiCall('/api/shops/products'),
      creerVue: v => apiCall(base + '/scenes', avec('POST', { title: v.title, imageUrl: v.imageUrl, hotspots: [] })),
      enregistrerVue: v => apiCall(scene(v.id), avec('PUT', {
        title: v.title, imageUrl: v.imageUrl,
        hotspots: (v.hotspots || []).map(point), labels: (v.labels || []).map(etiquette)
      })),
      supprimerVue: id => apiCall(scene(id), { method: 'DELETE' }),
      ordonnerVues: ids => apiCall(base + '/scenes-order', avec('PUT', { ids })),
      ordonnerRayons: ids => apiCall(base + '/rayons', avec('PUT', { ids })),
      reprendreVitrine: () => apiCall(base + '/import-vitrine', { method: 'POST' }),
      publier: () => apiCall(base + '/publish', { method: 'POST' }),
      abandonner: () => apiCall(base + '/draft', { method: 'DELETE' }),
      envoyerPhoto: fichier => envoyerFichier(fichier)
    };
  }

  const api = {
    MAX_VUES, MAX_POINTS, positionDansPhoto, verifierFichier, deplacer, rayonsOrdonnes,
    ajouterPoint, remplacerPoint, retirerPoint, poserEtiquette, retirerEtiquette, etiquetteDe,
    produitsNonPlaces, controles, creerApi
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VitrineEditeurCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
