// Assistant « Ma vitrine » en 4 étapes. Chaque action est enregistrée tout de suite
// en brouillon sur le serveur ; aucune donnée ne passe par innerHTML.
(function (root) {
  'use strict';

  function monter(o) {
    const C = root.VitrineEditeurCore;
    const doc = root.document;
    const $ = id => doc.getElementById(id);
    const el = (tag, cls, texte) => {
      const e = doc.createElement(tag);
      if (cls) e.className = cls;
      if (texte != null) e.textContent = texte;
      return e;
    };
    const bouton = (cls, texte, label) => {
      const b = el('button', cls, texte);
      b.type = 'button';
      if (label) b.setAttribute('aria-label', label);
      return b;
    };
    const api = o.api;
    const confirmer = o.confirmer || (async () => true);

    // choix : position touchée en attente d'un produit (étape 2).
    // mode : { type: 'point' | 'deplacer', index } (étape 2) ou { type: 'etiquette', categoryId } (étape 3).
    const e = { etape: 1, vues: [], rayons: [], ordre: [], vitrine: false, produits: [], catalogueOk: false, courante: 0, choix: null, mode: null, occupe: false, problemes: [] };

    // Une étiquette dont le rayon n'a plus de produit ferait refuser tout l'enregistrement
    // de la photo par le serveur : elle n'est pas envoyée (l'étape 3 la montre à retirer).
    const nettoyer = vue => ({ ...vue, labels: (vue.labels || []).filter(l => e.rayons.some(r => r.id === l.categoryId)) });
    const enregistrerVue = vue => api.enregistrerVue(nettoyer(vue));

    function statut(texte, erreur, reessayer) {
      const s = $('ve-status');
      s.replaceChildren(el('span', null, texte || ''));
      s.classList.toggle('ve-error', !!erreur);
      if (reessayer) {
        const b = bouton('ve-link', 'Réessayer');
        b.onclick = reessayer;
        s.appendChild(b);
      }
    }

    async function charger(message) {
      const [d, c] = await Promise.all([api.ouvrir(), api.catalogue()]);
      if (!d || !d.success || !d.data) {
        statut((d && d.message) || 'Votre vitrine n’a pas pu être chargée.', true, () => charger());
        return false;
      }
      e.vues = d.data.scenes || [];
      e.rayons = d.data.rayons || [];
      e.ordre = d.data.rayonOrder || [];
      e.vitrine = !!d.data.vitrine;
      e.catalogueOk = !!(c && c.success);
      if (e.catalogueOk) e.produits = c.data || [];
      e.courante = Math.min(e.courante, Math.max(0, e.vues.length - 1));
      if (!e.vues.length) e.etape = 1;
      statut(message || 'Brouillon enregistré sur le serveur · pas encore publié');
      if (!e.catalogueOk) statut('Votre catalogue n’a pas pu être chargé : ' + ((c && c.message) || 'réessayez.'), true, () => charger(message));
      rendre();
      return true;
    }

    // Une action : appel au serveur, puis mise à jour de l'écran. Sans réseau, on garde
    // l'écran et on propose de réessayer ; en cas de refus, le serveur fait foi et on
    // recharge le brouillon.
    async function agir(appel, succes, textes = {}) {
      if (e.occupe) { statut('Patientez : un enregistrement est en cours.'); return null; }
      e.occupe = true;
      statut(textes.enCours || 'Enregistrement…');
      rendre();
      let r;
      try { r = await appel(); } catch { r = { success: false, reseau: true, message: 'Erreur de connexion au serveur' }; }
      e.occupe = false;
      if (r && r.success) {
        // Une correction enregistrée rend caduques les raisons d'un refus précédent.
        e.problemes = [];
        succes(r);
        statut(textes.fait || 'Enregistré · pas encore publié');
        rendre();
        return r;
      }
      const message = (r && r.message) || 'Non enregistré';
      if (r && r.reseau) {
        statut('Non enregistré · ' + message, true, () => agir(appel, succes, textes));
        rendre();
        return r;
      }
      e.problemes = r && r.data && Array.isArray(r.data.problemes) ? r.data.problemes : [];
      await charger();
      statut(message, true);
      return r;
    }

    function allerA(n) {
      e.etape = n;
      e.choix = null;
      e.mode = null;
      rendre();
    }
    doc.querySelectorAll('#ve-steps button').forEach(b => { b.onclick = () => allerA(Number(b.dataset.etape)); });

    function rendre() {
      doc.querySelectorAll('#ve-steps button').forEach(b => {
        const n = Number(b.dataset.etape);
        b.setAttribute('aria-current', String(n === e.etape));
        b.disabled = e.occupe || (n > 1 && !e.vues.length);
      });
      const panneau = $('ve-panel');
      // Le panneau est reconstruit : si le focus y était, il revient sur le titre de l'étape
      // au lieu de se perdre (lecteur d'écran, clavier).
      const focusDedans = panneau.contains(doc.activeElement);
      panneau.replaceChildren();
      panneau.setAttribute('aria-busy', String(e.occupe));
      ({ 1: etapePhotos, 2: etapeProduits, 3: etapeRayons, 4: etapePublier })[e.etape](panneau);
      const titre = panneau.querySelector('h2');
      if (titre) {
        titre.tabIndex = -1;
        if (focusDedans) titre.focus({ preventScroll: true });
      }
    }

    function navigation(p, precedent, suivant, actif = true) {
      const nav = el('div', 've-nav');
      if (precedent) { const b = bouton('ve-btn', '← ' + precedent.texte); b.onclick = () => allerA(precedent.n); nav.appendChild(b); }
      if (suivant) { const b = bouton('ve-btn ve-primary', suivant.texte + ' →'); b.disabled = !actif || e.occupe; b.onclick = () => allerA(suivant.n); nav.appendChild(b); }
      p.appendChild(nav);
    }

    // ── Étape 1 : photos ──
    function etapePhotos(p) {
      p.appendChild(el('h2', null, '1. Les photos de votre boutique'));
      p.appendChild(el('p', 've-help', `Deux façons de montrer votre boutique, à combiner si vous voulez. Bonne lumière, sans client reconnaissable ni document privé. Jusqu’à ${C.MAX_VUES} photos.`));
      const plein = e.vues.length >= C.MAX_VUES;
      const choix = el('div', 've-choix');
      choix.append(carteVue360(plein), cartePhotoSimple(plein));
      p.appendChild(choix);
      if (plein) p.appendChild(el('p', 've-help', `${C.MAX_VUES} photos au maximum : retirez-en une pour en ajouter.`));
      if (e.vitrine && !e.vues.length) {
        const carte = el('div', 've-card');
        carte.appendChild(el('p', null, 'Votre boutique a déjà une photo de vitrine. Reprenez-la comme première photo, avec ses points.'));
        const b = bouton('ve-btn ve-primary', 'Reprendre ma vitrine actuelle');
        b.disabled = e.occupe;
        b.onclick = () => agir(() => api.reprendreVitrine(), r => { e.vues = [r.data]; e.vitrine = false; });
        carte.appendChild(b);
        p.appendChild(carte);
      }
      const liste = el('ol', 've-views');
      e.vues.forEach((v, i) => {
        const li = el('li', 've-view');
        const img = el('img');
        img.src = v.imageUrl;
        img.alt = '';
        img.loading = 'lazy';
        const titre = el('input', 've-title');
        titre.value = v.title;
        titre.maxLength = 120;
        titre.disabled = e.occupe;
        titre.setAttribute('aria-label', 'Nom de la photo ' + (i + 1));
        titre.onchange = () => {
          const t = titre.value.trim();
          if (!t) { titre.value = v.title; statut('Donnez un nom à cette photo.', true); return; }
          agir(() => enregistrerVue({ ...v, title: t }), r => { e.vues[i] = r.data; });
        };
        const ordonner = sens => {
          const nouvelles = C.deplacer(e.vues, i, sens);
          agir(() => api.ordonnerVues(nouvelles.map(x => x.id)), () => { e.vues = nouvelles; });
        };
        const haut = bouton('ve-icon', '↑', 'Monter ' + v.title);
        haut.disabled = i === 0 || e.occupe;
        haut.onclick = () => ordonner(-1);
        const bas = bouton('ve-icon', '↓', 'Descendre ' + v.title);
        bas.disabled = i === e.vues.length - 1 || e.occupe;
        bas.onclick = () => ordonner(1);
        const suppr = bouton('ve-icon ve-danger', '✕', 'Supprimer ' + v.title);
        suppr.disabled = e.occupe;
        suppr.onclick = async () => {
          if (!await confirmer('Supprimer la photo « ' + v.title + ' » et ses points ? Votre vitrine en ligne ne change pas avant la publication.')) return;
          agir(() => api.supprimerVue(v.id), () => { e.vues = e.vues.filter(x => x.id !== v.id); });
        };
        verifierRonde(v.imageUrl);
        // Toucher la vignette d'une vue 360° l'affiche dans l'aperçu ci-dessous.
        const vignette = bouton('ve-vignette', null, 'Voir ' + v.title);
        vignette.appendChild(img);
        vignette.onclick = () => { e.apercu = v.id; rendre(); };
        const genre = estRonde(v.imageUrl) ? el('span', 'v360-badge', '360°') : el('span', 've-genre', 'Photo simple');
        li.append(vignette, genre, titre, haut, bas, suppr);
        if (v.id === idApercu()) li.classList.add('ve-actif');
        liste.appendChild(li);
      });
      if (e.vues.length) p.appendChild(el('h3', 've-sous-titre', `Vos photos (${e.vues.length})`));
      p.appendChild(liste);
      const simples = e.vues.filter(v => !estRonde(v.imageUrl) && (rondes.has(v.imageUrl) || !root.Vue360));
      if (simples.length >= C.SERIE_MIN) p.appendChild(carteAssembler(simples, plein));
      const apercu = e.vues.find(v => v.id === idApercu());
      if (apercu) {
        p.appendChild(el('h3', 've-sous-titre', 'Aperçu : tournez dans votre boutique'));
        photo(p, apercu, () => {}, 'Voici ce que verra le client. Glissez pour tourner ; les produits se placent à l’étape suivante.');
      }
      navigation(p, null, { n: 2, texte: 'Placer mes produits' }, e.vues.length > 0);
    }

    // Vue 360° à montrer dans l'aperçu : celle que le vendeur a touchée, sinon la dernière créée.
    function idApercu() {
      const rondesVues = e.vues.filter(v => estRonde(v.imageUrl));
      const choisie = rondesVues.find(v => v.id === e.apercu);
      return (choisie || rondesVues[rondesVues.length - 1] || {}).id;
    }

    // Vue 360° : le vendeur fait le tour de sa boutique en photos, le serveur les recolle.
    function carteVue360(plein) {
      const carte = el('section', 've-card ve-choix-carte ve-360-carte');
      carte.setAttribute('aria-label', 'Vue 360° de la boutique');
      const tete = el('div', 've-choix-tete');
      tete.append(el('span', 'v360-badge', '360°'), el('span', 've-conseille', 'Conseillé'));
      carte.appendChild(tete);
      carte.appendChild(el('h3', null, 'Vue 360° de ma boutique'));
      carte.appendChild(el('p', 've-help', 'Le client tourne dans votre boutique, à gauche et à droite, comme s’il y était.'));
      const guide = el('details', 've-guide');
      guide.open = !e.vues.length;
      guide.appendChild(el('summary', null, 'Comment prendre les photos'));
      const etapes = el('ol', 've-360-etapes');
      for (const t of [
        'Placez-vous au milieu de la boutique.',
        'Téléphone droit, à hauteur des yeux, en mode photo normal.',
        'Prenez une photo, tournez d’un petit pas vers la droite, reprenez une photo. Chaque photo reprend un tiers de la précédente.',
        `Continuez jusqu’à revenir au point de départ : ${C.SERIE_MIN} à ${C.SERIE_MAX} photos, 12 en général.`,
        'Restez sur place et évitez que des personnes passent devant.'
      ]) etapes.appendChild(el('li', null, t));
      guide.appendChild(etapes);
      carte.appendChild(guide);
      const b = bouton('ve-btn ve-primary', 'Choisir mes photos du tour');
      b.disabled = e.occupe || plein;
      b.onclick = () => $('ve-serie').click();
      carte.appendChild(b);
      return carte;
    }

    function cartePhotoSimple(plein) {
      const carte = el('section', 've-card ve-choix-carte');
      carte.setAttribute('aria-label', 'Photo simple');
      carte.appendChild(el('div', 've-choix-tete')).appendChild(el('span', 've-genre', 'Photo simple'));
      carte.appendChild(el('h3', null, 'Une photo d’un rayon ou d’un mur'));
      carte.appendChild(el('p', 've-help', 'Une seule photo, sans tourner. Une photo 360° prise avec une caméra 360° s’ajoute aussi ici.'));
      const ajout = el('div', 've-add');
      const galerie = bouton('ve-btn', 'Ajouter une photo');
      galerie.disabled = plein || e.occupe;
      galerie.onclick = () => $('ve-file').click();
      const camera = bouton('ve-btn', 'Prendre une photo');
      camera.disabled = plein || e.occupe;
      camera.onclick = () => $('ve-camera').click();
      ajout.append(galerie, camera);
      carte.appendChild(ajout);
      return carte;
    }

    // Photos ajoutées une par une : si elles font le tour de la boutique, on les assemble.
    function carteAssembler(simples, plein) {
      const carte = el('section', 've-card ve-assembler');
      carte.appendChild(el('h3', null, `Vos ${simples.length} photos font le tour de la boutique ?`));
      carte.appendChild(el('p', 've-help', 'Assemblez-les en une vue 360°, dans l’ordre de la liste. Elles doivent montrer la même boutique, prises en tournant sur place.'));
      const b = bouton('ve-btn ve-primary', 'Assembler ces photos en 360°');
      b.disabled = e.occupe || plein;
      b.onclick = () => assemblerVues(simples);
      carte.appendChild(b);
      if (plein) carte.appendChild(el('p', 've-help', 'Retirez d’abord une photo : la vue 360° prendra sa place.'));
      return carte;
    }

    async function assemblerVues(simples) {
      let url = null;
      const r = await agir(async () => {
        if (!url) {
          const envoi = await api.assemblerVues(simples.map(v => v.imageUrl));
          if (!envoi || !envoi.success) return envoi;
          url = envoi.url;
        }
        return api.creerVue({ title: 'Vue 360°', imageUrl: url });
      }, r => { e.vues = [...e.vues, r.data]; e.apercu = r.data.id; rondes.set(r.data.imageUrl, true); }, {
        enCours: `Assemblage de vos ${simples.length} photos en vue 360°… Cela prend environ une minute, gardez la page ouverte.`,
        fait: 'Vue 360° créée · pas encore publiée'
      });
      if (!r || !r.success) return;
      const avecPoints = simples.filter(v => (v.hotspots || []).length).length;
      const question = `Vue 360° créée. Retirer les ${simples.length} photos séparées ?`
        + (avecPoints ? ` ${avecPoints} d’entre elles ont des produits placés, qui seront retirés aussi.` : '')
        + ' Votre vitrine en ligne ne change pas avant la publication.';
      if (!await confirmer(question)) return;
      const ids = new Set(simples.map(v => v.id));
      await agir(async () => {
        for (const v of simples) {
          if (!e.vues.some(x => x.id === v.id)) continue;
          const s = await api.supprimerVue(v.id);
          if (!s || !s.success) return s;
          e.vues = e.vues.filter(x => x.id !== v.id);
        }
        return { success: true };
      }, () => { e.vues = e.vues.filter(x => !ids.has(x.id)); }, { fait: 'Photos séparées retirées · pas encore publié' });
    }

    async function ajouterSerie360(fichiers) {
      const refus = C.verifierSerie(fichiers);
      if (refus) { statut(refus, true); return; }
      const serie = C.ordonnerSerie(fichiers);
      // Comme pour une photo : après une coupure, « Réessayer » ne relance pas l'assemblage déjà fait.
      let url = null;
      await agir(async () => {
        if (!url) {
          const envoi = await api.assembler360(serie);
          if (!envoi || !envoi.success) return envoi;
          url = envoi.url;
        }
        return api.creerVue({ title: 'Vue 360°', imageUrl: url });
      }, r => { e.vues = [...e.vues, r.data]; e.apercu = r.data.id; rondes.set(r.data.imageUrl, true); }, {
        enCours: `Assemblage de vos ${serie.length} photos en vue 360°… Cela prend environ une minute, gardez la page ouverte.`,
        fait: 'Vue 360° créée · pas encore publiée'
      });
    }
    $('ve-serie').onchange = () => {
      const fichiers = Array.from($('ve-serie').files || []);
      try { $('ve-serie').value = ''; } catch { /* certains navigateurs refusent */ }
      if (fichiers.length) ajouterSerie360(fichiers);
    };

    async function ajouterPhoto(fichier) {
      const refus = C.verifierFichier(fichier);
      if (refus) { statut(refus, true); return; }
      // L'adresse de la photo envoyée est gardée : « Réessayer » après une coupure ne la
      // renvoie pas une seconde fois.
      let url = null;
      await agir(async () => {
        if (!url) {
          const envoi = await api.envoyerPhoto(fichier);
          if (!envoi || !envoi.success) return envoi;
          url = envoi.url;
        }
        return api.creerVue({ title: 'Photo ' + (e.vues.length + 1), imageUrl: url });
      }, r => { e.vues = [...e.vues, r.data]; });
    }
    for (const id of ['ve-file', 've-camera']) {
      $(id).onchange = () => {
        const f = $(id).files && $(id).files[0];
        try { $(id).value = ''; } catch { /* certains navigateurs refusent */ }
        if (f) ajouterPhoto(f);
      };
    }

    // ── Étapes 2 à 4 : complétées par les tâches suivantes ──
    // ── Outils communs aux étapes 2 et 3 ──
    function selecteurVues(p) {
      if (e.vues.length < 2) return;
      const tabs = el('div', 've-tabs');
      tabs.setAttribute('role', 'group');
      tabs.setAttribute('aria-label', 'Choisir la photo');
      e.vues.forEach((v, i) => {
        const b = bouton('ve-tab', v.title);
        b.setAttribute('aria-pressed', String(i === e.courante));
        b.onclick = () => {
          e.courante = i;
          e.choix = null;
          if (e.mode && e.mode.type !== 'etiquette') e.mode = null;
          rendre();
        };
        tabs.appendChild(b);
      });
      p.appendChild(tabs);
    }

    // Photo 360° : le vendeur tourne dans sa boutique et touche l'article. Un lecteur par
    // photo, gardé entre deux affichages pour ne pas perdre l'angle de vue.
    const rondes = new Map(), lecteurs = new Map();
    const estRonde = url => rondes.get(url) === true;
    // La vignette dit si la photo est une 360° ; l'écran est redessiné quand c'en est une.
    function verifierRonde(url) {
      if (!root.Vue360 || rondes.has(url)) return;
      rondes.set(url, false);
      root.Vue360.detecter(url).then(r => { rondes.set(url, r); if (r) rendre(); });
    }
    function lecteur360(vue) {
      let l = lecteurs.get(vue.id);
      if (l && l.url === vue.imageUrl) return l;
      if (l) l.v.detruire();
      l = { url: vue.imageUrl, toucher: null };
      l.v = root.Vue360.creer({ libelle: 'Photo 360° : ' + vue.title, surToucher: pos => { if (!e.occupe && l.toucher) l.toucher(pos); } });
      if (!l.v) { rondes.set(vue.imageUrl, false); return null; }
      l.v.charger(vue.imageUrl).catch(() => statut('La photo 360° n’a pas pu être chargée : vérifiez votre connexion.', true));
      lecteurs.set(vue.id, l);
      return l;
    }
    // Place un point ou une étiquette sur la photo, à plat ou dans la vue 360°.
    function poser(cadre, noeud, pos) {
      if (!cadre.v360) { placer(noeud, pos); cadre.appendChild(noeud); return; }
      cadre.v360Points.push({ x: pos.x, y: pos.y, noeud });
      cadre.v360.points(cadre.v360Points);
    }

    // Photo de la vue ; toucher(pos) reçoit la position en fraction. Un toucher sur
    // un bouton posé sur la photo (point, étiquette) n'est pas un toucher de photo.
    function photo(p, vue, toucher, aide) {
      verifierRonde(vue.imageUrl);
      const l = estRonde(vue.imageUrl) && root.Vue360 ? lecteur360(vue) : null;
      if (l) {
        const cadre = el('div', 've-photo ve-360');
        l.toucher = toucher;
        cadre.v360 = l.v;
        cadre.v360Points = [];
        l.v.points([]);
        cadre.appendChild(l.v.racine);
        p.appendChild(cadre);
        p.appendChild(el('p', 've-help', aide || 'Photo 360° : glissez pour tourner dans votre boutique, puis touchez un article.'));
        return cadre;
      }
      const cadre = el('div', 've-photo');
      const img = el('img');
      img.src = vue.imageUrl;
      img.alt = 'Photo : ' + vue.title;
      cadre.appendChild(img);
      cadre.onclick = ev => {
        if (e.occupe || (ev.target.closest && ev.target.closest('button'))) return;
        const pos = C.positionDansPhoto(img.getBoundingClientRect(), ev.clientX, ev.clientY);
        if (pos) toucher(pos);
      };
      p.appendChild(cadre);
      return cadre;
    }
    const placer = (noeud, pos) => { noeud.style.left = pos.x * 100 + '%'; noeud.style.top = pos.y * 100 + '%'; };
    const produit = id => e.produits.find(x => x.id === id);

    function enregistrer(vue) {
      return agir(() => enregistrerVue(vue), r => {
        const i = e.vues.findIndex(x => x.id === vue.id);
        if (i !== -1) e.vues[i] = r.data;
        e.choix = null;
        e.mode = null;
      });
    }

    // ── Étape 2 : produits ──
    function etapeProduits(p) {
      p.appendChild(el('h2', null, '2. Placez vos produits'));
      p.appendChild(el('p', 've-help', 'Touchez un article sur la photo, puis choisissez-le dans votre catalogue. Le prix et le stock viennent de la fiche du produit.'));
      selecteurVues(p);
      const vue = e.vues[e.courante];
      if (!vue) { navigation(p, { n: 1, texte: 'Photos' }, null); return; }
      const cadre = photo(p, vue, pos => {
        if (e.mode && e.mode.type === 'deplacer') {
          const pt = vue.hotspots[e.mode.index];
          if (pt) enregistrer(C.remplacerPoint(vue, e.mode.index, { ...pt, ...pos }));
          return;
        }
        e.mode = null;
        e.choix = pos;
        rendre();
      });
      (vue.hotspots || []).forEach((pt, i) => {
        const pr = produit(pt.productId);
        const horsVente = e.catalogueOk && pr && pr.status !== 'ACTIVE';
        const b = bouton('ve-point', String(i + 1), 'Point ' + (i + 1) + ' : ' + (pr ? pr.name + (horsVente ? ' (hors vente)' : '') : 'produit retiré'));
        if (e.catalogueOk && (!pr || pr.status !== 'ACTIVE')) b.classList.add('ve-warn');
        b.onclick = () => { e.choix = null; e.mode = { type: 'point', index: i }; rendre(); };
        poser(cadre, b, pt);
      });
      if (e.choix) {
        const cible = el('span', 've-cible');
        poser(cadre, cible, e.choix);
        p.appendChild(choixProduit(vue));
      }
      if (e.mode && (e.mode.type === 'point' || e.mode.type === 'deplacer')) p.appendChild(actionsPoint(vue, e.mode.index));
      const restants = C.produitsNonPlaces(e.vues, e.produits).length;
      p.appendChild(el('p', 've-help', restants
        ? `${restants} produit${restants > 1 ? 's' : ''} en vente pas encore placé${restants > 1 ? 's' : ''} (facultatif).`
        : 'Tous vos produits en vente sont placés.'));
      const liens = el('div', 've-add');
      const creer = el('a', 've-link', 'Créer un produit ↗');
      creer.href = 'marche-senegal-ajout-produit.html';
      creer.target = '_blank';
      creer.rel = 'noopener';
      const actualiser = bouton('ve-link', 'Actualiser mon catalogue');
      actualiser.onclick = async () => {
        const c = await api.catalogue();
        if (c && c.success) { e.produits = c.data || []; e.catalogueOk = true; statut('Catalogue actualisé'); rendre(); }
        else statut((c && c.message) || 'Catalogue indisponible', true);
      };
      liens.append(creer, actualiser);
      p.appendChild(liens);
      navigation(p, { n: 1, texte: 'Photos' }, { n: 3, texte: 'Mes rayons' });
    }

    function choixProduit(vue) {
      const carte = el('div', 've-card ve-choice');
      carte.appendChild(el('h3', null, 'Quel produit est ici ?'));
      const recherche = el('input', 've-search');
      recherche.type = 'search';
      recherche.placeholder = 'Nom du produit…';
      recherche.setAttribute('aria-label', 'Rechercher un produit');
      const liste = el('div', 've-products');
      const remplir = () => {
        liste.replaceChildren();
        const q = recherche.value.trim().toLocaleLowerCase('fr');
        const trouves = e.produits.filter(x => x.status !== 'DELETED' && (!q || x.name.toLocaleLowerCase('fr').includes(q)));
        if (!trouves.length) liste.appendChild(el('p', 've-help', e.produits.length ? 'Aucun produit ne correspond.' : 'Votre catalogue est vide : créez d’abord un produit.'));
        for (const x of trouves.slice(0, 30)) {
          const b = bouton('ve-product', x.name + (x.status === 'ACTIVE' ? '' : ' (hors vente)'));
          b.onclick = () => {
            const nouvelle = C.ajouterPoint(vue, { productId: x.id, x: e.choix.x, y: e.choix.y });
            if (!nouvelle) { statut(`${C.MAX_POINTS} points au maximum sur une photo.`, true); return; }
            enregistrer(nouvelle);
          };
          liste.appendChild(b);
        }
      };
      recherche.oninput = remplir;
      remplir();
      const annuler = bouton('ve-link', 'Annuler');
      annuler.onclick = () => { e.choix = null; rendre(); };
      carte.append(recherche, liste, annuler);
      return carte;
    }

    function actionsPoint(vue, i) {
      const carte = el('div', 've-card');
      const pt = (vue.hotspots || [])[i];
      if (!pt) return carte;
      const pr = produit(pt.productId);
      carte.appendChild(el('p', null, 'Point ' + (i + 1) + ' : ' + (pr ? pr.name : 'produit retiré de votre catalogue')));
      if (e.catalogueOk && pr && pr.status !== 'ACTIVE') carte.appendChild(el('p', 've-help ve-strong', 'Ce produit n’est plus en vente : retirez ce point ou remettez le produit en vente.'));
      if (e.mode.type === 'deplacer') carte.appendChild(el('p', 've-help ve-strong', 'Touchez la photo à la nouvelle place.'));
      const deplacerB = bouton('ve-btn', 'Déplacer');
      deplacerB.onclick = () => { e.mode = { type: 'deplacer', index: i }; rendre(); };
      const retirer = bouton('ve-btn ve-danger', 'Retirer');
      retirer.onclick = () => enregistrer(C.retirerPoint(vue, i));
      const fermer = bouton('ve-link', 'Fermer');
      fermer.onclick = () => { e.mode = null; rendre(); };
      carte.append(deplacerB, retirer, fermer);
      return carte;
    }
    // ── Étape 3 : rayons ──
    function etapeRayons(p) {
      p.appendChild(el('h2', null, '3. Vos rayons'));
      p.appendChild(el('p', 've-help', 'Choisissez l’ordre des rayons dans votre boutique. Vous pouvez aussi poser leur nom sur une photo : l’acheteur le touche pour voir le rayon.'));
      const rayons = C.rayonsOrdonnes(e.rayons, e.ordre);
      if (!rayons.length) p.appendChild(el('p', 've-help', 'Vos rayons apparaîtront quand vos produits auront une catégorie.'));
      const liste = el('ol', 've-rayons');
      rayons.forEach((r, i) => {
        const li = el('li', 've-rayon');
        li.appendChild(el('span', 've-rname', (r.emoji ? r.emoji + ' ' : '') + r.name));
        const lieu = C.etiquetteDe(e.vues, r.id);
        const vueLieu = lieu && e.vues.find(v => v.id === lieu.sceneId);
        const ordonner = sens => {
          const ids = C.deplacer(rayons, i, sens).map(x => x.id);
          agir(() => api.ordonnerRayons(ids), () => { e.ordre = ids; });
        };
        const haut = bouton('ve-icon', '↑', 'Monter ' + r.name);
        haut.disabled = i === 0 || e.occupe;
        haut.onclick = () => ordonner(-1);
        const bas = bouton('ve-icon', '↓', 'Descendre ' + r.name);
        bas.disabled = i === rayons.length - 1 || e.occupe;
        bas.onclick = () => ordonner(1);
        const poser = bouton('ve-btn', vueLieu ? 'Déplacer l’étiquette' : 'Poser l’étiquette');
        poser.disabled = !e.vues.length || e.occupe;
        poser.setAttribute('aria-pressed', String(!!e.mode && e.mode.categoryId === r.id));
        poser.onclick = () => { e.mode = { type: 'etiquette', categoryId: r.id }; rendre(); };
        li.append(haut, bas, poser);
        if (vueLieu) {
          const retirer = bouton('ve-link', 'Retirer');
          retirer.onclick = () => enregistrerEtiquettes(C.retirerEtiquette(e.vues, r.id));
          li.appendChild(retirer);
        }
        li.appendChild(el('small', null, vueLieu ? 'Étiquette sur « ' + vueLieu.title + ' »' : 'Sans étiquette'));
        liste.appendChild(li);
      });
      // Étiquettes dont le rayon n'a plus de produit : montrées ici pour pouvoir les retirer.
      const connus = new Set(e.rayons.map(r => r.id));
      for (const v of e.vues) {
        for (const l of (v.labels || []).filter(x => !connus.has(x.categoryId))) {
          const li = el('li', 've-rayon');
          li.appendChild(el('span', 've-rname', 'Rayon supprimé'));
          const retirer = bouton('ve-link', 'Retirer');
          retirer.onclick = () => enregistrerEtiquettes(C.retirerEtiquette(e.vues, l.categoryId));
          li.append(retirer, el('small', null, 'Étiquette sur « ' + v.title + ' » : ce rayon n’a plus de produit.'));
          liste.appendChild(li);
        }
      }
      p.appendChild(liste);
      if (e.mode && e.mode.type === 'etiquette') {
        const r = e.rayons.find(x => x.id === e.mode.categoryId);
        p.appendChild(el('p', 've-help ve-strong', 'Choisissez la photo, puis touchez l’endroit où poser « ' + (r ? r.name : 'ce rayon') + ' ».'));
      }
      selecteurVues(p);
      const vue = e.vues[e.courante];
      if (vue) {
        const cadre = photo(p, vue, pos => {
          if (!e.mode || e.mode.type !== 'etiquette') { statut('Choisissez d’abord un rayon, puis « Poser l’étiquette ».'); return; }
          enregistrerEtiquettes(C.poserEtiquette(e.vues, vue.id, e.mode.categoryId, pos));
        });
        for (const l of vue.labels || []) {
          const r = e.rayons.find(x => x.id === l.categoryId);
          const t = el('span', 've-label', (r ? r.name : 'Rayon') + ' · Voir le rayon →');
          poser(cadre, t, l);
        }
      }
      navigation(p, { n: 2, texte: 'Produits' }, { n: 4, texte: 'Vérifier et publier' });
    }

    // Poser une étiquette peut toucher deux photos : celle qui la perd d'abord,
    // puis celle qui la reçoit (jamais deux étiquettes du même rayon).
    async function enregistrerEtiquettes({ vues, modifiees }) {
      for (const id of modifiees) {
        const vue = vues.find(v => v.id === id);
        const r = await agir(() => enregistrerVue(vue), res => {
          const i = e.vues.findIndex(v => v.id === id);
          if (i !== -1) e.vues[i] = res.data;
          // Dernière photo enregistrée (y compris via « Réessayer ») : le déplacement est fini.
          if (id === modifiees[modifiees.length - 1]) e.mode = null;
        });
        if (!r || !r.success) return;
      }
      e.mode = null;
      rendre();
    }
    // ── Étape 4 : vérifier et publier ──
    function etapePublier(p) {
      p.appendChild(el('h2', null, '4. Vérifier et publier'));
      p.appendChild(el('p', 've-help', 'Tant que vous n’avez pas publié, vos clients voient l’ancienne version de votre vitrine.'));
      // Sans catalogue, les contrôles des produits seraient faux : la publication attend.
      const bilan = e.catalogueOk
        ? C.controles({ boutiqueActive: o.boutique && o.boutique.status === 'ACTIVE', vues: e.vues, produits: e.produits })
        : { pret: false, lignes: [{ ok: false, texte: 'Votre catalogue n’a pas pu être chargé : réessayez avant de publier.' }] };
      const liste = el('ul', 've-checks');
      // Chaque problème lié à une photo mène à l'étape où le corriger.
      const ligne = (ok, texte, sceneId, etape) => {
        const li = el('li', ok ? 've-ok' : 've-ko', (ok ? '✓ ' : '✗ ') + texte);
        const i = sceneId ? e.vues.findIndex(v => v.id === sceneId) : -1;
        if (i !== -1) {
          const b = bouton('ve-link', 'Corriger');
          b.onclick = () => { allerA(etape); e.courante = i; rendre(); };
          li.appendChild(b);
        }
        liste.appendChild(li);
      };
      for (const l of bilan.lignes) ligne(l.ok, l.texte, l.sceneId, l.etape || 2);
      for (const pb of e.problemes) ligne(false, pb.message, pb.sceneId, /^rayon/.test(pb.code || '') ? 3 : 2);
      p.appendChild(liste);
      const actions = el('div', 've-add');
      const apercu = el('a', 've-btn', 'Voir l’aperçu comme un client ↗');
      apercu.href = o.lienApercu;
      apercu.target = '_blank';
      apercu.rel = 'noopener';
      const publier = bouton('ve-btn ve-primary', 'Publier ma boutique');
      publier.disabled = !bilan.pret || e.occupe;
      publier.onclick = async () => {
        if (!await confirmer('Publier ? Vos photos, points, étiquettes et l’ordre des rayons remplaceront la version en ligne.')) return;
        e.problemes = [];
        const r = await agir(() => api.publier(), () => {}, { enCours: 'Publication en cours…', fait: 'Publication réussie' });
        if (r && r.success) await charger('Votre vitrine est en ligne. Vous pouvez continuer à la modifier : rien ne change pour vos clients avant la prochaine publication.');
      };
      const abandon = bouton('ve-link ve-danger', 'Abandonner mes changements');
      abandon.disabled = e.occupe;
      abandon.onclick = async () => {
        if (!await confirmer('Abandonner toutes les modifications non publiées ? La version en ligne est conservée.')) return;
        const r = await agir(() => api.abandonner(), () => {});
        if (r && r.success) { e.etape = 1; e.problemes = []; await charger('Modifications abandonnées : vous repartez de la version en ligne.'); }
      };
      actions.append(apercu, publier, abandon);
      p.appendChild(actions);
      navigation(p, { n: 3, texte: 'Rayons' }, null);
    }

    return { charger, etat: e, allerA };
  }

  root.VitrineEditeur = { monter };
})(typeof globalThis !== 'undefined' ? globalThis : this);
