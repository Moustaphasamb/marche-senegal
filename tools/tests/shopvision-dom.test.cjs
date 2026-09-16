// Tests de l'éditeur sans navigateur ni base réelle. JSDOM est fourni par les
// dépendances de test du dépôt mobile voisin ; aucun service externe n'est appelé.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('../../../marche-senegal-mobile/node_modules/jsdom');
const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'marche-senegal-shopvision.html'), 'utf8');
const core = fs.readFileSync(path.join(root, 'shopvision/core.js'), 'utf8');
const studio = fs.readFileSync(path.join(root, 'shopvision/studio.js'), 'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve, 15));
async function setup(options = {}) {
  const dom = new JSDOM(html, { url: 'http://localhost:5500/marche-senegal-shopvision.html', runScripts: 'outside-only' });
  const w = dom.window, calls = [];
  let sceneRecords = structuredClone(options.scenes || []);
  const shop = { id: 's1', name: 'Boutique de test', status: options.status || 'ACTIVE', showcaseUrl: 'https://example.test/photo.jpg', showcaseHotspots: [{ id: 'h1', productId: 'p1', x: 30, y: 40 }] };
  const products = [{ id: 'p1', shopId: 's1', name: '<img src=x onerror=alert(1)>', price: 12500, stock: 4, status: 'ACTIVE', images: [] }];
  w.structuredClone = structuredClone;
  w.crypto.randomUUID = require('node:crypto').randomUUID;
  w.ResizeObserver = class { observe() {} };
  w.CSS = { escape: s => s };
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.isLoggedIn = () => !options.signedOut;
  w.getCurrentUser = () => ({ id: 'u1', role: options.role || 'SELLER' });
  w.getDashboard = async () => options.failure ? { success: false, message: 'Serveur indisponible' } : { success: true, data: { shop: structuredClone(shop) } };
  w.getMyProducts = async () => ({ success: true, data: products });
  w.getProduct = async () => ({ success: true, data: products[0] });
  w.remplirIdentiteMenu = () => {};
  w.formatPrice = p => p + ' FCFA';
  w.toggleSidebar = () => {};
  w.apiCall = async (url, request) => {
    if (request?.method) calls.push({ url, request });
    if (url.endsWith('/publish')) {
      const id = url.split('/').at(-2), scene = sceneRecords.find(item => item.id === id) || { id };
      Object.assign(scene, { status: 'PUBLISHED' });
      if (!sceneRecords.includes(scene)) sceneRecords.push(scene);
      return { success: true, data: structuredClone(scene) };
    }
    if (url === '/api/shops/me/shopvision/scenes' && request?.method === 'POST') {
      const scene = { id: 'scene-new', status: 'DRAFT' }; sceneRecords.push(scene);
      return { success: true, data: structuredClone(scene) };
    }
    if (url === '/api/shops/me/shopvision/scenes') return { success: true, data: structuredClone(sceneRecords) };
    if (url.includes('/shopvision/scenes/') && request?.method === 'PUT') {
      const id = url.split('/').at(-1), scene = sceneRecords.find(item => item.id === id) || { id, status: 'DRAFT' };
      if (!sceneRecords.includes(scene)) sceneRecords.push(scene);
      return { success: true, data: structuredClone(scene) };
    }
    return { success: true };
  };
  w.indexedDB = { open() { throw new Error('Pas de stockage dans ce test'); } };
  w.eval(core); w.eval(studio); await tick();
  return { dom, w, $: id => w.document.getElementById(id), calls };
}
test('sans connexion, acces vendeur visible et aucune publication possible', async () => {
  const { dom, $, calls } = await setup({ signedOut: true });
  assert.equal($('accessPanel').hidden, false); assert.equal($('publishButton').disabled, true);
  assert.equal(calls.length, 0); dom.window.close();
});
test('le catalogue charge echappe les noms et restaure les points reels', async () => {
  const { dom, $ } = await setup();
  assert.equal($('hotspotCount').textContent, '1');
  assert.match($('hotspotList').textContent, /<img/); assert.equal($('hotspotList').querySelector('[onerror]'), null);
  assert.equal($('sceneImage').getAttribute('src'), 'https://example.test/photo.jpg'); dom.window.close();
});
test('annuler un nouveau point ne change pas le brouillon', async () => {
  const { dom, $ } = await setup();
  $('addHotspot').click(); assert.equal($('hotspotDialog').open, true);
  $('hotspotDialog').querySelector('[data-close]').click();
  assert.equal($('hotspotDialog').open, false); assert.equal($('hotspotCount').textContent, '1');
  assert.equal($('publishButton').disabled, true); dom.window.close();
});
test('un point non confirme bloque la publication sans appel API', async () => {
  const { dom, w, $, calls } = await setup();
  $('addHotspot').click(); $('productSelect').value = 'p1';
  $('hotspotForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  $('publishButton').click(); await tick();
  assert.match($('feedback').textContent, /Vérifiez/); assert.equal(calls.length, 0); dom.window.close();
});
test('validation puis publication transmettent les points au contrat existant', async () => {
  const { dom, w, $, calls } = await setup();
  $('addHotspot').click(); $('productSelect').value = 'p1'; $('pointApproved').checked = true;
  $('hotspotForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  $('publishButton').click(); assert.equal($('confirmDialog').open, true); $('confirmAccept').click(); await tick();
  assert.deepEqual(calls.map(call => call.url), [
    '/api/shops/me/shopvision/scenes',
    '/api/shops/me/shopvision/scenes/scene-new/publish',
    '/api/shops/me/showcase'
  ]);
  const payload = JSON.parse(calls[2].request.body);
  assert.equal(payload.hotspots.length, 2); assert.deepEqual(Object.keys(payload.hotspots[1]).sort(), ['productId', 'x', 'y']);
  assert.equal($('sceneStatus').textContent, 'Publiée'); dom.window.close();
});
test('la publication d’une scène ShopVision brouillon appelle aussi la route de publication', async () => {
  const { dom, w, $, calls } = await setup({ scenes: [{ id: 'scene-1', title: 'Scène test', status: 'DRAFT', imageUrl: 'https://example.test/scene.jpg', hotspots: [{ id: 'h1', productId: 'p1', x: 0.3, y: 0.4 }] }] });
  $('addHotspot').click(); $('productSelect').value = 'p1'; $('pointApproved').checked = true;
  $('hotspotForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  $('publishButton').click(); $('confirmAccept').click(); await tick(); await tick();
  assert.deepEqual(calls.map(call => call.url), [
    '/api/shops/me/shopvision/scenes/scene-1',
    '/api/shops/me/shopvision/scenes/scene-1/publish',
    '/api/shops/me/showcase'
  ]);
  assert.match($('feedback').textContent, /visite multi-photo/); dom.window.close();
});
test('ajouter une scène repart sur un brouillon vide sans effacer les scènes enregistrées', async () => {
  const { dom, $, calls } = await setup({ scenes: [{ id: 'scene-1', title: 'Scène existante', status: 'PUBLISHED', imageUrl: 'https://example.test/scene.jpg', hotspots: [{ id: 'h1', productId: 'p1', x: 0.3, y: 0.4 }] }] });
  $('newSceneButton').click(); assert.equal($('confirmDialog').open, true);
  $('confirmAccept').click(); await tick();
  assert.equal($('sceneSelect').value, '');
  assert.equal($('sceneSelect').querySelector('option[value="scene-1"]').textContent, 'Scène existante');
  assert.equal($('sceneImage').hasAttribute('src'), false);
  assert.match($('saveState').textContent, /Nouvelle scène/);
  assert.deepEqual(calls, []); dom.window.close();
});
test('apercu du brouillon disponible sans publier et sans panier de demonstration', async () => {
  const { dom, $, calls } = await setup();
  $('previewButton').click(); assert.equal($('customerDialog').open, true);
  assert.equal($('customerHotspots').children.length, 1); assert.equal(calls.length, 0);
  $('customerHotspots').firstChild.click(); await tick();
  assert.match($('previewProduct').textContent, /12500 FCFA/);
  assert.equal($('previewProduct').querySelector('a').getAttribute('href'), 'marche-senegal-produit.html?id=p1'); dom.window.close();
});
test('un echec du chargement ne propose ni publication ni catalogue fictif', async () => {
  const { dom, $ } = await setup({ failure: true });
  assert.match($('accessMessage').textContent, /Serveur indisponible/);
  assert.equal($('retryButton').hidden, false); assert.equal($('publishButton').disabled, true); dom.window.close();
});
test('boutique non active : preparation possible mais publication desactivee', async () => {
  const { dom, $ } = await setup({ status: 'PENDING' });
  assert.equal($('emptyUpload').disabled, false); assert.equal($('publishButton').disabled, true);
  assert.match($('accessTitle').textContent, /validation/); dom.window.close();
});
