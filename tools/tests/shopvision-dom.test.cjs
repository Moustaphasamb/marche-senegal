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
  w.apiCall = async (url, request) => { calls.push({ url, request }); return { success: true }; };
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
  assert.equal(calls.length, 1); assert.equal(calls[0].url, '/api/shops/me/showcase');
  const payload = JSON.parse(calls[0].request.body);
  assert.equal(payload.hotspots.length, 2); assert.deepEqual(Object.keys(payload.hotspots[1]).sort(), ['productId', 'x', 'y']);
  assert.equal($('sceneStatus').textContent, 'Publiée'); dom.window.close();
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
