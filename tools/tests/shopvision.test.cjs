const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../../shopvision/core');
const products = [{ id: 'p1', status: 'ACTIVE' }, { id: 'p2', status: 'PAUSED' }, { id: 'deleted', status: 'DELETED' }];
const state = () => ({ image: 'https://example.test/photo.jpg', hotspots: [{ id: 'h1', productId: 'p1', x: 12, y: 45, approved: true }] });
test('la publication ne transmet que les vrais identifiants et les positions', () => {
  assert.deepEqual(core.publication(state(), products), [{ productId: 'p1', x: 12, y: 45 }]);
});
test('un produit etranger ou supprime ne peut etre publie', () => {
  for (const id of ['other-shop', 'deleted']) { const s = state(); s.hotspots[0].productId = id; assert.throws(() => core.publication(s, products)); }
});
test('un point non verifie bloque toute la publication', () => {
  const s = state(); s.hotspots.push({ id: 'h2', productId: 'p2', x: 1, y: 2, approved: false });
  assert.throws(() => core.publication(s, products), /Vérifiez/);
});
test('photo et point sont obligatoires', () => {
  assert.throws(() => core.publication({ image: null, hotspots: [] }, products));
  assert.throws(() => core.publication({ image: 'https://example.test/a', hotspots: [] }, products));
});
test('positions invalides et nombre excessif de points refuses', () => {
  for (const x of [NaN, Infinity, -1, 101, '50', null]) { const s = state(); s.hotspots[0].x = x; assert.throws(() => core.publication(s, products)); }
  const s = state(); s.hotspots = Array(51).fill(s.hotspots[0]); assert.throws(() => core.publication(s, products));
  assert.equal(core.coordinate(0), true); assert.equal(core.coordinate(100), true);
});
test('les URLs actives et locales non publiees ne sont pas des medias publics', () => {
  for (const url of ['javascript:alert(1)', 'data:image/svg+xml,x', 'blob:abc', 'file:///private', null]) assert.equal(core.safeImageUrl(url), null);
  assert.equal(core.safeImageUrl('https://example.test/a.jpg'), 'https://example.test/a.jpg');
});
test('le brouillon est strictement lie au compte et a sa boutique', () => {
  const draft = { schema: 1, ownerId: 'u1', shopId: 's1', base: 'snapshot', hotspots: state().hotspots };
  assert.equal(core.validDraft(draft, 'u1', 's1'), true);
  assert.equal(core.validDraft(draft, 'u2', 's1'), false);
  assert.equal(core.validDraft(draft, 'u1', 's2'), false);
  assert.equal(core.validDraft({ ...draft, hotspots: [{ x: 20 }] }, 'u1', 's1'), false);
});
test('un changement de prix ne modifie pas la geometrie, un changement de photo oui', () => {
  const a = { showcaseUrl: 'https://example.test/a', showcaseHotspots: [{ productId: 'p1', x: 10, y: 20, product: { price: 20 } }] };
  const b = structuredClone(a); b.showcaseHotspots[0].product.price = 30;
  assert.equal(core.snapshot(a), core.snapshot(b));
  b.showcaseUrl = 'https://example.test/b'; assert.notEqual(core.snapshot(a), core.snapshot(b));
});
