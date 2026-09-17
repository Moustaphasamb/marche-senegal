// Ce que le vendeur écrit ne doit jamais devenir du code chez l'acheteur.
//
// L'audit du 2026-09-17 a trouvé que `produit.html` et `boutique.html`
// n'appelaient jamais escapeHtml : la description d'un produit, ses tailles,
// ses couleurs, ses images et le commentaire d'un avis partaient bruts dans
// des innerHTML et dans des attributs onclick. Un vendeur pouvait y placer un
// script et lire le jeton de session de chaque acheteur qui ouvrait sa fiche.
//
// Ces tests rejouent le vrai chemin — chargement par l'API bouchonnée, rendu
// par les fonctions de la page — et vérifient qu'il ne reste rien d'exécutable
// dans le document. Aucun navigateur, aucun service externe : JSDOM vient des
// dépendances du dépôt mobile voisin, comme les autres tests DOM d'ici.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('../../../marche-senegal-mobile/node_modules/jsdom');

const racine = path.resolve(__dirname, '../..');
const lire = (f) => fs.readFileSync(path.join(racine, f), 'utf8');

// La charge est volontairement banale : c'est celle qu'un attaquant écrirait.
const CHARGE = '<img src=x onerror="window.__execute = true">';

function scriptsInternes(html) {
  const morceaux = [];
  const motif = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let trouve;
  while ((trouve = motif.exec(html)) !== null) morceaux.push(trouve[1]);
  return morceaux.join('\n');
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 15));

async function pageChargee(fichier, bouchons = {}) {
  const html = lire(fichier);
  const dom = new JSDOM(html, {
    url: 'http://localhost:5500/' + fichier,
    runScripts: 'outside-only'
  });
  const w = dom.window;

  w.__execute = false;
  w.scrollTo = () => {};
  // Les pages chargent aussi des avis, des produits similaires, des boutiques.
  // Rien ne doit partir sur le réseau : tout répond « pas de données ».
  w.fetch = async () => ({ status: 200, json: async () => ({ success: false, data: [] }) });
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

  // api.js fournit escapeHtml et urlImageSure : sans lui, on testerait une
  // page qui n'existe pas.
  w.eval(lire('api.js'));

  w.showToast = () => {};
  w.toast = () => {};
  w.isLoggedIn = () => false;
  w.getCurrentUser = () => null;
  Object.assign(w, bouchons);

  w.eval(scriptsInternes(html));
  await tick();
  return { dom, w, doc: w.document };
}

// Rien de ce qui suit ne doit exister dans le document : ni gestionnaire
// d'événement inline posé par la charge, ni balise qu'elle aurait créée.
function aucunCodeInjecte(doc, w, zone) {
  assert.equal(w.__execute, false, 'la charge s est exécutée');
  assert.equal(zone.querySelector('[onerror]'), null, 'un attribut onerror a été créé');
  assert.equal(zone.querySelector('[onload]'), null, 'un attribut onload a été créé');
  assert.equal(zone.querySelector('script'), null, 'une balise script a été créée');
  assert.equal(zone.querySelector('img[src="x"]'), null, 'la balise img de la charge a été créée');
}

function produit(champs = {}) {
  return {
    id: 'p1',
    name: 'Boubou brodé',
    description: 'Tissu bazin.',
    price: 25000,
    stock: 8,
    images: [],
    sizes: [],
    colors: [],
    rating: 0,
    totalReviews: 0,
    shop: { id: 's1', name: 'Boutique de test', rating: 0, market: { id: 'm1', name: 'Sandaga' } },
    ...champs
  };
}

test('la description du vendeur s affiche comme du texte, pas comme du HTML', async () => {
  const { dom, w, doc } = await pageChargee('marche-senegal-produit.html', {
    getProduct: async () => ({ success: true, data: produit({ description: CHARGE }) })
  });

  await w.loadProduct('p1');
  await tick();

  const desc = doc.getElementById('tab-desc');
  aucunCodeInjecte(doc, w, desc);
  // Elle reste lisible : le vendeur doit voir ce qu'il a écrit.
  assert.match(desc.textContent, /<img src=x/);
  dom.window.close();
});

test('tailles et couleurs ne sortent pas de leur attribut', async () => {
  const charge = "'); window.__execute = true; ('";
  const { dom, w, doc } = await pageChargee('marche-senegal-produit.html', {
    getProduct: async () => ({
      success: true,
      data: produit({ sizes: [charge], colors: [charge] })
    })
  });

  await w.loadProduct('p1');
  await tick();

  assert.equal(w.__execute, false, 'la charge est sortie de l attribut');
  // Le clic est le moment où l'ancien code exécutait la chaîne du vendeur.
  const taille = doc.querySelector('.opt-btn[data-size]');
  assert.notEqual(taille, null, 'la taille venue de l API n a pas été rendue');
  taille.click();
  await tick();
  assert.equal(w.__execute, false, 'la charge s est exécutée au clic');
  dom.window.close();
});

test('une URL d image qui n en est pas une est refusée', async () => {
  const { dom, w, doc } = await pageChargee('marche-senegal-produit.html', {
    getProduct: async () => ({
      success: true,
      data: produit({ images: ['javascript:window.__execute=true', 'https://example.test/a.jpg'] })
    })
  });

  await w.loadProduct('p1');
  await tick();

  const miniatures = [...doc.querySelectorAll('.thumb[data-img]')];
  assert.equal(miniatures.length, 1, 'l URL javascript: aurait dû disparaître');
  assert.equal(miniatures[0].dataset.img, 'https://example.test/a.jpg');

  miniatures[0].click();
  await tick();
  assert.equal(w.__execute, false);
  dom.window.close();
});

test('le commentaire d un avis s affiche comme du texte', async () => {
  const { dom, w, doc } = await pageChargee('marche-senegal-boutique.html');

  w.loadShopReviews({
    reviews: [{
      id: 'r1',
      rating: 5,
      comment: CHARGE,
      createdAt: '2026-01-15T10:00:00.000Z',
      user: { firstName: 'Awa' }
    }]
  });
  await tick();

  const liste = doc.querySelector('.review-list');
  aucunCodeInjecte(doc, w, liste);
  assert.match(liste.textContent, /<img src=x/);
  assert.match(liste.textContent, /Awa/);
  dom.window.close();
});

// Garde-fou statique : si quelqu'un réintroduit une donnée libre dans un
// attribut de gestionnaire d'événement, ce test le dit avant la production.
test('aucune page ne remet de donnee libre dans un onclick', () => {
  const pages = [
    'marche-senegal-produit.html',
    'marche-senegal-boutique.html',
    'marche-senegal-marche.html',
    'marche-senegal-recherche.html'
  ];
  // Les identifiants (cuid produits par Prisma) et les nombres restent tolérés :
  // ils ne peuvent pas porter de guillemet. Le reste, non.
  const tolere = /^\$\{[A-Za-z_$][\w.?]*\.(id|price|rating)\}$|^\$\{(currentPage|i)[^}]*\}$/;

  for (const page of pages) {
    const source = lire(page);
    const motif = /onclick="[^"]*(\$\{[^}]*\})[^"]*"/g;
    let trouve;
    while ((trouve = motif.exec(source)) !== null) {
      assert.match(trouve[1], tolere,
        page + ' interpole ' + trouve[1] + ' dans un onclick');
    }
  }
});
