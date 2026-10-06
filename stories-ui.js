// Rangée de stories et lecteur plein écran. Règles dans stories.js (StoriesCore).
(function (root) {
  'use strict';
  const C = root.StoriesCore;
  const doc = root.document;

  const el = (balise, classe, texte) => {
    const n = doc.createElement(balise);
    if (classe) n.className = classe;
    if (texte !== undefined) n.textContent = texte;
    return n;
  };
  const logoSur = u => typeof u === 'string' && /^https:\/\//.test(u);

  function pastille(shop) {
    const anneau = el('span', 'st-anneau');
    if (logoSur(shop.avatarUrl)) {
      const img = el('img');
      img.src = shop.avatarUrl; img.alt = ''; img.loading = 'lazy'; img.width = 64; img.height = 64;
      anneau.appendChild(img);
    } else {
      anneau.textContent = C.initiales(shop.name);
    }
    return anneau;
  }

  // Cercle de la rangée : la story qui s'ouvrira, comme sur WhatsApp ou Instagram,
  // avec le logo de la boutique en petit. Sans image, le logo reprend sa place.
  function cercle(groupe, vues) {
    const story = groupe.stories[C.premiereAVoir(groupe, vues)];
    const apercu = C.vignette(story);
    if (!apercu) return pastille(groupe.shop);
    const anneau = el('span', 'st-anneau');
    const img = el('img', 'st-apercu');
    img.src = apercu; img.alt = ''; img.loading = 'lazy'; img.width = 64; img.height = 64;
    anneau.appendChild(img);
    const mini = el('span', 'st-mini');
    if (logoSur(groupe.shop.avatarUrl)) {
      const logo = el('img');
      logo.src = groupe.shop.avatarUrl; logo.alt = ''; logo.loading = 'lazy'; logo.width = 22; logo.height = 22;
      mini.appendChild(logo);
    } else {
      mini.textContent = C.initiales(groupe.shop.name);
    }
    const tout = el('span', 'st-cercle');
    tout.append(anneau, mini);
    return tout;
  }

  // ── Rangée ──
  function monterRangee(section, groupes, options) {
    const liste = section.querySelector('.st-rangee-liste');
    const vues = C.vuesDe(options.stockage);
    const ordre = C.ordonnerRangee(groupes, vues);
    liste.replaceChildren();
    if (!ordre.length) { section.hidden = true; return; }
    ordre.forEach((groupe, i) => {
      const rond = el('button', 'st-rond' + (C.toutVu(groupe, vues) ? ' st-vu' : ''));
      rond.type = 'button';
      rond.setAttribute('aria-label', 'Voir les stories de ' + groupe.shop.name);
      rond.appendChild(cercle(groupe, vues));
      rond.appendChild(el('span', 'st-nom', groupe.shop.name));
      rond.addEventListener('click', () => ouvrir(ordre, i, {
        ...options,
        surFermeture: () => { monterRangee(section, groupes, options); if (options.surFermeture) options.surFermeture(); }
      }));
      liste.appendChild(rond);
    });
    section.hidden = false;
  }

  // ── Lecteur ──
  function ouvrir(groupes, indexGroupe, options) {
    const dureePhoto = options.dureePhoto || C.PHOTO_MS;
    // Délai de secours : une photo qui n'arrive pas (réseau coupé) est passée.
    const attenteMax = options.attenteMax || 10000;
    let enAttente = false;
    const vues = C.vuesDe(options.stockage);
    let pos = { g: indexGroupe, s: C.premiereAVoir(groupes[indexGroupe], vues) };
    let minuterie = null;
    let debutPhoto = 0;
    let restePhoto = 0;
    let enPause = false;
    let ferme = false;
    const retourFocus = doc.activeElement;

    const lecteur = el('div', 'st-lecteur');
    lecteur.setAttribute('role', 'dialog');
    lecteur.setAttribute('aria-modal', 'true');
    const barres = el('div', 'st-barres');
    const tete = el('div', 'st-tete');
    const logo = el('span', 'st-logo-lecteur');
    const nom = el('b', 'st-nom-lecteur');
    const quand = el('span', 'st-quand');
    const fermerBtn = el('button', 'st-fermer', '✕');
    fermerBtn.type = 'button';
    fermerBtn.setAttribute('aria-label', 'Fermer les stories');
    tete.append(logo, nom, quand, fermerBtn);
    const media = el('div', 'st-media');
    const prec = el('button', 'st-zone st-prec');
    prec.type = 'button'; prec.setAttribute('aria-label', 'Story précédente');
    const suiv = el('button', 'st-zone st-suiv');
    suiv.type = 'button'; suiv.setAttribute('aria-label', 'Story suivante');
    const son = el('button', 'st-son', 'Activer le son');
    son.type = 'button'; son.hidden = true;
    const bas = el('div', 'st-bas');
    const legende = el('p', 'st-legende');
    const actions = el('div', 'st-actions');
    const produitBtn = el('button', 'st-produit', 'Voir le produit');
    produitBtn.type = 'button';
    const repondreBtn = el('button', 'st-repondre', 'Répondre');
    repondreBtn.type = 'button';
    actions.append(produitBtn, repondreBtn);
    bas.append(legende, actions);
    lecteur.append(barres, tete, media, prec, suiv, son, bas);

    const courante = () => groupes[pos.g].stories[pos.s];
    const boutique = () => groupes[pos.g].shop;

    function arreterMinuterie() { clearTimeout(minuterie); minuterie = null; }

    function remplirBarres() {
      barres.replaceChildren();
      groupes[pos.g].stories.forEach((s, i) => {
        const barre = el('span', 'st-barre' + (i < pos.s ? ' st-finie' : i === pos.s ? ' st-active' : ''));
        barre.appendChild(el('i'));
        barres.appendChild(barre);
      });
    }

    function lancerPhoto(duree) {
      arreterMinuterie();
      debutPhoto = Date.now();
      restePhoto = duree;
      minuterie = setTimeout(avancer, duree);
    }

    // Le son d'abord ; si le navigateur le refuse, en muet avec un bouton pour l'activer.
    function jouer(video, muet) {
      video.muted = muet;
      let p;
      try { p = video.play(); } catch { p = null; }
      if (p && p.catch) {
        p.catch(() => { if (!muet) { son.hidden = false; jouer(video, true); } });
      }
    }

    function prechargerSuivante() {
      const prochaine = C.suivante(groupes, pos);
      if (!prochaine) return;
      const s = groupes[prochaine.g].stories[prochaine.s];
      if (s.mediaType === 'PHOTO') {
        const adresse = C.adresseMedia(s);
        if (adresse && root.Image) { const img = new root.Image(); img.src = adresse; }
      }
    }

    function afficher() {
      arreterMinuterie();
      enPause = false;
      enAttente = false;
      lecteur.classList.remove('st-pause', 'st-attente');
      const story = courante();
      const shop = boutique();
      lecteur.setAttribute('aria-label', 'Stories de ' + shop.name);
      logo.replaceChildren(pastille(shop));
      nom.textContent = shop.name;
      quand.textContent = C.ilYA(story.createdAt);
      legende.textContent = story.caption || '';
      produitBtn.hidden = !story.product;
      // On ne répond pas à sa propre story : ses clients le font.
      repondreBtn.hidden = !!(options.estMaBoutique && options.estMaBoutique(shop.id));
      son.hidden = true;
      remplirBarres();
      barres.style.setProperty('--duree', dureePhoto + 'ms');
      media.replaceChildren();

      C.noterVue(options.stockage, story.id);
      try {
        const r = options.marquerVue && options.marquerVue(story.id, options.visiteur);
        if (r && r.catch) r.catch(() => {});
      } catch { /* un chiffre perdu, rien de plus */ }

      const adresse = C.adresseMedia(story);
      if (!adresse) { avancer(); return; }
      if (story.mediaType === 'VIDEO') {
        lecteur.classList.add('st-video');
        const video = el('video');
        video.playsInline = true;
        video.setAttribute('playsinline', '');
        video.preload = 'auto';
        const poster = C.affiche(story);
        if (poster) video.poster = poster;
        video.addEventListener('error', () => { if (!ferme) avancer(); });
        video.addEventListener('ended', () => { if (!ferme) avancer(); });
        video.addEventListener('timeupdate', () => {
          const barre = barres.querySelector('.st-active i');
          if (barre && video.duration) barre.style.width = Math.min(100, (video.currentTime / video.duration) * 100) + '%';
        });
        video.src = adresse;
        media.appendChild(video);
        jouer(video, false);
      } else {
        lecteur.classList.remove('st-video');
        const img = el('img');
        img.alt = story.caption || 'Story de ' + shop.name;
        img.addEventListener('error', () => { if (!ferme) avancer(); });
        // En 4G, la photo met plusieurs secondes à arriver : ses 5 s ne comptent
        // qu'une fois affichée, sinon elle passerait sans avoir été vue.
        enAttente = true;
        lecteur.classList.add('st-attente');
        minuterie = setTimeout(avancer, attenteMax);
        img.addEventListener('load', () => {
          if (ferme || courante() !== story) return;
          enAttente = false;
          lecteur.classList.remove('st-attente');
          if (enPause) { arreterMinuterie(); restePhoto = dureePhoto; debutPhoto = Date.now(); }
          else lancerPhoto(dureePhoto);
        });
        img.src = adresse;
        media.appendChild(img);
      }
      prechargerSuivante();
    }

    function avancer() {
      const prochaine = C.suivante(groupes, pos);
      if (!prochaine) { fermer(); return; }
      pos = prochaine;
      afficher();
    }
    function reculer() { pos = C.precedente(groupes, pos); afficher(); }

    function pause(oui) {
      if (oui === enPause) return;
      enPause = oui;
      lecteur.classList.toggle('st-pause', oui);
      const video = media.querySelector('video');
      if (video) { if (oui) video.pause(); else jouer(video, video.muted); return; }
      if (enAttente) {
        arreterMinuterie();
        if (!oui) minuterie = setTimeout(avancer, attenteMax);
        return;
      }
      if (oui) { arreterMinuterie(); restePhoto -= Date.now() - debutPhoto; }
      else lancerPhoto(Math.max(0, restePhoto));
    }

    function fermer() {
      if (ferme) return;
      ferme = true;
      arreterMinuterie();
      const video = media.querySelector('video');
      if (video) video.pause();
      doc.removeEventListener('keydown', clavier);
      lecteur.remove();
      doc.body.classList.remove('st-ouvert');
      if (retourFocus && retourFocus.focus) retourFocus.focus();
      if (options.surFermeture) options.surFermeture();
    }

    function clavier(e) {
      if (e.key === 'ArrowRight') avancer();
      else if (e.key === 'ArrowLeft') reculer();
      else if (e.key === 'Escape') fermer();
    }

    // Toucher bref : avancer ou revenir. Doigt maintenu : pause. Glisser vers le bas : fermer.
    let appui = null;
    function surAppui(e) {
      const etat = { y: e.clientY || 0, maintenu: false, minuterie: null };
      etat.minuterie = setTimeout(() => { etat.maintenu = true; pause(true); }, 300);
      appui = etat;
    }
    function surRelache(e, action) {
      if (!appui) return;
      const etait = appui;
      appui = null;
      clearTimeout(etait.minuterie);
      if ((e.clientY || 0) - etait.y > 80) { fermer(); return; }
      if (etait.maintenu) { pause(false); return; }
      action();
    }
    [[prec, reculer], [suiv, avancer]].forEach(([zone, action]) => {
      zone.addEventListener('pointerdown', surAppui);
      zone.addEventListener('pointerup', e => surRelache(e, action));
      zone.addEventListener('pointercancel', () => {
        if (!appui) return;
        clearTimeout(appui.minuterie);
        if (appui.maintenu) pause(false);
        appui = null;
      });
      // Clavier et lecteurs d'écran déclenchent « click » sans pointer (detail = 0).
      zone.addEventListener('click', e => { if (e.detail === 0) action(); });
    });

    fermerBtn.addEventListener('click', fermer);
    son.addEventListener('click', () => {
      const video = media.querySelector('video');
      if (video) { video.muted = false; son.hidden = true; }
    });
    produitBtn.addEventListener('click', () => {
      const story = courante();
      if (!story.product) return;
      try { const r = options.clicProduit && options.clicProduit(story.id); if (r && r.catch) r.catch(() => {}); } catch { /* chiffre perdu */ }
      options.allerProduit(story.product.id);
    });
    repondreBtn.addEventListener('click', () => options.repondre(courante(), boutique()));

    doc.addEventListener('keydown', clavier);
    doc.body.appendChild(lecteur);
    doc.body.classList.add('st-ouvert');
    afficher();
    if (!ferme) fermerBtn.focus();
    return { fermer };
  }

  // Options réelles du site : mémoire du navigateur, appels d'api.js, pages du site.
  function optionsSite() {
    let stockage = null;
    try { stockage = root.localStorage; stockage.getItem('ms-visiteur'); } catch { stockage = null; }
    if (!stockage) {
      const m = new Map();
      stockage = { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
    }
    const fabriquer = () => (root.crypto && root.crypto.randomUUID)
      ? root.crypto.randomUUID()
      : '00000000-0000-4000-8000-' + String(Date.now()).slice(-12).padStart(12, '0');
    return {
      stockage,
      visiteur: C.identifiantVisiteur(stockage, fabriquer),
      marquerVue: (id, cle) => typeof root.marquerStoryVue === 'function' && root.marquerStoryVue(id, cle),
      clicProduit: id => typeof root.clicProduitStory === 'function' && root.clicProduitStory(id),
      allerProduit: id => { root.location.href = 'marche-senegal-produit.html?id=' + encodeURIComponent(id); },
      estMaBoutique: shopId => {
        let moi = null;
        try { moi = typeof root.getCurrentUser === 'function' ? root.getCurrentUser() : null; } catch { moi = null; }
        return !!(moi && moi.role === 'SELLER' && moi.shop && moi.shop.id === shopId);
      },
      repondre: (story, shop) => {
        const cible = 'marche-senegal-chat.html?shopId=' + encodeURIComponent(shop.id) + '&story=' + encodeURIComponent(story.id);
        const connecte = typeof root.isLoggedIn === 'function' && root.isLoggedIn();
        root.location.href = connecte ? cible : 'marche-senegal-connexion-acheteur.html?next=' + encodeURIComponent(cible);
      }
    };
  }

  root.StoriesUI = { monterRangee, ouvrir, optionsSite };
})(typeof window !== 'undefined' ? window : globalThis);
