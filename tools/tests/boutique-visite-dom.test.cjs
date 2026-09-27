// Affichage de la visite dans une page minimale : ni réseau, ni base.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('../../../marche-senegal-mobile/node_modules/jsdom');
const root = path.resolve(__dirname, '../..');
const core = fs.readFileSync(path.join(root, 'boutique-visite.js'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'boutique-visite-ui.js'), 'utf8');
const page = fs.readFileSync(path.join(root, 'marche-senegal-boutique.html'), 'utf8');
// Après la tâche 4, le bloc est lu dans la vraie page ; avant, dans la fixture.
const bloc = page.includes('<!-- /bv -->')
  ? page.slice(page.indexOf('<section class="bv"'), page.indexOf('<!-- /bv -->'))
  : fs.readFileSync(path.join(__dirname, 'fixtures/bloc-bv.html'), 'utf8');

const visage = { id: 'c-visage', name: 'Soins visage', emoji: '🧴' };
const parfum = { id: 'c-parfum', name: 'Parfums', emoji: '🌸' };
function boutique(extra = {}) {
  return {
    id: 'b1', name: 'Awa Beauté', deliveryEnabled: true, deliveryFee: 1500, deliveryDaysMin: 1, deliveryDaysMax: 2,
    products: [
      { id: 'p1', name: '<img src=x onerror=globalThis.pirate=1>', price: 4500, stock: 2, status: 'ACTIVE', category: visage, images: ['https://ex.test/1.jpg'], createdAt: '2026-09-20T00:00:00Z', totalReviews: 0 },
      { id: 'p2', name: 'Oud vert', price: 12000, originalPrice: 15000, stock: 0, status: 'ACTIVE', category: parfum, images: [], createdAt: '2026-01-01T00:00:00Z', totalReviews: 3, rating: 4.7 }
    ],
    ...extra
  };
}
const deuxScenes = [
  { id: 's1', title: 'Entrée', imageUrl: 'https://ex.test/a.jpg', hotspots: [{ id: 'h1', productId: 'p1', x: .5, y: .4 }] },
  { id: 's2', title: 'Parfums', imageUrl: 'https://ex.test/b.jpg', hotspots: [{ id: 'h2', productId: 'p2', x: .3, y: .3 }] }
];

function monter({ scenes = deuxScenes, shop = boutique(), cart = [], stockage = 'ok', favoriRetour } = {}) {
  const dom = new JSDOM('<!doctype html><body>' + bloc + '</body>', { url: 'http://localhost:5500/', runScripts: 'outside-only' });
  const w = dom.window;
  const notes = [];
  if (stockage === 'ok') w.localStorage.setItem('cart', JSON.stringify(cart));
  w.eval(core);
  w.eval(ui);
  const favoris = new w.Set();
  const ctl = w.BoutiqueVisite.monter({
    shop, scenes, favoris, maintenant: Date.parse('2026-09-26T12:00:00Z'),
    stockage: stockage === 'ok' ? w.localStorage : null,
    notifier: (m, t) => notes.push([m, t]),
    surPanierChange: () => {},
    basculerFavori: async (id, actif) => favoriRetour === undefined ? !actif : favoriRetour
  });
  const q = s => w.document.querySelector(s), qa = s => [...w.document.querySelectorAll(s)];
  const panier = () => JSON.parse(w.localStorage.getItem('cart') || '[]');
  return { w, q, qa, ctl, notes, panier, favoris };
}

test('rayons, points et premiere fiche sont affiches', () => {
  const { q, qa } = monter();
  assert.equal(q('#bv').hidden, false);
  assert.deepEqual(qa('.bv-rayon .bv-rlabel').map(e => e.textContent), ['Toute la boutique', 'Parfums', 'Soins visage']);
  assert.equal(qa('.bv-spot').length, 1);
  assert.equal(q('#bv-sheet').hidden, false);
  assert.equal(q('#bv-where b').textContent, 'Entrée · 1/2');
});

test('un nom contenant du HTML reste du texte', () => {
  const { w, q } = monter();
  assert.equal(q('#bv-sheet h3').textContent, '<img src=x onerror=globalThis.pirate=1>');
  assert.equal(q('#bv-sheet h3 img'), null);
  assert.equal(w.pirate, undefined);
});

test('fleches haut et bas changent de photo, le plan liste les photos', () => {
  const { q, qa } = monter();
  q('#bv-fwd').click();
  assert.equal(q('#bv-where b').textContent, 'Parfums · 2/2');
  q('#bv-back').click();
  assert.equal(q('#bv-where b').textContent, 'Entrée · 1/2');
  q('#bv-plan-btn').click();
  assert.equal(q('#bv-plan').hidden, false);
  qa('.bv-room')[1].click();
  assert.equal(q('#bv-where b').textContent, 'Parfums · 2/2');
});

test('une seule photo cache haut, bas et plan', () => {
  const { q } = monter({ scenes: [deuxScenes[0]] });
  assert.equal(q('#bv-fwd').hidden, true);
  assert.equal(q('#bv-back').hidden, true);
  assert.equal(q('#bv-plan-btn').hidden, true);
  assert.equal(q('#bv-where b').textContent, 'Entrée');
});

test('choisir un rayon filtre la grille et ouvre sa photo', () => {
  const { q, qa } = monter();
  qa('.bv-rayon')[1].click();
  assert.equal(q('#bv-where b').textContent, 'Parfums · 2/2');
  assert.deepEqual(qa('.bv-card .bv-name').map(e => e.textContent), ['Oud vert']);
});

test('ajouter depuis la fiche remplit le panier sans depasser le stock', () => {
  const { q, qa, panier, notes } = monter();
  q('#bv-sheet .bv-add').click();
  q('#bv-sheet .bv-add').click();
  q('#bv-sheet .bv-add').click();
  assert.equal(panier()[0].quantity, 2);
  assert.equal(notes.at(-1)[1], 'error');
  assert.equal(q('#bv-subtotal').textContent, '9 000 FCFA');
  assert.equal(qa('.bv-line').length, 1);
  assert.equal(q('.bv-line .bv-qty button:last-child').disabled, true);
});

test('produit en rupture : bouton desactive dans la fiche et la grille', () => {
  const { q, qa, ctl } = monter();
  ctl.ouvrirProduit('p2', true);
  assert.equal(q('#bv-sheet .bv-add').disabled, true);
  assert.equal(qa('.bv-mini')[1].disabled, true);
});

test('vider ne retire que cette boutique', () => {
  const autre = { productId: 'zz', name: 'Autre', price: 100, quantity: 1, shopId: 'b2', shopName: 'X' };
  const { q, panier } = monter({ cart: [autre, { productId: 'p1', name: 'x', price: 4500, quantity: 1, shopId: 'b1', shopName: 'Awa' }] });
  assert.equal(q('#bv-clear').hidden, false);
  q('#bv-clear').click();
  assert.deepEqual(panier(), [autre]);
  assert.equal(q('.bv-empty').textContent, 'Votre panier est vide.');
});

test('stockage indisponible : message, aucun plantage', () => {
  const { q, notes } = monter({ stockage: 'absent' });
  assert.equal(q('#bv-lines').textContent, 'Panier indisponible sur cet appareil.');
  q('#bv-sheet .bv-add').click();
  assert.equal(notes.at(-1)[0], 'Panier indisponible sur cet appareil');
});

test('boutique sans photo : pas de scene, la grille passe au centre', () => {
  const { q } = monter({ scenes: [] });
  assert.equal(q('#bv-stage').hidden, true);
  assert.equal(q('#bv-grid').classList.contains('bv-noscene'), true);
  assert.equal(q('#bv-products').parentElement.id, 'bv-grid');
});

test('pas d etoiles sans avis, livraison du vendeur affichee', () => {
  const { qa, q } = monter();
  assert.deepEqual(qa('.bv-card .bv-rating').map(e => e.textContent), ['★ 4.7 (3)']);
  assert.equal(q('#bv-terms').textContent, 'Livraison · 1 à 2 jours1 500 FCFA');
});

test('le coeur suit la reponse du serveur', async () => {
  const { q, qa, favoris } = monter();
  qa('.bv-heart')[0].click();
  await new Promise(r => setTimeout(r, 5));
  assert.equal(favoris.has('p1'), true);
  assert.equal(q('#bv-sheet .bv-fav').getAttribute('aria-pressed'), 'true');
  const refus = monter({ favoriRetour: null });
  refus.qa('.bv-heart')[0].click();
  await new Promise(r => setTimeout(r, 5));
  assert.equal(refus.favoris.has('p1'), false);
});

test('photo en echec : message et reessayer', () => {
  const { w, q } = monter();
  q('#bv-img').dispatchEvent(new w.Event('error'));
  assert.equal(q('#bv-fail').hidden, false);
  q('#bv-retry').click();
  assert.equal(q('#bv-fail').hidden, true);
});

test('un article ajoute depuis l accueil (sans shopId) apparait dans le panier et se vide', () => {
  const { q, qa, panier } = monter({ cart: [{ productId: 'p1', name: 'Huile', price: 4500, quantity: 1 }, { productId: 'z', price: 100, quantity: 1, shopId: 'b9' }] });
  assert.equal(qa('#bv-lines .bv-line').length, 1);
  assert.equal(q('#bv-cart-n').textContent, '1 article');
  q('#bv-clear').click();
  assert.deepEqual(panier().map(l => l.productId), ['z']);
});

test('produit a taille : ni la fiche ni la grille n ajoutent sans choix', () => {
  const shop = boutique();
  shop.products[0].sizes = ['38', '39'];
  const { q, qa, panier, notes } = monter({ scenes: [], shop });
  qa('.bv-mini')[0].click();
  assert.deepEqual(panier(), []);
  assert.equal(q('#bv-sheet').hidden, false);
  const choisir = q('#bv-sheet a.bv-add');
  assert.ok(choisir, 'le bouton de la fiche mene au choix');
  assert.match(choisir.textContent, /Choisir/);
  assert.equal(choisir.getAttribute('href'), 'marche-senegal-produit.html?id=p1');
  assert.equal(notes.length, 0);
});

test('toucher un produit de la grille ramene la fiche a l ecran', () => {
  const { w, q, qa } = monter({ scenes: [] });
  const vues = [];
  w.Element.prototype.scrollIntoView = function (opts) { vues.push([this.id || this.className, opts]); };
  qa('.bv-card .bv-img')[1].click();
  assert.equal(q('#bv-sheet h3').textContent, 'Oud vert');
  assert.equal(vues.length, 1);
});

test('fiche deja fixee a l ecran (telephone sans photo) : pas de defilement', () => {
  const { w, q, qa } = monter({ scenes: [] });
  const vues = [];
  w.Element.prototype.scrollIntoView = function () { vues.push(this); };
  q('#bv-sheet').style.position = 'fixed';
  qa('.bv-card .bv-img')[1].click();
  assert.equal(q('#bv-sheet').classList.contains('bv-open'), true);
  assert.equal(vues.length, 0);
});
