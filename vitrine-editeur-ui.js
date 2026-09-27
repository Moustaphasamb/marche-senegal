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
    const e = { etape: 1, vues: [], rayons: [], ordre: [], vitrine: false, produits: [], courante: 0, choix: null, mode: null, occupe: false, problemes: [] };

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
      if (c && c.success) e.produits = c.data || [];
      e.courante = Math.min(e.courante, Math.max(0, e.vues.length - 1));
      if (!e.vues.length) e.etape = 1;
      statut(message || 'Brouillon enregistré sur le serveur · pas encore publié');
      rendre();
      return true;
    }

    // Une action : appel au serveur, puis mise à jour de l'écran. Sans réseau, on garde
    // l'écran et on propose de réessayer ; en cas de refus, le serveur fait foi et on
    // recharge le brouillon.
    async function agir(appel, succes) {
      if (e.occupe) return null;
      e.occupe = true;
      statut('Enregistrement…');
      rendre();
      let r;
      try { r = await appel(); } catch { r = { success: false, message: 'Erreur de connexion au serveur' }; }
      e.occupe = false;
      if (r && r.success) {
        succes(r);
        statut('Enregistré · pas encore publié');
        rendre();
        return r;
      }
      const message = (r && r.message) || 'Non enregistré';
      if (/connexion/i.test(message)) {
        statut('Non enregistré · ' + message, true, () => agir(appel, succes));
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
      panneau.replaceChildren();
      panneau.setAttribute('aria-busy', String(e.occupe));
      ({ 1: etapePhotos, 2: etapeProduits, 3: etapeRayons, 4: etapePublier })[e.etape](panneau);
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
      p.appendChild(el('p', 've-help', `Commencez par une vue d’ensemble, puis un rayon ou un mur. Téléphone stable, bonne lumière, sans client reconnaissable ni document privé. Jusqu’à ${C.MAX_VUES} photos.`));
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
        titre.setAttribute('aria-label', 'Nom de la photo ' + (i + 1));
        titre.onchange = () => {
          const t = titre.value.trim();
          if (!t) { titre.value = v.title; statut('Donnez un nom à cette photo.', true); return; }
          agir(() => api.enregistrerVue({ ...v, title: t }), r => { e.vues[i] = r.data; });
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
        li.append(img, titre, haut, bas, suppr);
        liste.appendChild(li);
      });
      p.appendChild(liste);
      const plein = e.vues.length >= C.MAX_VUES;
      const ajout = el('div', 've-add');
      const galerie = bouton('ve-btn', 'Ajouter une photo');
      galerie.disabled = plein || e.occupe;
      galerie.onclick = () => $('ve-file').click();
      const camera = bouton('ve-btn', 'Prendre une photo');
      camera.disabled = plein || e.occupe;
      camera.onclick = () => $('ve-camera').click();
      ajout.append(galerie, camera);
      if (plein) ajout.appendChild(el('p', 've-help', `${C.MAX_VUES} photos au maximum.`));
      p.appendChild(ajout);
      navigation(p, null, { n: 2, texte: 'Placer mes produits' }, e.vues.length > 0);
    }

    async function ajouterPhoto(fichier) {
      const refus = C.verifierFichier(fichier);
      if (refus) { statut(refus, true); return; }
      await agir(async () => {
        const envoi = await api.envoyerPhoto(fichier);
        if (!envoi || !envoi.success) return envoi;
        return api.creerVue({ title: 'Photo ' + (e.vues.length + 1), imageUrl: envoi.url });
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
    function etapeProduits(p) { p.appendChild(el('h2', null, '2. Placez vos produits')); navigation(p, { n: 1, texte: 'Photos' }, { n: 3, texte: 'Mes rayons' }); }
    function etapeRayons(p) { p.appendChild(el('h2', null, '3. Vos rayons')); navigation(p, { n: 2, texte: 'Produits' }, { n: 4, texte: 'Vérifier et publier' }); }
    function etapePublier(p) { p.appendChild(el('h2', null, '4. Vérifier et publier')); navigation(p, { n: 3, texte: 'Rayons' }, null); }

    return { charger, etat: e, allerA };
  }

  root.VitrineEditeur = { monter };
})(typeof globalThis !== 'undefined' ? globalThis : this);
