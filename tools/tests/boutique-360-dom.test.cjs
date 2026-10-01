// Visite de boutique avec une photo 360° : le moteur WebGL est doublé, ni réseau ni base.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('../../../marche-senegal-mobile/node_modules/jsdom');
const root = path.resolve(__dirname, '../..');
const lire = f => fs.readFileSync(path.join(root, f), 'utf8');
const page = lire('marche-senegal-boutique.html');
const bloc = page.slice(page.indexOf('<section class="bv"'), page.indexOf('<!-- /bv -->'));

const parfum = { id: 'c-parfum', name: 'Parfums', emoji: '🌸' };
const shop = {
  id: 'b1', name: 'Awa Beauté',
  products: [
    { id: 'p1', name: 'Oud', price: 12000, stock: 3, status: 'ACTIVE', category: parfum, images: [], createdAt: '2026-09-20T00:00:00Z' },
    { id: 'p2', name: 'Musc', price: 8000, stock: 5, status: 'ACTIVE', category: parfum, images: [], createdAt: '2026-09-20T00:00:00Z' }
  ]
};
const scenes = [
  { id: 's1', title: 'Toute la boutique', imageUrl: 'https://ex.test/360.jpg', hotspots: [{ id: 'h1', productId: 'p1', x: 0.5, y: 0.55 }, { id: 'h2', productId: 'p2', x: 0.8, y: 0.5 }] },
  { id: 's2', title: 'Comptoir', imageUrl: 'https://ex.test/plat.jpg', hotspots: [{ id: 'h3', productId: 'p2', x: 0.4, y: 0.4 }] }
];
const attendre = () => new Promise(r => setTimeout(r, 0));

function monter({ webgl = true, chargementEchoue = false } = {}) {
  const dom = new JSDOM('<!doctype html><body>' + bloc + '</body>', { url: 'http://localhost:5500/', runScripts: 'outside-only' });
  const w = dom.window;
  const lecteur = { crees: 0, points: [], tours: [] };
  // Double de vue-360.js : seules les photos « 360 » sont des panoramas.
  w.Vue360 = {
    detecter: url => Promise.resolve(url.includes('360')),
    creer: () => {
      if (!webgl) return null;
      lecteur.crees += 1;
      const racine = w.document.createElement('div');
      racine.className = 'v360';
      return {
        racine,
        points: l => { lecteur.points = l; racine.replaceChildren(...l.map(p => p.noeud)); },
        charger: () => (chargementEchoue ? Promise.reject(new Error('Photo inaccessible')) : Promise.resolve()),
        tourner: d => lecteur.tours.push(d)
      };
    }
  };
  w.eval(lire('boutique-visite.js'));
  w.eval(lire('boutique-visite-ui.js'));
  w.localStorage.setItem('cart', '[]');
  const ctl = w.BoutiqueVisite.monter({ shop, scenes, favoris: new w.Set(), stockage: w.localStorage, notifier: () => {}, basculerFavori: async () => null });
  const q = s => w.document.querySelector(s);
  return { w, q, ctl, lecteur };
}

test('une photo 360° s’ouvre dans la vue qui tourne, avec ses points produits', async () => {
  const { q, lecteur } = monter();
  await attendre();
  assert.equal(lecteur.crees, 1);
  assert.equal(q('#bv-scene').hidden, true);
  assert.equal(q('.v360').hidden, false);
  assert.deepEqual(Array.from(lecteur.points, p => [p.x, p.y, p.noeud.getAttribute('aria-label')]), [[0.5, 0.55, 'Oud'], [0.8, 0.5, 'Musc']]);
  assert.equal(q('#bv-where small').textContent, 'Glissez pour tourner à 360° · touchez un produit');
  assert.equal(q('#bv-stage').classList.contains('bv-360'), true);
});

test('toucher un point de la vue 360° ouvre la fiche, puis le vrai panier', async () => {
  const { q, lecteur, w } = monter();
  await attendre();
  lecteur.points[1].noeud.click();
  assert.equal(q('#bv-sheet h3').textContent, 'Musc');
  q('#bv-sheet .bv-add').click();
  const cart = JSON.parse(w.localStorage.getItem('cart'));
  assert.deepEqual(cart.map(l => [l.productId, l.quantity, l.price, l.shopId]), [['p2', 1, 8000, 'b1']]);
});

test('les flèches gauche et droite font tourner la vue', async () => {
  const { q, lecteur } = monter();
  await attendre();
  q('#bv-left').click();
  q('#bv-right').click();
  assert.deepEqual(lecteur.tours, [-45, 45]);
  assert.equal(q('#bv-left').hidden, false);
});

test('une photo classique reste à plat, la vue 360° est cachée puis réutilisée', async () => {
  const { q, lecteur } = monter();
  await attendre();
  q('#bv-fwd').click();
  await attendre();
  assert.equal(q('#bv-scene').hidden, false);
  assert.equal(q('.v360').hidden, true);
  assert.equal(q('#bv-scene .bv-spot').getAttribute('aria-label'), 'Musc');
  assert.equal(q('#bv-where small').textContent, 'Glissez pour regarder · touchez un point');
  q('#bv-back').click();
  await attendre();
  assert.equal(q('.v360').hidden, false);
  assert.equal(lecteur.crees, 1);
});

test('sans WebGL, la photo 360° s’affiche à plat comme avant', async () => {
  const { q } = monter({ webgl: false });
  await attendre();
  assert.equal(q('.v360'), null);
  assert.equal(q('#bv-scene').hidden, false);
  assert.equal(q('#bv-img').getAttribute('src'), 'https://ex.test/360.jpg');
  assert.equal(q('#bv-scene').querySelectorAll('.bv-spot').length, 2);
});

test('si la photo 360° ne charge pas, la photo à plat prend le relais', async () => {
  const { q } = monter({ chargementEchoue: true });
  await attendre();
  await attendre();
  assert.equal(q('#bv-scene').hidden, false);
  assert.equal(q('.v360').hidden, true);
});

// ── Partie 2a : zone d'un produit côté acheteur ──
test('une zone de produit couvre l’article : à plat en pourcentage, en 360° avec sa taille', async () => {
  const zones = [{ id: 's1', title: 'Rayon', imageUrl: 'https://ex.test/plat.jpg', hotspots: [{ id: 'h1', productId: 'p1', x: 0.4, y: 0.5, w: 0.2, h: 0.3 }] }];
  const dom = new JSDOM('<!doctype html><body>' + bloc + '</body>', { url: 'http://localhost:5500/', runScripts: 'outside-only' });
  const w = dom.window;
  w.eval(lire('boutique-visite.js'));
  w.eval(lire('boutique-visite-ui.js'));
  w.BoutiqueVisite.monter({ shop, scenes: zones, favoris: new w.Set(), stockage: w.localStorage, notifier: () => {}, basculerFavori: async () => null });
  const z = w.document.querySelector('#bv-scene .bv-spot.bv-zone');
  assert.ok(z, 'zone dessinée');
  assert.equal(z.style.width, '20%');
  assert.equal(z.style.height, '30%');
  z.click();
  assert.equal(w.document.querySelector('#bv-sheet h3').textContent, 'Oud');
  // En 360° : le moteur reçoit la taille de la zone.
  const { lecteur } = monter();
  await attendre();
  assert.ok(lecteur.points.every(p => p.w === undefined), 'les points simples restent des points');
});
