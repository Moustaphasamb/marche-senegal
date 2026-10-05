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

  // Vue 360° assemblée par le serveur à partir de photos prises en tournant sur place.
  const SERIE_MIN = 6;
  const SERIE_MAX = 20;

  // « Filmer ma boutique » : le vendeur filme 20 à 30 s en tournant sur place, le
  // téléphone en tire 18 images (deux voisines se chevauchent largement, ce qui rend
  // l'assemblage plus sûr qu'avec des photos), et seules ces images partent en 4G.
  const IMAGES_VIDEO = 18;
  const VIDEO_MIN_S = 8;
  const VIDEO_MAX_S = 90;
  const VIDEO_ILLISIBLE = 'Cette vidéo n’a pas pu être lue. Filmez en mode vidéo normal (ni ralenti ni HDR), puis réessayez.';

  // Milieu de chaque tranche de la vidéo : ni la toute première ni la toute dernière image.
  function instantsVideo(duree, nombre) {
    return Array.from({ length: nombre }, (_, i) => duree * (i + 0.5) / nombre);
  }

  function verifierVideo(fichier) {
    return fichier && String(fichier.type || '').startsWith('video/') ? null : 'Choisissez une vidéo du tour de votre boutique.';
  }

  function verifierDureeVideo(duree) {
    if (!Number.isFinite(duree) || duree <= 0) return VIDEO_ILLISIBLE;
    if (duree < VIDEO_MIN_S) return 'La vidéo est trop courte : filmez 20 à 30 secondes en faisant un tour complet sur vous-même.';
    if (duree > VIDEO_MAX_S) return 'La vidéo est trop longue : 1 minute 30 au maximum, 20 à 30 secondes suffisent.';
    return null;
  }

  // L'assemblage suit l'ordre de prise : l'heure de la photo, puis son numéro
  // (IMG_9 avant IMG_10) quand le téléphone donne la même heure à toutes.
  function ordonnerSerie(fichiers) {
    return Array.from(fichiers || []).sort((a, b) =>
      ((a.lastModified || 0) - (b.lastModified || 0)) || String(a.name).localeCompare(String(b.name), 'fr', { numeric: true }));
  }

  function verifierSerie(fichiers) {
    const liste = Array.from(fichiers || []);
    if (liste.length < SERIE_MIN) return `Choisissez au moins ${SERIE_MIN} photos qui font le tour de la boutique.`;
    if (liste.length > SERIE_MAX) return `${SERIE_MAX} photos au maximum.`;
    if (liste.some(f => !TYPES_PHOTO.includes(f.type))) return 'Choisissez des photos JPG, PNG ou WebP.';
    return null;
  }

  // Partie 2b. Morceau de photo envoyé à l'IA : la zone tracée avec 20 % de marge, ou
  // un cadre autour d'un simple point. Le cadre reste dans la photo.
  function zoneDeDecoupe(pos) {
    const w = Math.min(1, nombre(pos.w) ? pos.w * 1.2 : 0.16);
    const h = Math.min(1, nombre(pos.h) ? pos.h * 1.2 : 0.24);
    const x = Math.min(1 - w / 2, Math.max(w / 2, pos.x));
    const y = Math.min(1 - h / 2, Math.max(h / 2, pos.y));
    return { x: arrondi(x), y: arrondi(y), w: arrondi(w), h: arrondi(h) };
  }

  // Fiche proposée par l'IA, complétée par le vendeur avant création.
  function verifierFiche(f) {
    if (!String(f.nom || '').trim()) return 'Donnez un nom au produit.';
    if (!String(f.description || '').trim()) return 'Ajoutez une courte description.';
    if (!f.categorieId) return 'Choisissez une catégorie.';
    const prix = String(f.prix ?? '').trim();
    if (!prix) return 'Indiquez votre prix en FCFA.';
    if (!/^\d+$/.test(prix) || Number(prix) <= 0) return 'Le prix est un nombre entier de FCFA, sans virgule.';
    if (!/^\d+$/.test(String(f.stock ?? '1').trim())) return 'Le stock est un nombre entier, 0 ou plus.';
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

  // Un point peut porter la zone de son produit (largeur w, hauteur h en fractions).
  const nombre = v => typeof v === 'number' && Number.isFinite(v);
  const point = p => (nombre(p.w) && nombre(p.h)
    ? { productId: p.productId, x: p.x, y: p.y, w: p.w, h: p.h }
    : { productId: p.productId, x: p.x, y: p.y });

  // Rectangle tracé au doigt ou à la souris sur une photo à plat -> zone (centre et taille),
  // coupée au bord de la photo. Moins de 2 % de côté : c'était un toucher, pas une zone.
  function zoneDansPhoto(rect, x0, y0, x1, y1) {
    if (!rect || !(rect.width > 0) || !(rect.height > 0)) return null;
    const fx = v => borne((v - rect.left) / rect.width);
    const fy = v => borne((v - rect.top) / rect.height);
    const g = Math.min(fx(x0), fx(x1)), d = Math.max(fx(x0), fx(x1));
    const h = Math.min(fy(y0), fy(y1)), b = Math.max(fy(y0), fy(y1));
    if (d - g < 0.02 || b - h < 0.02) return null;
    return { x: arrondi((g + d) / 2), y: arrondi((h + b) / 2), w: arrondi(d - g), h: arrondi(b - h) };
  }
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

  // Bilan de l'étape 4 : ce qui part en ligne, et des conseils qui n'empêchent pas de
  // publier. Sans catalogue (produits null), rien n'est dit sur les produits oubliés.
  function bilan({ vues, produits }) {
    const s = n => (n > 1 ? 's' : '');
    const places = new Set(vues.flatMap(v => (v.hotspots || []).map(p => p.productId)));
    const etiquettes = vues.reduce((n, v) => n + (v.labels || []).length, 0);
    const resume = `${vues.length} photo${s(vues.length)} · ${places.size} produit${s(places.size)} placé${s(places.size)} · ${etiquettes} rayon${s(etiquettes)} étiqueté${s(etiquettes)}`;
    const conseils = [];
    const oublies = Array.isArray(produits) ? produitsNonPlaces(vues, produits) : [];
    if (oublies.length) {
      const noms = oublies.slice(0, 3).map(p => p.name).join(', ') + (oublies.length > 3 ? '…' : '.');
      conseils.push({ etape: 2, texte: oublies.length > 1 ? `${oublies.length} produits en vente ne sont sur aucune photo : ${noms}` : `1 produit en vente n’est sur aucune photo : ${noms}` });
    }
    for (const v of vues) {
      if (!(v.hotspots || []).length) conseils.push({ etape: 2, sceneId: v.id, texte: `La photo « ${v.title} » n’a aucun produit.` });
    }
    return { resume, conseils };
  }

  // Partage après publication : wa.me ouvre WhatsApp avec le message prêt à envoyer.
  function lienWhatsApp(nom, lien) {
    const texte = `Venez visiter ma boutique ${nom ? nom + ' ' : ''}sur Marché Sénégal : ${lien}`;
    return 'https://wa.me/?text=' + encodeURIComponent(texte);
  }

  // Chaque action de l'éditeur et sa route serveur (plan 1).
  // apiCall ne lève jamais : une coupure réseau (ou une réponse illisible) revient avec
  // ce message exact. On la marque « reseau » pour que l'écran propose de réessayer,
  // sans confondre avec un refus du serveur qui contiendrait le mot « connexion ».
  const RESEAU = 'Erreur de connexion au serveur';
  const marquer = r => (r && r.success === false && r.message === RESEAU ? { ...r, reseau: true } : r);

  function creerApi({ apiCall, envoyerFichier, envoyerSerie, telechargerPhotos, assemblerAdresses, extraireImages, decouperPhoto, envoyerPhotoProduit, fichierEnImage }) {
    const appel = async (...args) => marquer(await apiCall(...args));
    const base = '/api/shops/me/shopvision';
    const avec = (method, corps) => ({ method, body: JSON.stringify(corps) });
    const scene = id => base + '/scenes/' + encodeURIComponent(id);
    return {
      ouvrir: () => appel(base + '/draft'),
      catalogue: () => appel('/api/shops/products'),
      creerVue: v => appel(base + '/scenes', avec('POST', { title: v.title, imageUrl: v.imageUrl, hotspots: [] })),
      enregistrerVue: v => appel(scene(v.id), avec('PUT', {
        title: v.title, imageUrl: v.imageUrl,
        hotspots: (v.hotspots || []).map(point), labels: (v.labels || []).map(etiquette)
      })),
      supprimerVue: id => appel(scene(id), { method: 'DELETE' }),
      ordonnerVues: ids => appel(base + '/scenes-order', avec('PUT', { ids })),
      ordonnerRayons: ids => appel(base + '/rayons', avec('PUT', { ids })),
      reprendreVitrine: () => appel(base + '/import-vitrine', { method: 'POST' }),
      publier: () => appel(base + '/publish', { method: 'POST' }),
      abandonner: () => appel(base + '/draft', { method: 'DELETE' }),
      envoyerPhoto: async fichier => marquer(await envoyerFichier(fichier)),
      // `suivi` reçoit la progression (« Envoi des photos : 4 sur 11… ») pour l'écran.
      assembler360: async (fichiers, suivi) => marquer(await envoyerSerie(fichiers, suivi)),
      // Vidéo du tour → images, sur le téléphone : la vidéo elle-même n'est jamais envoyée.
      videoEnImages: async (fichier, suivi) => {
        try { return { success: true, fichiers: await extraireImages(fichier, suivi) }; } catch (erreur) {
          return { success: false, message: erreur && erreur.vendeur ? erreur.message : VIDEO_ILLISIBLE };
        }
      },
      // Partie 2b : l'IA reconnaît l'article (zone découpée dans la photo, ou photo de près).
      decouper: async (adresse, pos) => {
        try { return { success: true, image: await decouperPhoto(adresse, zoneDeDecoupe(pos)) }; } catch { return { success: false, message: RESEAU, reseau: true }; }
      },
      identifier: async (adresse, pos) => {
        let image;
        try { image = await decouperPhoto(adresse, zoneDeDecoupe(pos)); } catch { return { success: false, message: RESEAU, reseau: true }; }
        return appel(base + '/identifier', avec('POST', { image }));
      },
      identifierImage: image => appel(base + '/identifier', avec('POST', { image })),
      imageDuFichier: async fichier => {
        try { return { success: true, image: await fichierEnImage(fichier) }; } catch { return { success: false, message: 'Cette photo n’a pas pu être lue. Choisissez une photo JPG ou PNG.' }; }
      },
      categories: () => appel('/api/categories'),
      creerProduit: p => appel('/api/products', avec('POST', p)),
      envoyerPhotoProduit: async image => marquer(await envoyerPhotoProduit(image)),
      // Photos déjà en ligne : le serveur les assemble directement ; sans cette
      // possibilité, on les retélécharge pour les renvoyer en série.
      assemblerVues: async (adresses, suivi) => {
        if (assemblerAdresses) return marquer(await assemblerAdresses(adresses, suivi));
        let fichiers;
        try { fichiers = await telechargerPhotos(adresses); } catch { return { success: false, message: RESEAU, reseau: true }; }
        return marquer(await envoyerSerie(fichiers));
      }
    };
  }

  const api = {
    MAX_VUES, MAX_POINTS, SERIE_MIN, SERIE_MAX, IMAGES_VIDEO, instantsVideo, verifierVideo, verifierDureeVideo, positionDansPhoto, zoneDansPhoto, zoneDeDecoupe, verifierFiche, verifierFichier, ordonnerSerie, verifierSerie, deplacer, rayonsOrdonnes,
    ajouterPoint, remplacerPoint, retirerPoint, poserEtiquette, retirerEtiquette, etiquetteDe,
    produitsNonPlaces, controles, bilan, lienWhatsApp, creerApi
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VitrineEditeurCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
