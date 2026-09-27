// Le « + » qui modifiait l'article d'à côté.
//
// Les lignes du panier retrouvaient leur article par son seul productId. Quand
// le même produit était présent deux fois (deux tailles, ou un panier par
// marché), « + » et 🗑 agissaient sur le PREMIER exemplaire trouvé, parfois
// caché dans le panier d'un autre marché. L'écran affichait « 2 » mais le
// sous-total restait à 99 000 FCFA, et l'article invisible passait à 2.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('../../../marche-senegal-mobile/node_modules/jsdom');

const racine = path.resolve(__dirname, '../..');
const lire = (f) => fs.readFileSync(path.join(racine, f), 'utf8');
const scripts = (html) => [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).join('\n');
const tick = (ms = 50) => new Promise(r => setTimeout(r, ms));

const article = (extra) => ({
  productId: 'p1', name: 'Arabe', price: 99000, quantity: 1,
  shopId: 's1', shopName: 'MINA DECO', ...extra
});

async function panier(cart, marche) {
  const html = lire('marche-senegal-panier.html');
  const dom = new JSDOM(html, { url: 'http://localhost:5500/marche-senegal-panier.html', runScripts: 'outside-only' });
  const w = dom.window;
  w.scrollTo = () => {};
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.CSS = { escape: s => String(s) };
  w.localStorage.setItem('cart', JSON.stringify(cart));
  w.fetch = async (url) => ({ ok: true, status: 200, json: async () => (
    String(url).includes('/payments/methods') ? { success: true, data: { methods: ['WAVE'] } } : { success: false }) });
  w.eval(lire('api.js'));
  w.eval(scripts(html));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await tick();
  if (marche) { w.eval(`selectMarket(${JSON.stringify(marche)})`); await tick(); }
  return {
    w,
    doc: w.document,
    stocke: () => JSON.parse(w.localStorage.getItem('cart')),
    sousTotal: () => w.document.getElementById('subtotal').textContent.replace(/\s/g, ' ')
  };
}

test('« + » agit sur l article affiché, pas sur son double d un autre marché', async () => {
  const p = await panier([
    article({ marketId: 'm0', marketName: 'Autre lieu' }),
    article({ marketId: 'm1', marketName: 'Marché des Castors' })
  ], 'm1');

  p.doc.querySelector('[data-qty-delta="1"]').click();
  await tick();

  assert.equal(p.doc.querySelector('.qty-num').textContent.trim(), '2');
  assert.equal(p.sousTotal(), '198 000 FCFA');
  assert.deepEqual(p.stocke().map(i => i.quantity), [1, 2]);
});

test('deux tailles du même produit se règlent séparément', async () => {
  const p = await panier([
    article({ marketId: 'm1', size: 'M' }),
    article({ marketId: 'm1', size: 'L' })
  ]);

  p.doc.querySelectorAll('[data-qty-delta="1"]')[1].click();
  await tick();

  assert.deepEqual(p.stocke().map(i => `${i.size}:${i.quantity}`), ['M:1', 'L:2']);
  assert.deepEqual([...p.doc.querySelectorAll('.qty-num')].map(n => n.textContent.trim()), ['1', '2']);
  assert.equal(p.sousTotal(), '297 000 FCFA');
});

test('🗑 retire l article affiché et laisse son double', async () => {
  const p = await panier([
    article({ marketId: 'm1', size: 'M' }),
    article({ marketId: 'm1', size: 'L' })
  ]);

  p.doc.querySelectorAll('[data-remove-item]')[1].click();
  await tick();

  assert.deepEqual(p.stocke().map(i => i.size), ['M']);
});
