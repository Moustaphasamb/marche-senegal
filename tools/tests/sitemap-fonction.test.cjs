// Le sitemap construit depuis l'API (api/sitemap.js), réseau doublé.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../../api/sitemap.js');

function reponse() {
  return { statusCode: 200, entetes: {}, corps: '',
    setHeader(k, v) { this.entetes[k.toLowerCase()] = v; }, end(c) { this.corps = c; } };
}
const DONNEES = {
  '/markets': [{ id: 'm1', slug: 'sandaga' }, { id: 'm2', slug: null }],
  '/shops?limit=500': [{ id: 's1' }],
  '/products?limit=500': [{ id: 'p1' }]
};

test('liste pages fixes, marchés avec slug, boutiques, produits', async () => {
  handler.dependances.appelerApi = async c => ({ statut: 200, corps: { success: true, data: DONNEES[c] } });
  const res = reponse();
  await handler({}, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.entetes['content-type'], 'application/xml; charset=utf-8');
  for (const u of ['/marche-senegal-accueil.html', '/marches/sandaga', '/boutiques/s1', '/produits/p1']) {
    assert.ok(res.corps.includes(`<loc>https://marche-senegal-zeta.vercel.app${u}</loc>`), u);
  }
  assert.doesNotMatch(res.corps, /m2/);
  assert.match(res.corps, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
});

test('API en panne : 503 pour que Google revienne plus tard', async () => {
  handler.dependances.appelerApi = async () => { throw new Error('panne'); };
  const res = reponse();
  await handler({}, res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.entetes['retry-after'], '3600');
});

test('réponse sans tableau : 503, pas un sitemap vide', async () => {
  handler.dependances.appelerApi = async () => ({ statut: 200, corps: { success: true, data: { erreur: 1 } } });
  const res = reponse();
  await handler({}, res);
  assert.equal(res.statusCode, 503);
});
