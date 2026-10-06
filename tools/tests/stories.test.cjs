// Règles des stories côté site : ordre de la rangée, navigation, adresses, mémoire.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../../stories.js');

const H = 3600 * 1000;
const T = Date.UTC(2026, 9, 6, 12);
const g = (id, plan, heures, ids) => ({ shop: { id, name: id, plan }, stories: ids.map((s, i) => ({ id: s, createdAt: new Date(T - (heures - i) * H).toISOString() })) });

function memoire() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}

test('rangée : non vues d’abord, puis Pro, puis les plus récentes', () => {
  const groupes = [g('gratuit-recent', 'FREE', 1, ['a']), g('pro-ancien', 'PRO', 5, ['b']), g('vu-pro', 'BUSINESS', 0.5, ['c']), g('gratuit-ancien', 'FREE', 6, ['d'])];
  const ordre = C.ordonnerRangee(groupes, new Set(['c']));
  assert.deepEqual(ordre.map(x => x.shop.id), ['pro-ancien', 'gratuit-recent', 'gratuit-ancien', 'vu-pro']);
});

test('rangée : groupes vides ou mal formés écartés', () => {
  assert.deepEqual(C.ordonnerRangee([null, { shop: { id: 'x' }, stories: [] }, { stories: [{ id: 'a' }] }], new Set()), []);
  assert.deepEqual(C.ordonnerRangee(undefined, new Set()), []);
});

test('navigation : suivante, boutique suivante, fin ; précédente', () => {
  const gs = [g('a', 'FREE', 3, ['a1', 'a2']), g('b', 'FREE', 2, ['b1'])];
  assert.deepEqual(C.suivante(gs, { g: 0, s: 0 }), { g: 0, s: 1 });
  assert.deepEqual(C.suivante(gs, { g: 0, s: 1 }), { g: 1, s: 0 });
  assert.equal(C.suivante(gs, { g: 1, s: 0 }), null);
  assert.deepEqual(C.precedente(gs, { g: 1, s: 0 }), { g: 0, s: 1 });
  assert.deepEqual(C.precedente(gs, { g: 0, s: 0 }), { g: 0, s: 0 });
  assert.equal(C.premiereAVoir(gs[0], new Set(['a1'])), 1);
  assert.equal(C.premiereAVoir(gs[0], new Set(['a1', 'a2'])), 0);
});

test('adresses légères : photo 1080, vidéo 720 coupée à 45 s, vignettes', () => {
  const photo = { mediaType: 'PHOTO', mediaUrl: 'https://res.cloudinary.com/d/image/upload/v1/marche-senegal/stories/b1/a.png' };
  const video = { mediaType: 'VIDEO', mediaUrl: 'https://res.cloudinary.com/d/video/upload/v1/marche-senegal/stories/b1/a.mov' };
  assert.equal(C.adresseMedia(photo), 'https://res.cloudinary.com/d/image/upload/c_limit,w_1080,q_auto,f_auto/v1/marche-senegal/stories/b1/a.png');
  assert.equal(C.adresseMedia(video), 'https://res.cloudinary.com/d/video/upload/c_limit,w_720,q_auto,vc_auto,du_45/v1/marche-senegal/stories/b1/a.mp4');
  assert.equal(C.affiche(video), 'https://res.cloudinary.com/d/video/upload/so_0,c_limit,w_720/v1/marche-senegal/stories/b1/a.jpg');
  assert.equal(C.vignette(video), 'https://res.cloudinary.com/d/video/upload/so_0,c_fill,w_160,h_160/v1/marche-senegal/stories/b1/a.jpg');
  assert.equal(C.adresseMedia({ mediaType: 'PHOTO', mediaUrl: 'javascript:alert(1)' }), null);
  assert.equal(C.vignette(null), null);
});

test('mémoire : vues gardées (300 au plus), identifiant stable, stockage bloqué toléré', () => {
  const m = memoire();
  for (let i = 0; i < 310; i++) C.noterVue(m, 'id' + i);
  const vues = C.vuesDe(m);
  assert.equal(vues.size, 300);
  assert.ok(vues.has('id309') && !vues.has('id0'));
  const fab = () => '0b6f3c1e-1111-4222-8333-444455556666';
  assert.equal(C.identifiantVisiteur(m, fab), fab());
  assert.equal(C.identifiantVisiteur(m, () => 'autre'), fab());
  const bloque = { getItem() { throw new Error('bloqué'); }, setItem() { throw new Error('bloqué'); } };
  assert.equal(C.vuesDe(bloque).size, 0);
  assert.doesNotThrow(() => C.noterVue(bloque, 'x'));
  assert.equal(C.identifiantVisiteur(bloque, fab), fab());
});

test('textes : il y a, temps restant, initiales, durée, limite', () => {
  assert.equal(C.ilYA(new Date(T - 30 * 1000), T), 'à l’instant');
  assert.equal(C.ilYA(new Date(T - 12 * 60 * 1000), T), 'il y a 12 min');
  assert.equal(C.ilYA(new Date(T - 2 * H - 5), T), 'il y a 2 h');
  assert.equal(C.tempsRestant(new Date(T + 7 * H + 10), T), 'encore 7 h');
  assert.equal(C.tempsRestant(new Date(T + 20 * 60 * 1000), T), 'encore 20 min');
  assert.equal(C.tempsRestant(new Date(T - 1), T), 'terminée');
  assert.equal(C.initiales('Awa Beauté'), 'AB');
  assert.equal(C.initiales(''), '?');
  assert.equal(C.refusDuree(45.3), null);
  assert.equal(C.refusDuree(30), null);
  assert.equal(C.refusDuree(NaN), null);
  assert.equal(C.refusDuree(52.2), 'Votre vidéo dure 52 s. Une story dure 45 secondes au plus : coupez-la dans la galerie de votre téléphone, puis réessayez.');
  assert.equal(C.messageLimite('FREE', new Date(T + 5 * H - 60000), T), 'Avec le plan Gratuit, vous publiez 1 story par jour. Votre prochaine story est possible dans 5 h. Passez Pro pour en publier autant que vous voulez.');
  assert.equal(C.messageLimite('PRO', null, T), 'Vous avez publié 30 stories en 24 h.');
});

test('api.js : lecture publique sans redirection, clic en keepalive', async () => {
  const { JSDOM } = require('../../../marche-senegal-mobile/node_modules/jsdom');
  const dom = new JSDOM('<!doctype html>', { url: 'https://marchesenegal.sn/marche-senegal-accueil.html', runScripts: 'outside-only' });
  const w = dom.window;
  w.eval(fs.readFileSync(path.resolve(__dirname, '../../api.js'), 'utf8'));
  const appels = [];
  w.fetch = async (url, options) => { appels.push({ url, options }); return { status: 401, json: async () => ({ success: false }) }; };
  w.localStorage.setItem('token', 'perime');
  await w.getStories();
  await w.clicProduitStory('s1');
  assert.equal(w.location.pathname, '/marche-senegal-accueil.html');
  assert.equal(appels[1].options.keepalive, true);
  assert.match(appels[0].url, /\/api\/stories$/);
});
