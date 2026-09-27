// Logique de la visite de boutique, sans navigateur ni réseau.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../boutique-visite');

const JOUR = 86400000;
const MAINTENANT = Date.parse('2026-09-26T12:00:00Z');
const visage = { id: 'c-visage', name: 'Soins visage', emoji: '🧴' };
const parfum = { id: 'c-parfum', name: 'Parfums', emoji: '🌸' };
const produits = [
  { id: 'p1', name: 'Huile', price: 4500, stock: 6, status: 'ACTIVE', category: visage, images: ['https://ex.test/1.jpg'], createdAt: new Date(MAINTENANT - 3 * JOUR).toISOString() },
  { id: 'p2', name: 'Oud', price: 12000, originalPrice: 15000, stock: 2, status: 'ACTIVE', category: parfum, images: [], createdAt: new Date(MAINTENANT - 90 * JOUR).toISOString() },
  { id: 'p3', name: 'Crème', price: 6000, stock: 0, status: 'ACTIVE', category: visage, images: [], createdAt: new Date(MAINTENANT - 60 * JOUR).toISOString() }
];
const scenes = [
  { id: 's1', title: 'Entrée', imageUrl: 'https://ex.test/a.jpg', hotspots: [{ id: 'h1', productId: 'p1', x: .5, y: .4 }] },
  { id: 's2', title: 'Mur des parfums', imageUrl: 'https://ex.test/b.jpg', hotspots: [
    { id: 'h2', productId: 'p2', x: .3, y: .3 },
    { id: 'h3', productId: 'p-hors-liste', x: .6, y: .6, product: { id: 'p-hors-liste', name: 'Savon', price: 1500, stock: 9, status: 'ACTIVE', images: [] } },
    { id: 'h4', productId: 'p-pause', x: .7, y: .7, product: { id: 'p-pause', name: 'Pause', price: 1, stock: 1, status: 'PAUSED', images: [] } },
    { id: 'h5', productId: 'p1', x: 1.4, y: .2 }
  ] }
];

test('fcfa formate avec espaces et entier', () => {
  assert.equal(C.fcfa(12000), '12 000 FCFA');
  assert.equal(C.fcfa(1500000), '1 500 000 FCFA');
  assert.equal(C.fcfa(0), '0 FCFA');
});

test('urlImageSure n accepte que https', () => {
  assert.equal(C.urlImageSure('https://res.cloudinary.com/x.jpg'), true);
  assert.equal(C.urlImageSure('http://ex.test/x.jpg'), false);
  assert.equal(C.urlImageSure('javascript:alert(1)'), false);
  assert.equal(C.urlImageSure(null), false);
});

test('les rayons sont les categories, precedees de Toute la boutique', () => {
  assert.deepEqual(C.construireRayons(produits), [
    { id: 'all', label: 'Toute la boutique', emoji: '', count: 3 },
    { id: 'c-parfum', label: 'Parfums', emoji: '🌸', count: 1 },
    { id: 'c-visage', label: 'Soins visage', emoji: '🧴', count: 2 }
  ]);
});

test('un produit sans categorie ne cree pas de rayon', () => {
  assert.equal(C.construireRayons([{ id: 'x', category: null }]).length, 1);
});

test('les points ignorent produits inactifs et coordonnees hors photo, gardent les produits hors liste', () => {
  const index = C.indexProduits(produits, scenes);
  assert.deepEqual(C.pointsVisibles(scenes[1], index).map(h => h.id), ['h2', 'h3']);
  assert.equal(index.get('p-hors-liste').category, null);
});

test('un point vers un produit inconnu sans fiche jointe est ignore', () => {
  const index = C.indexProduits(produits, []);
  assert.deepEqual(C.pointsVisibles({ hotspots: [{ id: 'z', productId: 'inconnu', x: .1, y: .1 }] }, index), []);
});

test('le rayon ouvre la premiere photo qui contient un de ses produits', () => {
  const index = C.indexProduits(produits, scenes);
  assert.equal(C.sceneDuRayon(scenes, 'c-parfum', index, 0), 1);
  assert.equal(C.sceneDuRayon(scenes, 'c-visage', index, 1), 0);
  assert.equal(C.sceneDuRayon(scenes, 'all', index, 1), 1);
  assert.equal(C.sceneDuRayon(scenes, 'rayon-sans-photo', index, 1), 1);
});

test('etat du stock', () => {
  assert.equal(C.etatStock(0).code, 'out');
  assert.equal(C.etatStock(3).texte, 'Plus que 3 en stock');
  assert.equal(C.etatStock(4).code, 'ok');
  assert.equal(C.etatStock(undefined).code, 'out');
});

test('onglets et rayon filtrent la grille', () => {
  const ids = o => C.filtrerProduits(produits, { maintenant: MAINTENANT, ...o }).map(p => p.id);
  assert.deepEqual(ids({}), ['p1', 'p2', 'p3']);
  assert.deepEqual(ids({ onglet: 'promos' }), ['p2']);
  assert.deepEqual(ids({ onglet: 'nouveautes' }), ['p1']);
  assert.deepEqual(ids({ rayon: 'c-visage' }), ['p1', 'p3']);
});

test('badge : rupture puis promo puis nouveau', () => {
  assert.deepEqual(C.badge(produits[2], MAINTENANT), { code: 'out', texte: 'Rupture' });
  assert.deepEqual(C.badge(produits[1], MAINTENANT), { code: 'promo', texte: '−20 %' });
  assert.deepEqual(C.badge(produits[0], MAINTENANT), { code: 'new', texte: 'Nouveau' });
});

test('le panier de la boutique ignore les autres boutiques', () => {
  const cart = [{ productId: 'p1', price: 4500, quantity: 2, shopId: 'b1' }, { productId: 'z', price: 100, quantity: 1, shopId: 'autre' }];
  assert.deepEqual(C.panierBoutique(cart, 'b1'), { lignes: [cart[0]], articles: 2, total: 9000 });
  assert.deepEqual(C.panierBoutique(null, 'b1'), { lignes: [], articles: 0, total: 0 });
});

test('ajouter ne depasse jamais le stock et ne modifie pas le tableau recu', () => {
  const shop = { id: 'b1', name: 'Awa' };
  const r1 = C.ajouterAuPanier([], produits[1], shop);
  assert.equal(r1.ajoute, true);
  assert.deepEqual(r1.cart, [{ productId: 'p2', name: 'Oud', price: 12000, quantity: 1, shopId: 'b1', shopName: 'Awa' }]);
  const r2 = C.ajouterAuPanier(r1.cart, produits[1], shop);
  const r3 = C.ajouterAuPanier(r2.cart, produits[1], shop);
  assert.equal(r2.cart[0].quantity, 2);
  assert.equal(r3.ajoute, false);
  assert.equal(r3.cart[0].quantity, 2);
  assert.equal(r1.cart[0].quantity, 1);
  assert.equal(C.ajouterAuPanier([], produits[2], shop).ajoute, false);
});

test('changer la quantite respecte le stock et retire la ligne a zero', () => {
  const cart = [{ productId: 'p2', quantity: 2, shopId: 'b1' }];
  assert.equal(C.changerQuantite(cart, 'p2', 1, 2)[0].quantity, 2);
  assert.deepEqual(C.changerQuantite(cart, 'p2', -2, 2), []);
  assert.equal(C.changerQuantite(cart, 'p2', 1, Infinity)[0].quantity, 3);
});

test('vider ne retire que la boutique courante', () => {
  const cart = [{ productId: 'a', shopId: 'b1' }, { productId: 'b', shopId: 'b2' }];
  assert.deepEqual(C.viderBoutique(cart, 'b1'), [{ productId: 'b', shopId: 'b2' }]);
  assert.deepEqual(C.retirer(cart, 'b'), [{ productId: 'a', shopId: 'b1' }]);
});

test('conditions : livraison seulement si le vendeur l a fixee', () => {
  assert.deepEqual(C.lignesConditions({}), []);
  assert.deepEqual(C.lignesConditions({ deliveryEnabled: true, deliveryFee: null }), []);
  assert.deepEqual(C.lignesConditions({ deliveryEnabled: true, deliveryFee: 1500, deliveryDaysMin: 1, deliveryDaysMax: 2 }), [{ label: 'Livraison · 1 à 2 jours', valeur: '1 500 FCFA' }]);
  assert.deepEqual(C.lignesConditions({ deliveryEnabled: true, deliveryFee: 0, deliveryDaysMin: 1, deliveryDaysMax: 1 }), [{ label: 'Livraison · 1 jour', valeur: 'Gratuite' }]);
});

test('une ligne sans shopId (ajoutee depuis l accueil) compte pour sa boutique et se vide avec elle', () => {
  const ids = new Set(['p1']);
  const cart = [{ productId: 'p1', price: 4500, quantity: 1, shopId: null }, { productId: 'z', price: 100, quantity: 1 }];
  assert.deepEqual(C.panierBoutique(cart, 'b1', ids).articles, 1);
  assert.deepEqual(C.viderBoutique(cart, 'b1', ids), [{ productId: 'z', price: 100, quantity: 1 }]);
  const r = C.ajouterAuPanier(cart, produits[0], { id: 'b1', name: 'Awa' });
  assert.equal(r.cart[0].quantity, 2);
  assert.equal(r.cart[0].shopId, 'b1');
  assert.equal(r.cart[0].shopName, 'Awa');
});

test('un produit a tailles ou couleurs demande un choix', () => {
  assert.equal(C.aDesVariantes({ sizes: ['38'] }), true);
  assert.equal(C.aDesVariantes({ colors: ['Rouge'] }), true);
  assert.equal(C.aDesVariantes({ sizes: [], colors: [] }), false);
  assert.equal(C.aDesVariantes({}), false);
});
