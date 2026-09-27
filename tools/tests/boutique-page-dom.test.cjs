// La vraie page boutique avec une API doublée : aucun appel réseau, aucune base.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('../../../marche-senegal-mobile/node_modules/jsdom');
const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'marche-senegal-boutique.html'), 'utf8');
const lire = f => fs.readFileSync(path.join(root, f), 'utf8');
// Les commentaires du code racontent l'historique : seul le contenu réel compte.
const sansCommentaires = html.replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');
const tick = () => new Promise(r => setTimeout(r, 30));

const shop = {
  id: 'b1', name: 'Awa Beauté', status: 'ACTIVE', market: { name: 'Sandaga' }, reviews: [], _count: { products: 1, reviews: 0 },
  products: [{ id: 'p1', name: 'Huile de baobab', price: 4500, stock: 5, status: 'ACTIVE', images: [], category: { id: 'c1', name: 'Soins visage', emoji: '🧴' }, createdAt: '2026-09-20T00:00:00Z', totalReviews: 0 }]
};

async function charger({ scenes = [], extra = {}, brouillon = null, adresse = '?id=b1', vendeur = false } = {}) {
  const dom = new JSDOM(html, { url: 'http://localhost:5500/marche-senegal-boutique.html' + adresse, runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.eval(lire('api.js'));
  w.fetch = async () => { throw new Error('réseau interdit dans ce test'); };
  w.getShop = async () => ({ success: true, data: structuredClone({ ...shop, ...extra }) });
  w.getShopPromotions = async () => ({ success: true, data: [] });
  w.getShopReviews = async () => ({ success: true, data: [] });
  w.isLoggedIn = () => vendeur;
  w.getCurrentUser = () => (vendeur ? { id: 'u1', role: 'SELLER' } : null);
  const demandes = [];
  w.apiCall = async url => {
    demandes.push(url);
    if (url === '/api/shops/me/shopvision/draft') return brouillon ? { success: true, data: brouillon } : { success: false };
    return url.endsWith('/shopvision/scenes') ? { success: true, data: scenes } : { success: true, data: [] };
  };
  w.applyBanner = () => {};
  w.eval(lire('boutique-visite.js'));
  w.eval(lire('boutique-visite-ui.js'));
  for (const s of w.document.querySelectorAll('script:not([src])')) w.eval(s.textContent);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await tick();
  return { w, demandes, q: s => w.document.querySelector(s), qa: s => [...w.document.querySelectorAll(s)] };
}

test('la page monte la visite avec les produits de la boutique', async () => {
  const { q, qa } = await charger();
  assert.equal(q('#bv').hidden, false);
  assert.deepEqual(qa('.bv-card .bv-name').map(e => e.textContent), ['Huile de baobab']);
  assert.equal(q('#bv-grid').classList.contains('bv-noscene'), true);
});

test('avec une photo publiee, la scene et son point apparaissent', async () => {
  const { q, qa } = await charger({ scenes: [{ id: 's1', title: 'Entrée', imageUrl: 'https://ex.test/a.jpg', hotspots: [{ id: 'h1', productId: 'p1', x: .5, y: .5 }] }] });
  assert.equal(q('#bv-stage').hidden, false);
  assert.equal(qa('.bv-spot').length, 1);
});

test('l ancienne vitrine et les faux produits ont disparu', async () => {
  const { q } = await charger();
  assert.equal(q('.visit-section'), null);
  assert.equal(q('#shopvision-scene-select'), null);
  assert.equal(q('#tab-boutique'), null);
  assert.equal(q('#tab-produits'), null);
  assert.ok(!sansCommentaires.includes('Mode Fatou Ndoye'));
  assert.ok(!sansCommentaires.includes('Boubou wax tissé main'));
});

test('ajouter au panier met a jour le compteur de la barre du site', async () => {
  const { q } = await charger();
  q('.bv-mini').click();
  assert.equal(q('#cart-count').textContent, '1');
});

test('les boutons Se connecter et panier menent aux vraies pages', () => {
  assert.ok(html.includes(`onclick="window.location.href='marche-senegal-connexion-acheteur.html'"`));
  assert.ok(html.includes(`onclick="window.location.href='marche-senegal-panier.html'"`));
  assert.ok(!html.includes(`toast('Connexion...')`));
  assert.ok(!html.includes(`toast('Panier...')`));
});

test('sans photos ShopVision, l ancienne vitrine du vendeur reste affichee', async () => {
  const { q, qa } = await charger({ extra: { showcaseUrl: 'https://ex.test/vitrine.jpg', showcaseHotspots: [{ id: 'v1', productId: 'p1', x: 50, y: 40 }] } });
  assert.equal(q('#bv-stage').hidden, false);
  assert.equal(q('#bv-img').getAttribute('src'), 'https://ex.test/vitrine.jpg');
  assert.equal(qa('.bv-spot').length, 1);
});

test('les photos ShopVision passent avant l ancienne vitrine', async () => {
  const { q } = await charger({ scenes: [{ id: 's1', title: 'Entrée', imageUrl: 'https://ex.test/a.jpg', hotspots: [] }], extra: { showcaseUrl: 'https://ex.test/vitrine.jpg' } });
  assert.equal(q('#bv-img').getAttribute('src'), 'https://ex.test/a.jpg');
});

const vueBrouillon = { id: 'd1', shopId: 'b1', title: 'Brouillon', imageUrl: 'https://ex.test/brouillon.jpg', hotspots: [], labels: [] };

test('aperçu du brouillon : le vendeur de la boutique voit ses vues non publiées', async () => {
  const { q, demandes } = await charger({
    adresse: '?id=b1&apercu=brouillon', vendeur: true,
    scenes: [{ id: 's1', title: 'En ligne', imageUrl: 'https://ex.test/en-ligne.jpg', hotspots: [] }],
    brouillon: { scenes: [vueBrouillon], rayonOrder: [] }
  });
  assert.equal(q('#bv-img').getAttribute('src'), 'https://ex.test/brouillon.jpg');
  assert.ok(!demandes.some(u => u.endsWith('/b1/shopvision/scenes')));
});

test('aperçu du brouillon d une autre boutique : la version publiée est montrée', async () => {
  const { q } = await charger({
    adresse: '?id=b1&apercu=brouillon', vendeur: true,
    scenes: [{ id: 's1', title: 'En ligne', imageUrl: 'https://ex.test/en-ligne.jpg', hotspots: [] }],
    brouillon: { scenes: [{ ...vueBrouillon, shopId: 'autre' }], rayonOrder: [] }
  });
  assert.equal(q('#bv-img').getAttribute('src'), 'https://ex.test/en-ligne.jpg');
});

test('aperçu demandé sans être vendeur : aucun appel au brouillon', async () => {
  const { q, demandes } = await charger({
    adresse: '?id=b1&apercu=brouillon', vendeur: false,
    scenes: [{ id: 's1', title: 'En ligne', imageUrl: 'https://ex.test/en-ligne.jpg', hotspots: [] }]
  });
  assert.ok(!demandes.includes('/api/shops/me/shopvision/draft'));
  assert.equal(q('#bv-img').getAttribute('src'), 'https://ex.test/en-ligne.jpg');
});
