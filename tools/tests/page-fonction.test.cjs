// La fonction Vercel qui sert /marches/:slug, /boutiques/:id et /produits/:id.
// Réseau et fichiers sont doublés : on vérifie les choix de la fonction, pas l'API.

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../../api/page.js');

const MODELE = '<html><head><title>t</title><meta name="description" content="d"/></head><body></body></html>';
const BOUTIQUE_ID = '523727ec-1ec3-4025-823a-4f66f6473506';
const PRODUIT_ID = '60489657-c7a7-4b08-810a-c49e26b5e950';
let appels;

function reponse() {
  return { statusCode: 200, entetes: {}, corps: '',
    setHeader(k, v) { this.entetes[k.toLowerCase()] = v; }, end(c) { this.corps = c; } };
}
const api = resultat => { handler.dependances.appelerApi = async chemin => { appels.push(chemin); return resultat; }; };

beforeEach(() => {
  appels = [];
  handler.dependances.lireModele = () => MODELE;
});

test('marché par slug : page remplie, cache long', async () => {
  api({ statut: 200, corps: { success: true, data: { id: 'm1', slug: 'sandaga', name: 'Marché Sandaga', city: 'Dakar', shops: [] } } });
  const res = reponse();
  await handler({ query: { type: 'marche', cle: 'sandaga' } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(appels.sort(), ['/markets/categories', '/markets/sandaga']);
  assert.match(res.corps, /<title>Marché Sandaga, Dakar/);
  assert.equal(res.entetes['cache-control'], 'public, s-maxage=600, stale-while-revalidate=86400');
  assert.equal(res.entetes['content-type'], 'text/html; charset=utf-8');
});

test('boutique et produit appellent la bonne route et le bon modèle', async () => {
  const lus = [];
  handler.dependances.lireModele = f => { lus.push(f); return MODELE; };
  api({ statut: 200, corps: { success: true, data: { id: BOUTIQUE_ID, name: 'B', products: [] } } });
  await handler({ query: { type: 'boutique', cle: BOUTIQUE_ID } }, reponse());
  api({ statut: 200, corps: { success: true, data: { id: PRODUIT_ID, name: 'P', price: 1 } } });
  await handler({ query: { type: 'produit', cle: PRODUIT_ID } }, reponse());
  assert.deepEqual(appels, [`/shops/${BOUTIQUE_ID}`, `/products/${PRODUIT_ID}`]);
  assert.deepEqual(lus, ['marche-senegal-boutique.html', 'marche-senegal-produit.html']);
});

test('introuvable : 404 noindex', async () => {
  api({ statut: 404, corps: { success: false } });
  const res = reponse();
  await handler({ query: { type: 'marche', cle: 'inconnu' } }, res);
  assert.equal(res.statusCode, 404);
  assert.match(res.corps, /noindex/);
  assert.match(res.corps, /<head><base href="\/">/);
  // Sans identifiant, la page afficherait le premier marché venu au lieu de dire « introuvable ».
  assert.ok(res.corps.includes('window.__MS_PAGE__={"type":"marche","id":"inconnu"}'));
});

test('produit retiré, boutique suspendue, marché inactif : 404 noindex, page affichée comme avant', async () => {
  const cas = [
    ['produit', PRODUIT_ID, { id: PRODUIT_ID, name: 'P', price: 1, status: 'INACTIVE' }],
    ['produit', PRODUIT_ID, { id: PRODUIT_ID, name: 'P', price: 1, status: 'ACTIVE', shop: { id: 's', name: 'S', status: 'SUSPENDED' } }],
    ['boutique', BOUTIQUE_ID, { id: BOUTIQUE_ID, name: 'B', status: 'SUSPENDED', products: [] }],
    ['marche', 'sandaga', { id: 'm1', slug: 'sandaga', name: 'M', city: 'Dakar', isActive: false, shops: [] }]
  ];
  for (const [type, cle, data] of cas) {
    api({ statut: 200, corps: { success: true, data } });
    const res = reponse();
    await handler({ query: { type, cle } }, res);
    assert.equal(res.statusCode, 404, `${type} ${JSON.stringify(data)}`);
    assert.match(res.corps, /noindex/);
    assert.doesNotMatch(res.corps, /data-ssr|canonical/);
    // Le vrai identifiant, pas le slug : la page peut charger boutiques et produits.
    assert.ok(res.corps.includes(`"id":"${data.id}"`));
  }
});

test('produit actif d une boutique active : publié', async () => {
  api({ statut: 200, corps: { success: true, data: { id: PRODUIT_ID, name: 'P', price: 1, status: 'ACTIVE', shop: { id: 's', name: 'S' } } } });
  const res = reponse();
  await handler({ query: { type: 'produit', cle: PRODUIT_ID } }, res);
  assert.equal(res.statusCode, 200);
});

test('API en panne : page d origine servie, cache court', async () => {
  handler.dependances.appelerApi = async () => { throw new Error('délai dépassé'); };
  const res = reponse();
  await handler({ query: { type: 'produit', cle: PRODUIT_ID } }, res);
  assert.equal(res.statusCode, 200);
  // Sans données, mais la page doit rester utilisable sous /produits/… : styles à la racine, identifiant connu.
  assert.match(res.corps, /<head><base href="\/">/);
  assert.ok(res.corps.includes(`window.__MS_PAGE__={"type":"produit","id":"${PRODUIT_ID}"}`));
  assert.doesNotMatch(res.corps, /data-ssr|noindex/);
  assert.equal(res.entetes['cache-control'], 'public, s-maxage=60');
});

test('API en erreur 500 : page d origine servie', async () => {
  api({ statut: 500, corps: { success: false } });
  const res = reponse();
  await handler({ query: { type: 'marche', cle: 'sandaga' } }, res);
  assert.equal(res.statusCode, 200);
  assert.match(res.corps, /<head><base href="\/">/);
});

test('clés piégées : 404 sans appel réseau', async () => {
  api({ statut: 200, corps: {} });
  const cas = [['marche', '../etc'], ['marche', 'a'.repeat(200)], ['marche', 'Sandaga'],
    ['boutique', 'sandaga'], ['produit', ''], ['produit', undefined], ['inconnu', 'x']];
  for (const [type, cle] of cas) {
    const res = reponse();
    await handler({ query: { type, cle } }, res);
    assert.equal(res.statusCode, 404, `${type}/${cle}`);
    assert.match(res.corps, /noindex/);
    // Jamais la clé piégée dans la page ; une page connue reçoit un identifiant qui n'existe pas.
    if (type !== 'inconnu') assert.ok(res.corps.includes(`{"type":"${type}","id":"introuvable"}`), `${type}/${cle}`);
  }
  assert.deepEqual(appels, []);
});

test('libellés des catégories indisponibles : la page marché sort quand même', async () => {
  handler.dependances.appelerApi = async c => (c === '/markets/categories' ? { statut: 500, corps: {} }
    : { statut: 200, corps: { success: true, data: { id: 'm1', slug: 'sandaga', name: 'Marché Sandaga', city: 'Dakar', description: 'x', categories: ['tissus'], shops: [] } } });
  const res = reponse();
  await handler({ query: { type: 'marche', cle: 'sandaga' } }, res);
  assert.equal(res.statusCode, 200);
  assert.match(res.corps, /FAQPage/);
  assert.doesNotMatch(res.corps, /Que trouve-t-on/);
});
