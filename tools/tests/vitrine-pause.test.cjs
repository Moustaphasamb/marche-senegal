// « Ma vitrine » en pause : cachée aux vendeurs et aux acheteurs, rien n'est supprimé.
// ?atelier=1 la rallume pour continuer à la travailler.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('../../../marche-senegal-mobile/node_modules/jsdom');
const root = path.resolve(__dirname, '../..');
const lire = f => fs.readFileSync(path.join(root, f), 'utf8');
const tick = () => new Promise(r => setTimeout(r, 30));

const shop = {
  id: 'b1', name: 'Awa Beauté', status: 'ACTIVE', market: { name: 'Sandaga' }, reviews: [], _count: { products: 1, reviews: 0 },
  videoUrl: 'https://res.cloudinary.com/x/video/upload/v1/marche-senegal/videos/b1/tour.mov',
  products: [{ id: 'p1', name: 'Huile de baobab', price: 4500, stock: 5, status: 'ACTIVE', images: [], category: { id: 'c1', name: 'Soins visage', emoji: '🧴' }, createdAt: '2026-09-20T00:00:00Z', totalReviews: 0 }]
};
const scenes = [{ id: 's1', title: 'Entrée', imageUrl: 'https://ex.test/a.jpg', hotspots: [{ id: 'h1', productId: 'p1', x: .5, y: .5 }] }];

async function boutique(adresse) {
  const dom = new JSDOM(lire('marche-senegal-boutique.html'), { url: 'http://localhost:5500/marche-senegal-boutique.html' + adresse, runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.eval(lire('api.js'));
  w.fetch = async () => { throw new Error('réseau interdit dans ce test'); };
  w.getShop = async () => ({ success: true, data: structuredClone(shop) });
  w.getShopPromotions = async () => ({ success: true, data: [] });
  w.getShopReviews = async () => ({ success: true, data: [] });
  w.isLoggedIn = () => false;
  w.getCurrentUser = () => null;
  const demandes = [];
  w.apiCall = async url => { demandes.push(url); return url.endsWith('/shopvision/scenes') ? { success: true, data: scenes } : { success: true, data: [] }; };
  w.applyBanner = () => {};
  w.eval(lire('boutique-visite.js'));
  w.eval(lire('boutique-visite-ui.js'));
  for (const s of w.document.querySelectorAll('script:not([src])')) w.eval(s.textContent);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await tick();
  return { w, demandes, q: s => w.document.querySelector(s), qa: s => [...w.document.querySelectorAll(s)] };
}

function menu(adresse) {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost:5500/marche-senegal-dashboard.html' + adresse, runScripts: 'outside-only' });
  const w = dom.window;
  w.eval(lire('api.js'));
  w.getCurrentUser = () => null;
  w.eval(lire('marche-senegal-menu-vendeur.js'));
  return [...w.document.querySelectorAll('#sb-nav .sb-item')].map(e => e.dataset.cle);
}

test('acheteur : sans vitrine, ni photos, ni vidéo, mais les produits restent', async () => {
  const { q, qa, demandes } = await boutique('?id=b1');
  assert.equal(demandes.some(u => u.includes('shopvision')), false);
  assert.equal(q('#video-boutique').hidden, true);
  assert.equal(q('#bv-stage').hidden, true);
  assert.equal(qa('.bv-spot').length, 0);
  assert.equal(q('#bv').hidden, false);
  assert.deepEqual(qa('.bv-card .bv-name').map(e => e.textContent), ['Huile de baobab']);
});

test('acheteur : ?atelier=1 rallume la vitrine et la vidéo', async () => {
  const { q, qa } = await boutique('?id=b1&atelier=1');
  assert.equal(q('#video-boutique').hidden, false);
  assert.equal(q('#bv-stage').hidden, false);
  assert.equal(qa('.bv-spot').length, 1);
});

test('vendeur : « Ma vitrine » quitte le menu, et revient en atelier', () => {
  assert.equal(menu('').includes('shopvision'), false);
  assert.equal(menu('').includes('boutique'), true);
  assert.equal(menu('?atelier=1').includes('shopvision'), true);
});

test('vendeur : la carte « Ma vitrine » de Ma boutique est cachée par l interrupteur', () => {
  const page = lire('marche-senegal-ma-boutique.html');
  assert.match(page, /id="carteVitrine"/);
  assert.match(page, /if \(!vitrineVisible\(\)\) \{[^}]*carteVitrine/);
});

test('vendeur : l éditeur renvoie vers Ma boutique hors atelier', () => {
  const page = lire('marche-senegal-shopvision.html');
  assert.match(page, /if \(!vitrineVisible\(\)\) \{ location\.replace\('marche-senegal-ma-boutique\.html'\)/);
});
