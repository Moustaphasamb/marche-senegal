// Page « Services du marché » : paniers recettes et ravitaillement familial.
//
// La première version promettait des choses que la page ne faisait pas (Mafé,
// nombre de personnes, liste gardée, faux total de 42 500 F) et ajoutait
// toujours le produit le moins cher, même quand l'acheteur voulait un autre
// vendeur. Ces tests vérifient le parcours réel : composer, choisir, ajouter
// au panier au format des autres pages, retrouver sa liste.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('../../../marche-senegal-mobile/node_modules/jsdom');

const racine = path.resolve(__dirname, '../..');
const lire = (f) => fs.readFileSync(path.join(racine, f), 'utf8');
const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));
// Les objets venus de la page jsdom n'ont pas le prototype de Node.
const brut = (valeur) => JSON.parse(JSON.stringify(valeur));

const boutique = (id, name) => ({ id, name, marketId: 'm1', marketName: 'Sandaga' });
const CATALOGUE = [
  { slug: 'panier-ceebu-jen', items: [{ key: 'riz', label: 'Riz brisé' }] },
  { slug: 'panier-yassa', items: [] },
  { slug: 'panier-mafe', items: [] },
  { slug: 'ravitaillement-famille', items: [{ key: 'riz', label: 'Riz' }, { key: 'sucre', label: 'Sucre' }, { key: 'huile', label: 'Huile' }] }
];

function disponibilite(url) {
  const params = new URL(url).searchParams;
  if (url.includes('ravitaillement-famille')) {
    const articles = (params.get('articles') || '').split(',').filter(Boolean);
    return {
      items: articles.map((key) => ({ key, label: key, quantityHint: '6 kg', available: false, products: [] })),
      complete: false
    };
  }
  return {
    complete: false,
    items: [
      { key: 'riz', label: 'Riz brisé', quantityHint: '600 g', available: true, products: [
        { id: 'r1', name: 'Riz <b>brisé</b>', price: 700, images: ['https://exemple/riz.jpg'], shop: boutique('s1', 'Chez Awa') },
        { id: 'r2', name: 'Riz parfumé', price: 900, images: [], shop: boutique('s2', 'Chez Modou') }
      ] },
      { key: 'poisson', label: 'Poisson', quantityHint: '2 pièces', available: true, products: [
        { id: 'p1', name: 'Thiof', price: 4500, images: [], shop: boutique('s1', 'Chez Awa') }
      ] },
      { key: 'huile', label: 'Huile', quantityHint: '120 ml', available: false, products: [] }
    ]
  };
}

async function pageServices({ url = 'http://localhost:5500/marche-senegal-services.html', stockage = {}, paniers = {} } = {}) {
  const dom = new JSDOM(lire('marche-senegal-services.html'), { url, runScripts: 'outside-only' });
  const w = dom.window;
  const appels = [];
  for (const [cle, valeur] of Object.entries(stockage)) w.localStorage.setItem(cle, JSON.stringify(valeur));
  w.fetch = async (adresse) => {
    appels.push(String(adresse));
    let corps = { success: false };
    if (String(adresse).endsWith('/api/markets')) corps = { success: true, data: [{ id: 'm1', name: 'Sandaga', city: 'Dakar' }] };
    else if (String(adresse).endsWith('/api/services')) corps = { success: true, data: CATALOGUE };
    else if (String(adresse).includes('/availability')) corps = { success: true, data: disponibilite(String(adresse)) };
    else if (String(adresse).includes('/api/services/packs')) {
      corps = { success: true, data: paniers[new URL(String(adresse)).searchParams.get('service')] || [] };
    }
    return { ok: true, status: 200, json: async () => corps };
  };
  w.eval(lire('api.js'));
  w.eval(lire('services-marche.js'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await tick();
  return { w, doc: w.document, appels, panier: () => JSON.parse(w.localStorage.getItem('cart') || '[]') };
}

test('la page ne promet plus ce qui n’existe pas', () => {
  const html = lire('marche-senegal-services.html');
  assert.doesNotMatch(html, /42 500/);
  assert.doesNotMatch(html, /rappelée au bon moment/);
  assert.match(html, /data-service-slug="panier-mafe"/);
  assert.match(html, /gardée sur cet appareil/);
});

test('compose un panier pour tous les marchés, avec le nombre de personnes', async () => {
  const { doc, appels } = await pageServices();
  const dispo = appels.find((a) => a.includes('/availability'));
  assert.match(dispo, /panier-ceebu-jen\/availability\?personnes=4$/);
  assert.equal(doc.getElementById('service-personnes').options.length, 30);
  assert.equal(doc.querySelectorAll('#service-market option').length, 2);
  assert.match(doc.getElementById('services-live-status').textContent, /partielle/);
  // Le nom du produit est échappé, jamais interprété.
  assert.ok(doc.querySelector('[data-service-choix] option').textContent.includes('<b>'));
  assert.equal(doc.querySelector('[data-service-choix] b'), null);
  assert.match(doc.querySelector('[data-service-total]').textContent.replace(/\s/g, ' '), /5 200 FCFA/);
});

test('ajoute le produit choisi, au format du panier des autres pages', async () => {
  const { w, doc, panier } = await pageServices();
  const select = doc.querySelector('[data-service-choix="0"]');
  select.value = 'r2';
  select.dispatchEvent(new w.Event('change'));
  assert.match(doc.querySelector('[data-service-total]').textContent.replace(/\s/g, ' '), /5 400 FCFA/);
  assert.match(doc.querySelector('[data-service-vendeurs]').textContent, /2 vendeurs/);
  doc.querySelector('[data-service-add-all]').click();
  assert.deepEqual(panier(), [
    { productId: 'r2', name: 'Riz parfumé', price: 900, quantity: 1, shopId: 's2', shopName: 'Chez Modou', marketId: 'm1', marketName: 'Sandaga', image: null },
    { productId: 'p1', name: 'Thiof', price: 4500, quantity: 1, shopId: 's1', shopName: 'Chez Awa', marketId: 'm1', marketName: 'Sandaga', image: null }
  ]);
  assert.match(doc.querySelector('[data-service-add-all]').textContent, /2 articles ajoutés/);
});

test('le lien depuis un marché ouvre le bon service sur ce marché', async () => {
  const { doc, appels } = await pageServices({ url: 'http://localhost:5500/marche-senegal-services.html?service=panier-mafe&marche=m1#composer' });
  assert.equal(doc.getElementById('service-market').value, 'm1');
  assert.ok(doc.querySelector('[data-service-slug="panier-mafe"]').classList.contains('is-active'));
  assert.ok(appels.some((a) => a.includes('panier-mafe/availability?marketId=m1')));
});

test('la liste familiale se compose, se garde et se retrouve', async () => {
  const { w, doc, appels } = await pageServices({
    url: 'http://localhost:5500/marche-senegal-services.html#mon-ravitaillement',
    stockage: { 'ms-ravitaillement': { articles: ['riz', 'sucre'], personnes: 6, frequence: 'mois', marketId: '' } }
  });
  assert.equal(doc.getElementById('service-liste').hidden, false);
  assert.equal(doc.getElementById('service-personnes').value, '6');
  assert.equal(doc.getElementById('service-frequence').value, 'mois');
  assert.ok(appels.some((a) => /ravitaillement-famille\/availability\?personnes=6&frequence=mois&articles=riz%2Csucre$/.test(a)));
  assert.match(doc.querySelector('.services-live-vide').textContent, /Aucun vendeur ne propose encore/);

  const huile = doc.querySelector('#service-liste input[value="huile"]');
  huile.checked = true;
  huile.dispatchEvent(new w.Event('change'));
  await tick();
  assert.deepEqual(JSON.parse(w.localStorage.getItem('ms-ravitaillement')).articles, ['riz', 'sucre', 'huile']);

  for (const caseACocher of doc.querySelectorAll('#service-liste input')) {
    caseACocher.checked = false;
    caseACocher.dispatchEvent(new w.Event('change'));
  }
  await tick();
  assert.match(doc.getElementById('services-live-result').textContent, /Cochez au moins un article/);
});

test('les paniers tout prêts des vendeurs s’affichent et s’ajoutent d’un coup', async () => {
  const panier = {
    id: 'pk1', slug: 'panier-awa', name: 'Ceebu Jën pour 6 <i>', price: 9500, images: [],
    composants: [{ nom: 'Riz brisé', quantite: '2 kg' }, { nom: 'Thiof', quantite: '1 kg' }],
    shop: boutique('s1', 'Chez Awa')
  };
  const { doc, appels, panier: lirePanier } = await pageServices({ paniers: { 'panier-ceebu-jen': [panier] } });
  assert.ok(appels.some((a) => a.includes('/api/services/packs?service=panier-ceebu-jen')));
  assert.ok(appels.some((a) => a.includes('/api/services/packs?service=autre-plat')));
  const zone = doc.getElementById('services-prets');
  assert.equal(zone.hidden, false);
  assert.equal(doc.getElementById('services-autres-plats').hidden, true);
  assert.equal(zone.querySelectorAll('.panier-pret-contenu li').length, 2);
  assert.equal(zone.querySelector('.panier-pret-nom i'), null);
  assert.match(zone.querySelector('.panier-pret-nom a').getAttribute('href'), /id=panier-awa$/);
  zone.querySelector('[data-panier-pret]').click();
  assert.deepEqual(lirePanier(), [
    { productId: 'pk1', name: 'Ceebu Jën pour 6 <i>', price: 9500, quantity: 1, shopId: 's1', shopName: 'Chez Awa', marketId: 'm1', marketName: 'Sandaga', image: null }
  ]);
});

test('le vendeur compose son panier : type, articles proposés, envoi au serveur', async () => {
  const dom = new JSDOM('<body><div id="panier-pret-zone"></div></body>', { url: 'http://localhost:5500/', runScripts: 'outside-only' });
  const w = dom.window;
  w.apiCall = async () => ({ success: true, data: CATALOGUE });
  w.eval(lire('panier-pret-vendeur.js'));
  w.PanierPretVendeur.monter();
  const doc = w.document;
  assert.deepEqual(brut(w.PanierPretVendeur.lire()), { ok: true, champs: {} });

  doc.getElementById('pp-actif').checked = true;
  doc.getElementById('pp-actif').dispatchEvent(new w.Event('change'));
  await tick();
  // Ceebu Jën par défaut : la liste se remplit avec ses ingrédients.
  assert.equal(doc.querySelector('.pp-nom').value, 'Riz brisé');
  doc.querySelector('.pp-quantite').value = '2 kg';
  doc.querySelector('.pp-ajouter').click();
  assert.deepEqual(brut(w.PanierPretVendeur.lire()), { ok: true, champs: {
    packService: 'panier-ceebu-jen', packComposants: [{ nom: 'Riz brisé', quantite: '2 kg' }]
  } });

  doc.querySelectorAll('.pp-retirer').forEach((b) => b.click());
  assert.equal(w.PanierPretVendeur.lire().ok, false);
});

test('modifier un panier reprend son contenu, et le décocher le rend ordinaire', () => {
  const dom = new JSDOM('<body><div id="panier-pret-zone"></div></body>', { url: 'http://localhost:5500/', runScripts: 'outside-only' });
  const w = dom.window;
  w.eval(lire('panier-pret-vendeur.js'));
  w.PanierPretVendeur.monter();
  w.PanierPretVendeur.remplir({ packService: 'panier-mafe', packComposants: [{ nom: 'Pâte <b>d’arachide</b>', quantite: '500 g' }] });
  const doc = w.document;
  assert.equal(doc.getElementById('pp-type').value, 'panier-mafe');
  assert.equal(doc.querySelector('.pp-nom').value, 'Pâte <b>d’arachide</b>');
  assert.equal(doc.querySelector('.pp-liste b'), null);
  doc.getElementById('pp-actif').checked = false;
  assert.deepEqual(brut(w.PanierPretVendeur.lire()), { ok: true, champs: { packService: '' } });
});

test('les formulaires vendeur et la fiche produit montrent les paniers tout prêts', () => {
  for (const page of ['marche-senegal-ajout-produit.html', 'marche-senegal-modifier-produit.html']) {
    const html = lire(page);
    assert.match(html, /id="panier-pret-zone"/, page);
    assert.match(html, /src="panier-pret-vendeur\.js"/, page);
    assert.match(html, /\.\.\.panierPret\.champs/, page);
  }
  assert.match(lire('marche-senegal-produit.html'), /panier-pret-fiche/);
});

test('l’accueil et la page Marché mènent aux services', () => {
  assert.match(lire('marche-senegal-accueil.html'), /href="marche-senegal-services\.html"/);
  const marche = lire('marche-senegal-marche.html');
  assert.match(marche, /data-services-marche="ravitaillement-famille"/);
  assert.match(marche, /'&marche=' \+ encodeURIComponent\(currentMarketId\)/);
});
