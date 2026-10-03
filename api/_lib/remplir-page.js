// Remplit une page publique (marché, boutique, produit) avant son envoi, pour
// que les moteurs et les robots IA, qui n'exécutent pas le JavaScript, lisent
// autre chose qu'une coquille. Module pur : aucune entrée-sortie, testé seul
// (tools/tests/remplir-page.test.cjs).
'use strict';

const { questionsMarche } = require('../../faq-marche.js');

const SITE = 'https://marchesenegal.sn';
const MARQUE = 'Marché Sénégal';

function echapper(texte) {
  if (texte === null || texte === undefined) return '';
  return String(texte).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// 4500 → « 4 500 FCFA », avec une espace insécable comme sur le reste du site.
const fcfa = prix => `${Math.round(Number(prix) || 0).toLocaleString('fr-FR').replace(/\s/g, ' ')} FCFA`;
const absolue = url => (!url ? null : /^https?:\/\//.test(url) ? url : `${SITE}/${String(url).replace(/^\/+/, '')}`);
const arrondi = n => (typeof n === 'number' ? Math.round(n * 1000) / 1000 : null);
const joindre = (morceaux, sep = ', ') => morceaux.filter(Boolean).join(sep);

function resume(texte, max = 155) {
  const t = String(texte || '').replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

function urlPropre(type, d) {
  if (type === 'marche') return d.slug ? `${SITE}/marches/${d.slug}` : null;
  if (type === 'boutique') return `${SITE}/boutiques/${d.id}`;
  if (type === 'produit') return `${SITE}/produits/${d.id}`;
  return null;
}

// Une boutique « Autre lieu » (CUSTOM) est rattachée au pseudo-marché du même nom : son vrai lieu est son quartier.
const dansUnMarche = b => Boolean(b.market) && b.locationType !== 'CUSTOM';

function lieuBoutique(b) {
  return dansUnMarche(b) ? joindre([b.market.name, b.market.city]) : joindre([b.locationName, b.locationCity]);
}

function decrireMarche(d, extras = {}) {
  const faq = questionsMarche(d, extras.libelles || {});
  const geo = arrondi(d.latitude) !== null && arrondi(d.longitude) !== null
    ? { '@type': 'GeoCoordinates', latitude: arrondi(d.latitude), longitude: arrondi(d.longitude) } : undefined;
  return {
    titre: `${joindre([d.name, d.city])} — ${MARQUE}`,
    description: resume(d.description) || `Boutiques et produits du ${d.name} à ${d.city}, sur ${MARQUE}.`,
    image: absolue(d.imageUrl),
    // Sans slug (ex. « Autre lieu » ouvert par son identifiant), pas d'adresse propre à proposer aux moteurs.
    noindex: !d.slug,
    ld: [{
      '@context': 'https://schema.org', '@type': 'Place', name: d.name, description: d.description || undefined,
      address: { '@type': 'PostalAddress', streetAddress: d.address || undefined, addressLocality: d.city || undefined,
        addressRegion: d.region || undefined, addressCountry: 'SN' },
      geo, url: urlPropre('marche', d) || undefined
    }, {
      '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: faq.map(q => ({ '@type': 'Question', name: q.question,
        acceptedAnswer: { '@type': 'Answer', text: q.reponse } }))
    }],
    corps: [
      `<h1>${echapper(d.name)}</h1>`,
      `<p>${echapper(joindre([d.city, d.region]))}</p>`,
      d.address ? `<p>Adresse : ${echapper(d.address)}</p>` : '',
      d.description ? `<p>${echapper(d.description)}</p>` : '',
      d.horaires ? `<p>Horaires : ${echapper(d.horaires)}</p>` : '',
      d.conseils ? `<p>Conseils : ${echapper(d.conseils)}</p>` : '',
      (d.shops || []).length ? `<h2>Boutiques</h2><ul>${d.shops.map(s =>
        `<li><a href="/boutiques/${echapper(s.id)}">${echapper(s.name)}</a></li>`).join('')}</ul>` : '',
      faq.length ? `<h2>Questions fréquentes</h2>${faq.map(q =>
        `<h3>${echapper(q.question)}</h3><p>${echapper(q.reponse)}</p>`).join('')}` : ''
    ]
  };
}

function decrireBoutique(d) {
  const lieu = lieuBoutique(d);
  const image = absolue(d.bannerUrl || d.avatarUrl);
  const ville = dansUnMarche(d) ? d.market.city : d.locationCity;
  return {
    titre: joindre([d.name, lieu, MARQUE], ' — '),
    description: resume(d.description) || `${joindre([d.name, lieu])} : produits et contact du vendeur sur ${MARQUE}.`,
    image,
    ld: {
      '@context': 'https://schema.org', '@type': 'Store', name: d.name, description: d.description || undefined,
      image: image || undefined, url: urlPropre('boutique', d),
      address: ville ? { '@type': 'PostalAddress', addressLocality: ville, addressCountry: 'SN' } : undefined
    },
    corps: [
      `<h1>${echapper(d.name)}</h1>`,
      lieu ? `<p>${dansUnMarche(d) && d.market.slug
        ? `<a href="/marches/${echapper(d.market.slug)}">${echapper(lieu)}</a>` : echapper(lieu)}</p>` : '',
      d.description ? `<p>${echapper(d.description)}</p>` : '',
      (d.products || []).length ? `<h2>Produits</h2><ul>${d.products.map(p =>
        `<li><a href="/produits/${echapper(p.id)}">${echapper(p.name)} — ${fcfa(p.price)}</a></li>`).join('')}</ul>` : ''
    ]
  };
}

function decrireProduit(d) {
  const boutique = d.shop || {};
  const marche = lieuBoutique(boutique);
  const image = absolue((d.images || [])[0]);
  return {
    titre: `${d.name} — ${fcfa(d.price)} — ${MARQUE}`,
    description: resume(d.description)
      || `${d.name}, ${fcfa(d.price)}${boutique.name ? `, chez ${boutique.name}` : ''} sur ${MARQUE}.`,
    image,
    ld: {
      '@context': 'https://schema.org', '@type': 'Product', name: d.name, description: d.description || undefined,
      image: image || undefined, url: urlPropre('produit', d),
      offers: {
        '@type': 'Offer', price: Math.round(Number(d.price) || 0), priceCurrency: 'XOF',
        availability: d.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        seller: boutique.name ? { '@type': 'Organization', name: boutique.name } : undefined
      }
    },
    corps: [
      `<h1>${echapper(d.name)}</h1>`,
      `<p>Prix : ${fcfa(d.price)}</p>`,
      d.description ? `<p>${echapper(d.description)}</p>` : '',
      boutique.id ? `<p>Vendu par <a href="/boutiques/${echapper(boutique.id)}">${echapper(boutique.name)}</a>${
        marche ? `, ${echapper(marche)}` : ''}</p>` : ''
    ]
  };
}

const DESCRIPTEURS = { marche: decrireMarche, boutique: decrireBoutique, produit: decrireProduit };

// Du JSON placé dans <script> : un « < » encodé empêche un texte vendeur de refermer la balise.
const jsonDansScript = valeur => JSON.stringify(valeur).replace(/</g, '\\u003c');

// Servie sous /marches/… ou /boutiques/…, la page doit charger ses styles et
// scripts depuis la racine et connaître son identifiant, même sans données.
function preparerModele(modele, page) {
  return modele
    .replace(/<head>/i, () => '<head><base href="/">')
    .replace(/<\/head>/i, () => (page ? `<script>window.__MS_PAGE__=${jsonDansScript(page)}</script></head>` : '</head>'));
}

function remplirPage(modele, type, donnees, extras = {}) {
  const info = DESCRIPTEURS[type](donnees, extras);
  const canonique = urlPropre(type, donnees);
  const entete = [
    canonique ? `<link rel="canonical" href="${echapper(canonique)}">` : '',
    `<meta property="og:type" content="${type === 'produit' ? 'product' : 'website'}">`,
    `<meta property="og:site_name" content="${MARQUE}">`,
    `<meta property="og:title" content="${echapper(info.titre)}">`,
    `<meta property="og:description" content="${echapper(info.description)}">`,
    canonique ? `<meta property="og:url" content="${echapper(canonique)}">` : '',
    info.image ? `<meta property="og:image" content="${echapper(info.image)}">` : '',
    ...[].concat(info.ld).map(ld => `<script type="application/ld+json">${jsonDansScript(ld)}</script>`),
    info.noindex ? '<meta name="robots" content="noindex">' : ''
  ].join('');
  // Le visiteur voit le rendu habituel de la page : ce bloc ne sert qu'aux lecteurs sans JavaScript.
  const bloc = `<section data-ssr>${info.corps.join('')}</section>` +
    '<script>document.querySelector("[data-ssr]").remove()</script>';

  // Fonctions de remplacement : un « $ » dans un texte vendeur ne doit pas être lu comme motif.
  return preparerModele(modele, { type, id: donnees.id })
    .replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${echapper(info.titre)}</title>`)
    .replace(/<meta name="description"[^>]*>/i, () => `<meta name="description" content="${echapper(info.description)}"/>`)
    .replace(/<\/head>/i, () => `${entete}</head>`)
    .replace(/<\/body>/i, () => `${bloc}</body>`);
}

function marquerIntrouvable(modele, page = null) {
  return preparerModele(modele, page).replace(/<\/head>/i, () => '<meta name="robots" content="noindex"></head>');
}

module.exports = { SITE, echapper, urlPropre, preparerModele, remplirPage, marquerIntrouvable };
