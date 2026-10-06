// Règles des stories : aucune dépendance au DOM, testées avec Node.
// L'affichage (rangée, lecteur) est dans stories-ui.js.
(function (root) {
  'use strict';
  const PHOTO_MS = 5000;
  const DUREE_VIDEO_MAX = 15;
  const CLE_VUES = 'ms-stories-vues';
  const CLE_VISITEUR = 'ms-visiteur';
  const MAX_VUES = 300;

  const cloudinaire = u => typeof u === 'string' && /^https:\/\/res\.cloudinary\.com\/[^/]+\/(image|video)\/upload\//.test(u);

  // Versions légères pour la 4G : photo 1080 px, vidéo 720 px coupée à 15 s.
  function adresseMedia(story) {
    if (!story || !cloudinaire(story.mediaUrl)) return null;
    if (story.mediaType === 'VIDEO') {
      return story.mediaUrl.replace('/video/upload/', '/video/upload/c_limit,w_720,q_auto,vc_auto,du_15/').replace(/\.[a-z0-9]+$/i, '.mp4');
    }
    return story.mediaUrl.replace('/image/upload/', '/image/upload/c_limit,w_1080,q_auto,f_auto/');
  }
  function affiche(story) {
    if (!story || story.mediaType !== 'VIDEO' || !cloudinaire(story.mediaUrl)) return null;
    return story.mediaUrl.replace('/video/upload/', '/video/upload/so_0,c_limit,w_720/').replace(/\.[a-z0-9]+$/i, '.jpg');
  }
  function vignette(story) {
    if (!story || !cloudinaire(story.mediaUrl)) return null;
    if (story.mediaType === 'VIDEO') {
      return story.mediaUrl.replace('/video/upload/', '/video/upload/so_0,c_fill,w_160,h_160/').replace(/\.[a-z0-9]+$/i, '.jpg');
    }
    return story.mediaUrl.replace('/image/upload/', '/image/upload/c_fill,w_160,h_160,q_auto,f_auto/');
  }

  // ── Mémoire du navigateur : peut être bloquée (navigation privée) ──
  function vuesDe(stockage) {
    try {
      const v = JSON.parse(stockage.getItem(CLE_VUES) || '[]');
      return new Set(Array.isArray(v) ? v : []);
    } catch { return new Set(); }
  }
  function noterVue(stockage, id) {
    try {
      const v = [...vuesDe(stockage)].filter(x => x !== id);
      v.push(id);
      stockage.setItem(CLE_VUES, JSON.stringify(v.slice(-MAX_VUES)));
    } catch { /* la story sera simplement montrée comme non vue */ }
  }
  function identifiantVisiteur(stockage, fabriquer) {
    try {
      let id = stockage.getItem(CLE_VISITEUR);
      if (!/^[0-9a-f-]{36}$/i.test(id || '')) { id = fabriquer(); stockage.setItem(CLE_VISITEUR, id); }
      return id;
    } catch { return fabriquer(); }
  }

  // ── Rangée et navigation ──
  const toutVu = (groupe, vues) => groupe.stories.every(s => vues.has(s.id));
  const estPro = g => g.shop.plan === 'PRO' || g.shop.plan === 'BUSINESS';
  const derniere = g => Math.max(...g.stories.map(s => new Date(s.createdAt).getTime()));
  function ordonnerRangee(groupes, vues) {
    return (groupes || [])
      .filter(g => g && g.shop && Array.isArray(g.stories) && g.stories.length)
      .map(g => ({ g, vu: toutVu(g, vues) ? 1 : 0, pro: estPro(g) ? 1 : 0, t: derniere(g) }))
      .sort((a, b) => (a.vu - b.vu) || (b.pro - a.pro) || (b.t - a.t))
      .map(x => x.g);
  }
  function premiereAVoir(groupe, vues) {
    const i = groupe.stories.findIndex(s => !vues.has(s.id));
    return i < 0 ? 0 : i;
  }
  function suivante(groupes, pos) {
    if (pos.s + 1 < groupes[pos.g].stories.length) return { g: pos.g, s: pos.s + 1 };
    if (pos.g + 1 < groupes.length) return { g: pos.g + 1, s: 0 };
    return null;
  }
  function precedente(groupes, pos) {
    if (pos.s > 0) return { g: pos.g, s: pos.s - 1 };
    if (pos.g > 0) return { g: pos.g - 1, s: groupes[pos.g - 1].stories.length - 1 };
    return { g: pos.g, s: 0 };
  }

  // ── Textes ──
  function ilYA(date, maintenant = Date.now()) {
    const min = Math.max(0, Math.floor((maintenant - new Date(date).getTime()) / 60000));
    if (min < 1) return 'à l’instant';
    if (min < 60) return `il y a ${min} min`;
    return `il y a ${Math.floor(min / 60)} h`;
  }
  function tempsRestant(fin, maintenant = Date.now()) {
    const min = Math.ceil((new Date(fin).getTime() - maintenant) / 60000);
    if (min <= 0) return 'terminée';
    if (min < 60) return `encore ${min} min`;
    return `encore ${Math.floor(min / 60)} h`;
  }
  function dansCombien(date, maintenant) {
    const min = Math.ceil((new Date(date).getTime() - maintenant) / 60000);
    if (min <= 1) return 'dans 1 min';
    if (min < 60) return `dans ${min} min`;
    return `dans ${Math.ceil(min / 60)} h`;
  }
  function initiales(nom) {
    const mots = String(nom || '').trim().split(/\s+/).filter(Boolean);
    if (!mots.length) return '?';
    return (mots[0][0] + (mots[1] ? mots[1][0] : '')).toUpperCase();
  }
  function refusDuree(secondes) {
    if (!(secondes > DUREE_VIDEO_MAX + 0.5)) return null;
    return `Votre vidéo dure ${Math.round(secondes)} s. Une story dure 15 secondes au plus : coupez-la dans la galerie de votre téléphone, puis réessayez.`;
  }
  function messageLimite(plan, prochaineA, maintenant = Date.now()) {
    const attente = prochaineA ? ` Votre prochaine story est possible ${dansCombien(prochaineA, maintenant)}.` : '';
    if (!plan || plan === 'FREE') return `Avec le plan Gratuit, vous publiez 1 story par jour.${attente} Passez Pro pour en publier autant que vous voulez.`;
    return `Vous avez publié 30 stories en 24 h.${attente}`;
  }

  const api = {
    PHOTO_MS, DUREE_VIDEO_MAX, adresseMedia, affiche, vignette, vuesDe, noterVue, identifiantVisiteur,
    toutVu, ordonnerRangee, premiereAVoir, suivante, precedente, ilYA, tempsRestant, initiales, refusDuree, messageLimite
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.StoriesCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
