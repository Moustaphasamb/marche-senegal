// ════════════════════════════════════════
//   MARCHÉ SÉNÉGAL — Guide d'un marché et « Je cherche… »
// ════════════════════════════════════════
//
// Toute donnée du guide passe par textContent : aujourd'hui elle vient d'un
// fichier relu, demain peut-être d'une saisie, et une présentation ne doit
// jamais devenir du code dans la page d'un visiteur.

(function (racine) {
  function el(doc, tag, classe, texte) {
    const noeud = doc.createElement(tag);
    if (classe) noeud.className = classe;
    if (texte !== undefined) noeud.textContent = texte;
    return noeud;
  }

  function aUnGuide(marche) {
    return Boolean(marche && (marche.description
      || (Array.isArray(marche.categories) && marche.categories.length)));
  }

  function lienCarte(marche) {
    const lat = marche && marche.latitude;
    const lon = marche && marche.longitude;
    if (typeof lat !== 'number' || typeof lon !== 'number') return null;
    return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`;
  }

  function sourcesSures(sources) {
    if (!Array.isArray(sources)) return [];
    return sources.filter(s => s && typeof s.titre === 'string' && s.titre.trim() !== ''
      && typeof s.url === 'string' && s.url.startsWith('https://'));
  }

  function libellesParSlug(categories) {
    const libelles = {};
    (categories || []).forEach(c => { libelles[c.slug] = c.libelle; });
    return libelles;
  }

  function lienExterne(doc, classe, texte, url) {
    const a = el(doc, 'a', classe, texte);
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    return a;
  }

  function construireGuide(doc, marche, libelles) {
    if (!aUnGuide(marche)) return null;

    const bloc = el(doc, 'section', 'guide-marche');
    bloc.setAttribute('aria-labelledby', 'guide-marche-titre');
    const titre = el(doc, 'h2', 'gm-titre', 'Découvrir ce marché');
    titre.id = 'guide-marche-titre';
    bloc.appendChild(titre);

    if (marche.fiabilite === 'A_VERIFIER') {
      bloc.appendChild(el(doc, 'p', 'gm-a-confirmer', 'Informations à confirmer'));
    }
    if (marche.description) bloc.appendChild(el(doc, 'p', 'gm-presentation', marche.description));

    const specialites = marche.specialites || [];
    const etiquettes = (marche.categories || [])
      .map(slug => ({ libelle: (libelles || {})[slug] || slug, specialite: specialites.includes(slug) }))
      .sort((a, b) => Number(b.specialite) - Number(a.specialite));
    if (etiquettes.length) {
      const liste = el(doc, 'ul', 'gm-categories');
      etiquettes.forEach(t => {
        const item = el(doc, 'li', t.specialite ? 'gm-cat gm-specialite' : 'gm-cat', t.libelle);
        if (t.specialite) item.title = 'Spécialité du marché';
        liste.appendChild(item);
      });
      bloc.appendChild(liste);
    }

    [['Artisans et métiers', marche.artisans], ['Bon à savoir', marche.conseils], ['Horaires', marche.horaires]]
      .forEach(([nom, valeur]) => {
        if (!valeur) return;
        const ligne = el(doc, 'p', 'gm-ligne');
        ligne.appendChild(el(doc, 'strong', null, nom + ' : '));
        ligne.appendChild(doc.createTextNode(valeur));
        bloc.appendChild(ligne);
      });

    const carte = lienCarte(marche);
    if (carte) bloc.appendChild(lienExterne(doc, 'gm-carte', 'Voir sur la carte', carte));

    const sources = sourcesSures(marche.sources);
    if (sources.length) {
      const ligne = el(doc, 'p', 'gm-sources', 'Sources : ');
      sources.forEach((s, i) => {
        if (i) ligne.appendChild(doc.createTextNode(', '));
        ligne.appendChild(lienExterne(doc, null, s.titre, s.url));
      });
      bloc.appendChild(ligne);
    }
    return bloc;
  }

  function construireResultats(doc, marches, slug) {
    const liste = el(doc, 'ul', 'jc-resultats');
    if (!marches.length) {
      liste.appendChild(el(doc, 'li', 'jc-vide', "Aucun marché référencé pour ce produit pour l'instant."));
      return liste;
    }
    marches.forEach(m => {
      const item = el(doc, 'li', 'jc-marche');
      const lien = el(doc, 'a', 'jc-lien', m.name);
      lien.href = 'marche-senegal-marche.html?id=' + encodeURIComponent(m.id);
      item.appendChild(lien);
      if ((m.specialites || []).includes(slug)) item.appendChild(el(doc, 'span', 'jc-specialiste', 'Spécialiste'));
      if (m.city) item.appendChild(el(doc, 'span', 'jc-ville', m.city));
      liste.appendChild(item);
    });
    return liste;
  }

  // Le visiteur change d'avis plus vite que le réseau ne répond : une réponse
  // arrivée après un choix plus récent est ignorée.
  function creerChercheur(doc, zone, charger) {
    let dernier = 0;
    return async function chercher(slug) {
      const numero = ++dernier;
      if (!slug) { zone.replaceChildren(); return; }
      const resultat = await charger(slug);
      if (numero !== dernier) return;
      if (!resultat || !resultat.success) {
        zone.replaceChildren(el(doc, 'p', 'jc-erreur', "La recherche n'a pas abouti. Réessayez."));
        return;
      }
      zone.replaceChildren(construireResultats(doc, resultat.data || [], slug));
    };
  }

  const exporte = { aUnGuide, lienCarte, sourcesSures, libellesParSlug, construireGuide, construireResultats, creerChercheur };
  if (typeof module !== 'undefined' && module.exports) module.exports = exporte;
  else Object.assign(racine, exporte);
})(typeof window !== 'undefined' ? window : this);
