// Affichage de la visite de boutique. Aucune donnée serveur ne passe par innerHTML.
(function (root) {
  'use strict';
  const SVG = 'http://www.w3.org/2000/svg';
  const ICONES = {
    panier: ['M2 3h3l2.6 12h11L21 7H6.2', 'M9 20h.01', 'M18 20h.01'],
    coeur: ['M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z'],
    corbeille: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13'],
    fermer: ['M6 6l12 12', 'M18 6 6 18']
  };

  function monter(o) {
    const C = root.BoutiqueVisiteCore;
    const doc = root.document;
    const $ = id => doc.getElementById(id);
    const el = (tag, cls, texte) => {
      const e = doc.createElement(tag);
      if (cls) e.className = cls;
      if (texte != null) e.textContent = texte;
      return e;
    };
    const bouton = (cls, label, texte) => {
      const b = el('button', cls, texte);
      b.type = 'button';
      if (label) b.setAttribute('aria-label', label);
      return b;
    };
    const icone = nom => {
      const s = doc.createElementNS(SVG, 'svg');
      for (const [k, v] of [['viewBox', '0 0 24 24'], ['fill', 'none'], ['stroke', 'currentColor'], ['stroke-width', '2'], ['aria-hidden', 'true']]) s.setAttribute(k, v);
      for (const d of ICONES[nom]) { const p = doc.createElementNS(SVG, 'path'); p.setAttribute('d', d); s.appendChild(p); }
      return s;
    };
    const imageDe = p => (p && Array.isArray(p.images) ? p.images : []).find(C.urlImageSure);
    const vignette = (cls, p) => {
      const box = el('div', cls);
      const src = imageDe(p);
      if (src) { const i = el('img'); i.src = src; i.alt = ''; i.loading = 'lazy'; box.appendChild(i); }
      return box;
    };
    const notifier = (m, t) => { if (typeof o.notifier === 'function') o.notifier(m, t); };

    const shop = o.shop;
    const maintenant = o.maintenant || Date.now();
    const produits = (shop.products || []).filter(p => p.status === 'ACTIVE');
    const scenes = (o.scenes || []).filter(s => s && C.urlImageSure(s.imageUrl));
    const index = C.indexProduits(produits, scenes);
    const idsBoutique = new Set(index.keys());
    const rayons = C.construireRayons(produits, shop.rayonOrder);
    const favoris = o.favoris || new Set();
    const etat = { scene: 0, rayon: 'all', onglet: 'tous', courant: null, pan: 0 };

    $('bv').hidden = false;
    const grille = $('bv-grid');
    if (!scenes.length) {
      grille.classList.add('bv-noscene');
      $('bv-stage').hidden = true;
      grille.insertBefore($('bv-products'), grille.querySelector('.bv-side'));
    }

    // ── Panier ──
    function lireCart() {
      try { const c = JSON.parse(o.stockage.getItem('cart') || '[]'); return Array.isArray(c) ? c : []; } catch { return null; }
    }
    function ecrireCart(c) {
      try { o.stockage.setItem('cart', JSON.stringify(c)); return true; } catch { return false; }
    }
    function maj(c) {
      if (!ecrireCart(c)) notifier('Panier indisponible sur cet appareil', 'error');
      dessinerPanier();
    }
    function ajouter(id) {
      const p = index.get(id), c = lireCart();
      if (p && C.aDesVariantes(p)) { ouvrirProduit(id, true); montrerFiche(); return; }
      if (!p || c === null) { notifier('Panier indisponible sur cet appareil', 'error'); return; }
      const r = C.ajouterAuPanier(c, p, shop);
      if (!r.ajoute) { notifier('Stock atteint pour ' + p.name, 'error'); return; }
      if (!ecrireCart(r.cart)) { notifier('Panier indisponible sur cet appareil', 'error'); return; }
      notifier('✓ ' + p.name + ' ajouté au panier');
      dessinerPanier();
    }
    function dessinerPanier() {
      const lignes = $('bv-lines');
      lignes.replaceChildren();
      const c = lireCart();
      if (c === null) {
        lignes.appendChild(el('p', 'bv-empty', 'Panier indisponible sur cet appareil.'));
        $('bv-clear').hidden = true; $('bv-cartbar').hidden = true; $('bv-subtotal').textContent = '—';
        return;
      }
      const pb = C.panierBoutique(c, shop.id, idsBoutique);
      if (!pb.lignes.length) lignes.appendChild(el('p', 'bv-empty', 'Votre panier est vide.'));
      for (const l of pb.lignes) {
        const p = index.get(l.productId);
        // La ligne est visée par sa position ; si le panier a changé entre-temps
        // (autre onglet), on redessine au lieu de modifier une autre ligne.
        const pos = c.indexOf(l);
        const agir = f => {
          const cur = lireCart() || [];
          if (!cur[pos] || cur[pos].productId !== l.productId) { dessinerPanier(); return; }
          maj(f(cur));
        };
        const max = p ? (Number(p.stock) || 0) : Infinity;
        const row = el('div', 'bv-line');
        const choix = [l.size, l.color].filter(Boolean).join(' · ');
        const t = el('div', 'bv-t', choix ? l.name + ' (' + choix + ')' : l.name);
        t.appendChild(el('small', null, C.fcfa(l.price)));
        const del = bouton('bv-del', 'Retirer ' + l.name + ' du panier');
        del.appendChild(icone('corbeille'));
        del.onclick = () => agir(cur => C.retirer(cur, pos));
        const q = el('div', 'bv-qty');
        const moins = bouton(null, 'Retirer un', '−'), plus = bouton(null, 'Ajouter un', '+');
        moins.onclick = () => agir(cur => C.changerQuantite(cur, pos, -1, max));
        plus.onclick = () => agir(cur => C.changerQuantite(cur, pos, 1, max));
        plus.disabled = l.quantity >= max;
        q.append(moins, el('span', null, String(l.quantity)), plus);
        row.append(vignette('bv-thumb', p), t, del, q);
        lignes.appendChild(row);
      }
      const n = `${pb.articles} article${pb.articles > 1 ? 's' : ''}`;
      $('bv-cart-n').textContent = pb.articles ? n : '';
      $('bv-subtotal').textContent = C.fcfa(pb.total);
      $('bv-clear').hidden = !pb.lignes.length;
      $('bv-cb-n').textContent = n + ' · ' + shop.name;
      $('bv-cb-t').textContent = C.fcfa(pb.total);
      $('bv-cartbar').hidden = !pb.articles;
      if (typeof o.surPanierChange === 'function') o.surPanierChange();
    }
    $('bv-clear').onclick = () => maj(C.viderBoutique(lireCart() || [], shop.id, idsBoutique));
    const terms = $('bv-terms');
    terms.replaceChildren();
    for (const t of C.lignesConditions(shop)) { const li = el('li'); li.append(el('span', null, t.label), el('b', null, t.valeur)); terms.appendChild(li); }

    // ── Favoris ──
    async function basculerFavori(id) {
      const nouvel = await o.basculerFavori(id, favoris.has(id));
      if (nouvel !== true && nouvel !== false) return;
      if (nouvel) favoris.add(id); else favoris.delete(id);
      doc.querySelectorAll('[data-fav]').forEach(b => { if (b.dataset.fav === id) b.setAttribute('aria-pressed', String(nouvel)); });
    }

    // ── Rayons ──
    function dessinerRayons() {
      const liste = $('bv-rayons-list');
      liste.replaceChildren();
      for (const r of rayons) {
        const b = bouton('bv-rayon');
        b.setAttribute('aria-current', String(r.id === etat.rayon));
        b.append(el('span', 'bv-ico', r.emoji || (r.id === 'all' ? '🏬' : '•')), el('span', 'bv-rlabel', r.label), el('span', 'bv-n', String(r.count)));
        b.onclick = () => choisirRayon(r.id);
        liste.appendChild(b);
      }
    }
    function choisirRayon(id) {
      etat.rayon = id;
      dessinerRayons();
      dessinerProduits();
      if (scenes.length) {
        const i = C.sceneDuRayon(scenes, id, index, etat.scene);
        if (i !== etat.scene) allerScene(i);
      }
    }

    // ── Scène ──
    const maxPan = () => Math.max(0, $('bv-scene').offsetWidth - $('bv-stage').offsetWidth);
    function appliquer() {
      etat.pan = Math.min(0, Math.max(-maxPan(), etat.pan));
      $('bv-scene').style.transform = `translateX(${etat.pan}px)`;
      $('bv-left').hidden = $('bv-right').hidden = !en360 && maxPan() === 0;
    }
    function centrer() { etat.pan = -maxPan() / 2; appliquer(); }
    function regarder(dx) {
      const sc = $('bv-scene');
      sc.style.transition = 'transform .35s ease';
      etat.pan += dx;
      appliquer();
      setTimeout(() => { sc.style.transition = ''; }, 360);
    }
    function bulle(cible, p) {
      const b = $('bv-bubble'), r = cible.getBoundingClientRect(), s = $('bv-stage').getBoundingClientRect();
      b.querySelector('b').textContent = p.name;
      b.querySelector('span').textContent = (Number(p.stock) || 0) > 0 ? C.fcfa(p.price) : 'Bientôt de retour';
      b.style.left = (r.left - s.left + r.width / 2) + 'px';
      b.style.top = (r.top - s.top + r.height / 2) + 'px';
      b.classList.add('bv-show');
    }
    const cacherBulle = () => $('bv-bubble').classList.remove('bv-show');
    function dessinerPlan() {
      const box = $('bv-plan-rooms');
      box.replaceChildren();
      scenes.forEach((s, i) => {
        const b = bouton('bv-room', null, s.title || 'Vue ' + (i + 1));
        b.setAttribute('aria-current', String(i === etat.scene));
        b.onclick = () => allerScene(i);
        box.appendChild(b);
      });
    }
    // Points produits et étiquettes de rayon d'une photo, positions en fraction (0-1).
    function pointsDeLaScene(s) {
      const liste = [];
      for (const h of C.pointsVisibles(s, index)) {
        const p = index.get(h.productId);
        const b = bouton('bv-spot', p.name);
        b.dataset.p = p.id;
        b.setAttribute('aria-pressed', String(p.id === etat.courant));
        b.onmouseenter = b.onfocus = () => bulle(b, p);
        b.onmouseleave = b.onblur = cacherBulle;
        b.onclick = e => { e.stopPropagation(); ouvrirProduit(p.id, true); };
        liste.push({ x: h.x, y: h.y, noeud: b });
      }
      // Étiquettes de rayon posées par le vendeur : les toucher filtre ce rayon.
      const dansLaPhoto = v => typeof v === 'number' && v >= 0 && v <= 1;
      for (const l of s.labels || []) {
        const r = rayons.find(x => x.id === l.categoryId);
        if (!r || !dansLaPhoto(l.x) || !dansLaPhoto(l.y)) continue;
        const b = bouton('bv-label', 'Voir le rayon ' + r.label, (r.emoji ? r.emoji + ' ' : '') + r.label + ' · Voir le rayon →');
        b.onclick = ev => { ev.stopPropagation(); choisirRayon(r.id); };
        liste.push({ x: l.x, y: l.y, noeud: b });
      }
      return liste;
    }

    // Photo 360° (deux fois plus large que haute) : la boutique tourne sous le doigt.
    // Sans WebGL ou si elle ne charge pas, la photo s'affiche à plat comme les autres.
    let v360 = null, en360 = false;
    const AIDE = { plat: 'Glissez pour regarder · touchez un point', rond: 'Glissez pour tourner à 360° · touchez un produit' };
    function modeScene(rond) {
      en360 = rond;
      $('bv-scene').hidden = rond;
      if (v360) v360.racine.hidden = !rond;
      $('bv-stage').classList.toggle('bv-360', rond);
      const aide = $('bv-where').querySelector('small');
      if (aide) aide.textContent = rond ? AIDE.rond : AIDE.plat;
    }
    function afficherPlat(s) {
      modeScene(false);
      if (v360) v360.points([]);
      const sc = $('bv-scene'), img = $('bv-img');
      img.hidden = false;
      img.alt = s.title ? 'Photo de la boutique : ' + s.title : 'Photo de la boutique';
      img.src = s.imageUrl;
      sc.querySelectorAll('.bv-spot,.bv-label').forEach(e => e.remove());
      for (const pt of pointsDeLaScene(s)) {
        pt.noeud.style.left = pt.x * 100 + '%';
        pt.noeud.style.top = pt.y * 100 + '%';
        sc.appendChild(pt.noeud);
      }
      centrer();
    }
    function afficher360(s, n) {
      if (!v360) {
        v360 = root.Vue360.creer({ libelle: 'Vue 360° de ' + (s.title || shop.name), auto: true });
        if (!v360) return false;
        $('bv-stage').insertBefore(v360.racine, $('bv-scene').nextSibling);
      }
      $('bv-scene').querySelectorAll('.bv-spot,.bv-label').forEach(e => e.remove());
      modeScene(true);
      v360.points(pointsDeLaScene(s));
      v360.charger(s.imageUrl).catch(() => { if (etat.scene === n) afficherPlat(s); });
      return true;
    }

    function allerScene(i) {
      if (!scenes.length) return;
      etat.scene = (i + scenes.length) % scenes.length;
      const n = etat.scene, s = scenes[n];
      $('bv-fail').hidden = true;
      const titre = s.title || 'Vue ' + (n + 1);
      $('bv-where').querySelector('b').textContent = scenes.length > 1 ? `${titre} · ${n + 1}/${scenes.length}` : titre;
      $('bv-fwd').hidden = $('bv-back').hidden = $('bv-plan-btn').hidden = scenes.length < 2;
      if (scenes.length < 2) $('bv-plan').hidden = true;
      dessinerPlan();
      cacherBulle();
      // La vignette dit si la photo est une 360° avant de télécharger la photo entière.
      if (!root.Vue360) { afficherPlat(s); return; }
      root.Vue360.detecter(s.imageUrl).then(rond => {
        if (etat.scene !== n) return;
        if (!(rond && afficher360(s, n))) afficherPlat(s);
      });
    }
    $('bv-img').onerror = () => { $('bv-img').hidden = true; $('bv-fail').hidden = false; };
    $('bv-img').onload = centrer;
    $('bv-retry').onclick = () => allerScene(etat.scene);
    $('bv-fwd').onclick = () => allerScene(etat.scene + 1);
    $('bv-back').onclick = () => allerScene(etat.scene - 1);
    $('bv-left').onclick = () => (en360 ? v360.tourner(-45) : regarder(260));
    $('bv-right').onclick = () => (en360 ? v360.tourner(45) : regarder(-260));
    $('bv-plan-btn').onclick = () => {
      const p = $('bv-plan');
      p.hidden = !p.hidden;
      $('bv-plan-btn').setAttribute('aria-expanded', String(!p.hidden));
    };
    (function glisser() {
      const st = $('bv-stage');
      let x0 = null, p0 = 0;
      st.addEventListener('pointerdown', e => {
        if (e.target.closest('button,.bv-plan')) return;
        if (en360) { cacherBulle(); return; }
        x0 = e.clientX; p0 = etat.pan;
        if (st.setPointerCapture) st.setPointerCapture(e.pointerId);
        st.classList.add('bv-dragging');
        cacherBulle();
      });
      st.addEventListener('pointermove', e => { if (x0 === null) return; etat.pan = p0 + (e.clientX - x0); appliquer(); });
      const fin = () => { x0 = null; st.classList.remove('bv-dragging'); };
      st.addEventListener('pointerup', fin);
      st.addEventListener('pointercancel', fin);
    })();
    root.addEventListener('resize', appliquer);

    // ── Fiche produit ──
    function ouvrirProduit(id, parUtilisateur) {
      const p = index.get(id);
      if (!p) return;
      etat.courant = id;
      doc.querySelectorAll('.bv-spot').forEach(s => s.setAttribute('aria-pressed', String(s.dataset.p === id)));
      const sh = $('bv-sheet');
      sh.replaceChildren();
      const fermer = bouton('bv-close', 'Fermer la fiche');
      fermer.appendChild(icone('fermer'));
      fermer.onclick = () => { sh.classList.remove('bv-open'); sh.hidden = true; };
      const fav = bouton('bv-fav', 'Ajouter aux favoris');
      fav.dataset.fav = id;
      fav.setAttribute('aria-pressed', String(favoris.has(id)));
      fav.appendChild(icone('coeur'));
      fav.onclick = () => basculerFavori(id);
      const corps = el('div', 'bv-body');
      const rayon = p.category ? rayons.find(r => r.id === p.category.id) : null;
      if (rayon) corps.appendChild(el('span', 'bv-rtag', rayon.label));
      corps.appendChild(el('h3', null, p.name));
      if (p.description) corps.appendChild(el('p', 'bv-desc', p.description));
      const prix = el('div', 'bv-price', C.fcfa(p.price));
      if (C.enPromo(p)) prix.appendChild(el('s', null, C.fcfa(p.originalPrice)));
      corps.appendChild(prix);
      // Le panier de la visite ne retient pas de variante : le choix se fait sur la fiche complète.
      for (const [nom, valeurs] of [['Tailles', p.sizes], ['Couleurs', p.colors]]) {
        if (Array.isArray(valeurs) && valeurs.length) corps.appendChild(el('p', 'bv-variants', nom + ' : ' + valeurs.join(', ')));
      }
      const st = C.etatStock(p.stock);
      corps.appendChild(el('span', 'bv-stock bv-' + st.code, st.texte));
      const lien = el('a', 'bv-more', 'Voir la fiche complète →');
      lien.href = 'marche-senegal-produit.html?id=' + encodeURIComponent(id);
      corps.appendChild(lien);
      let add;
      if (C.aDesVariantes(p) && st.code !== 'out') {
        add = el('a', 'bv-btn bv-primary bv-add', 'Choisir ' + (Array.isArray(p.sizes) && p.sizes.length ? 'la taille' : 'la couleur') + ' →');
        add.href = lien.getAttribute('href');
      } else {
        add = bouton('bv-btn bv-primary bv-add');
        add.appendChild(icone('panier'));
        add.append(st.code === 'out' ? 'Indisponible' : 'Ajouter au panier');
        add.disabled = st.code === 'out';
        add.onclick = () => { ajouter(id); sh.classList.remove('bv-open'); };
      }
      sh.append(fermer, fav, vignette('bv-pic', p), corps, add);
      sh.hidden = false;
      if (parUtilisateur) sh.classList.add('bv-open');
    }

    // La fiche est en haut de la visite : un produit touché en bas de la grille l'ouvrirait hors de l'écran.
    function montrerFiche() {
      const sh = $('bv-sheet');
      if (root.getComputedStyle && root.getComputedStyle(sh).position === 'fixed') return;
      const cible = sh.closest('.bv-side') || sh;
      if (typeof cible.scrollIntoView === 'function') cible.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }

    // ── Grille ──
    function dessinerProduits() {
      const box = $('bv-products-grid');
      box.replaceChildren();
      const liste = C.filtrerProduits(produits, { rayon: etat.rayon, onglet: etat.onglet, maintenant });
      if (!liste.length) box.appendChild(el('p', 'bv-empty', produits.length ? 'Aucun produit ici pour le moment.' : 'Cette boutique n\'a pas encore de produit en ligne.'));
      for (const p of liste) {
        const card = el('article', 'bv-card');
        const img = vignette('bv-img', p);
        img.tabIndex = 0;
        img.setAttribute('role', 'button');
        img.setAttribute('aria-label', 'Voir ' + p.name);
        const voir = () => { ouvrirProduit(p.id, true); montrerFiche(); };
        img.onclick = voir;
        img.onkeydown = e => { if (e.key === 'Enter') voir(); };
        const bd = C.badge(p, maintenant);
        if (bd) img.appendChild(el('span', 'bv-flag bv-flag-' + bd.code, bd.texte));
        const coeur = bouton('bv-heart', 'Ajouter ' + p.name + ' aux favoris');
        coeur.dataset.fav = p.id;
        coeur.setAttribute('aria-pressed', String(favoris.has(p.id)));
        coeur.appendChild(icone('coeur'));
        coeur.onclick = e => { e.stopPropagation(); basculerFavori(p.id); };
        img.appendChild(coeur);
        const info = el('div', 'bv-info');
        info.appendChild(el('span', 'bv-name', p.name));
        if ((Number(p.totalReviews) || 0) > 0) info.appendChild(el('span', 'bv-rating', '★ ' + Number(p.rating).toFixed(1) + ' (' + p.totalReviews + ')'));
        const row = el('div', 'bv-row');
        const prix = el('span', 'bv-price', C.fcfa(p.price));
        if (C.enPromo(p)) prix.appendChild(el('s', null, C.fcfa(p.originalPrice)));
        const mini = bouton('bv-mini', 'Ajouter ' + p.name + ' au panier');
        mini.appendChild(icone('panier'));
        mini.disabled = (Number(p.stock) || 0) <= 0;
        mini.onclick = () => ajouter(p.id);
        row.append(prix, mini);
        info.appendChild(row);
        card.append(img, info);
        box.appendChild(card);
      }
    }
    $('bv-tabs').querySelectorAll('button').forEach(b => {
      b.onclick = () => {
        etat.onglet = b.dataset.t;
        $('bv-tabs').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
        dessinerProduits();
      };
    });

    dessinerRayons();
    dessinerProduits();
    dessinerPanier();
    if (scenes.length) {
      allerScene(0);
      const premier = C.pointsVisibles(scenes[0], index)[0];
      if (premier) ouvrirProduit(premier.productId, false);
    }
    return { allerScene, ouvrirProduit, choisirRayon, etat };
  }

  root.BoutiqueVisite = { monter };
})(typeof globalThis !== 'undefined' ? globalThis : this);
