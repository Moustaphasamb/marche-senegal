// Rangée et lecteur de stories dans un vrai DOM (jsdom), sans réseau.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('../../../marche-senegal-mobile/node_modules/jsdom');
const racine = path.resolve(__dirname, '../..');
const lire = f => fs.readFileSync(path.join(racine, f), 'utf8');
const attendre = ms => new Promise(r => setTimeout(r, ms));
// Fermer les fenêtres : leurs minuteries de lecture garderaient Node en vie.
const fenetres = [];
after(() => fenetres.forEach(w => w.close()));

const photo = (id, h) => ({ id, mediaType: 'PHOTO', mediaUrl: `https://res.cloudinary.com/d/image/upload/v1/marche-senegal/stories/b/${id}.jpg`, caption: 'Arrivage ' + id, createdAt: new Date(Date.now() - h * 3600e3).toISOString(), product: null });
const groupes = () => [
  { shop: { id: 'b1', name: 'Awa Beauté', avatarUrl: null, plan: 'FREE' }, stories: [photo('a1', 3), { ...photo('a2', 2), product: { id: 'p1', name: 'Huile', price: 4500, image: null } }] },
  { shop: { id: 'b2', name: 'Tissus Sow', avatarUrl: 'https://res.cloudinary.com/d/image/upload/logo.jpg', plan: 'PRO' }, stories: [photo('b1s', 5)] }
];

function monter() {
  const dom = new JSDOM('<!doctype html><body><section id="r" hidden><div class="st-rangee-liste"></div></section></body>', { url: 'https://marchesenegal.sn/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  fenetres.push(w);
  w.eval(lire('stories.js'));
  w.eval(lire('stories-ui.js'));
  const journal = { vues: [], clics: [], produits: [], reponses: [], fermetures: 0 };
  const options = {
    stockage: w.localStorage, visiteur: '0b6f3c1e-1111-4222-8333-444455556666', dureePhoto: 40,
    marquerVue: (id, cle) => journal.vues.push([id, cle]),
    clicProduit: id => journal.clics.push(id),
    allerProduit: id => journal.produits.push(id),
    repondre: (s, shop) => journal.reponses.push([s.id, shop.id]),
    surFermeture: () => { journal.fermetures++; }
  };
  return { w, d: w.document, options, journal };
}

test('la rangée : Pro non vue d’abord, nom, initiales ; vide : cachée', () => {
  const { w, d, options } = monter();
  const section = d.getElementById('r');
  w.StoriesUI.monterRangee(section, groupes(), options);
  assert.equal(section.hidden, false);
  const ronds = [...d.querySelectorAll('.st-rond')];
  assert.deepEqual(ronds.map(r => r.querySelector('.st-nom').textContent), ['Tissus Sow', 'Awa Beauté']);
  assert.equal(ronds[1].querySelector('.st-mini').textContent, 'AB');
  assert.equal(ronds[0].querySelector('.st-mini img').src, 'https://res.cloudinary.com/d/image/upload/logo.jpg');
  assert.equal(ronds[0].getAttribute('aria-label'), 'Voir les stories de Tissus Sow');
  w.StoriesUI.monterRangee(section, [], options);
  assert.equal(section.hidden, true);
});

test('le cercle montre la story elle-même, celle qui s’ouvrira', () => {
  const { w, d, options } = monter();
  const section = d.getElementById('r');
  w.StoriesUI.monterRangee(section, groupes(), options);
  const apercu = () => [...d.querySelectorAll('.st-rond')].map(r => r.querySelector('.st-anneau img.st-apercu').src);
  assert.deepEqual(apercu(), [
    'https://res.cloudinary.com/d/image/upload/c_fill,w_160,h_160,q_auto,f_auto/v1/marche-senegal/stories/b/b1s.jpg',
    'https://res.cloudinary.com/d/image/upload/c_fill,w_160,h_160,q_auto,f_auto/v1/marche-senegal/stories/b/a1.jpg'
  ]);
  // a1 vue : le cercle d'Awa montre a2, la prochaine à voir.
  w.StoriesCore.noterVue(options.stockage, 'a1');
  w.StoriesUI.monterRangee(section, groupes(), options);
  assert.equal(apercu()[1], 'https://res.cloudinary.com/d/image/upload/c_fill,w_160,h_160,q_auto,f_auto/v1/marche-senegal/stories/b/a2.jpg');
});

test('ses propres stories : pas de bouton « Répondre »', () => {
  const { w, d, options } = monter();
  options.dureePhoto = 100000;
  options.estMaBoutique = id => id === 'b1';
  w.StoriesUI.ouvrir(groupes(), 0, options);
  assert.equal(d.querySelector('.st-repondre').hidden, true);
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowRight' }));
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowRight' }));
  assert.equal(d.querySelector('.st-nom-lecteur').textContent, 'Tissus Sow');
  assert.equal(d.querySelector('.st-repondre').hidden, false);
});

test('optionsSite : la boutique du vendeur connecté est reconnue', () => {
  const { w } = monter();
  w.getCurrentUser = () => ({ role: 'SELLER', shop: { id: 'b1' } });
  const o = w.StoriesUI.optionsSite();
  assert.equal(o.estMaBoutique('b1'), true);
  assert.equal(o.estMaBoutique('b2'), false);
  w.getCurrentUser = () => ({ role: 'BUYER' });
  assert.equal(w.StoriesUI.optionsSite().estMaBoutique('b1'), false);
  w.getCurrentUser = () => { throw new Error('stockage bloqué'); };
  assert.equal(w.StoriesUI.optionsSite().estMaBoutique('b1'), false);
});

test('le lecteur : vue notée, avance seul, passe à la boutique suivante puis se ferme', async () => {
  const { w, d, options, journal } = monter();
  w.StoriesUI.ouvrir(groupes(), 0, options);
  const lecteur = d.querySelector('.st-lecteur');
  assert.equal(lecteur.getAttribute('role'), 'dialog');
  assert.equal(d.querySelector('.st-nom-lecteur').textContent, 'Awa Beauté');
  assert.equal(d.querySelector('.st-legende').textContent, 'Arrivage a1');
  assert.equal(d.querySelector('.st-produit').hidden, true);
  assert.deepEqual(journal.vues[0], ['a1', '0b6f3c1e-1111-4222-8333-444455556666']);
  d.querySelector('.st-media img').dispatchEvent(new w.Event('load'));
  await attendre(60);
  assert.equal(d.querySelector('.st-legende').textContent, 'Arrivage a2');
  assert.equal(d.querySelector('.st-produit').hidden, false);
  d.querySelector('.st-media img').dispatchEvent(new w.Event('load'));
  await attendre(50);
  assert.equal(d.querySelector('.st-nom-lecteur').textContent, 'Tissus Sow');
  d.querySelector('.st-media img').dispatchEvent(new w.Event('load'));
  await attendre(50);
  assert.equal(d.querySelector('.st-lecteur'), null);
  assert.equal(journal.fermetures, 1);
  assert.deepEqual([...w.StoriesCore.vuesDe(w.localStorage)].sort(), ['a1', 'a2', 'b1s']);
});

test('touches : droite avance, gauche revient, Échap ferme ; boutons produit et répondre', () => {
  const { w, d, options, journal } = monter();
  options.dureePhoto = 100000;
  w.StoriesUI.ouvrir(groupes(), 0, options);
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowRight' }));
  assert.equal(d.querySelector('.st-legende').textContent, 'Arrivage a2');
  d.querySelector('.st-produit').click();
  assert.deepEqual(journal.clics, ['a2']);
  assert.deepEqual(journal.produits, ['p1']);
  d.querySelector('.st-repondre').click();
  assert.deepEqual(journal.reponses, [['a2', 'b1']]);
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowLeft' }));
  assert.equal(d.querySelector('.st-legende').textContent, 'Arrivage a1');
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal(d.querySelector('.st-lecteur'), null);
});

test('un média qui ne charge pas est sauté', () => {
  const { w, d, options } = monter();
  options.dureePhoto = 100000;
  w.StoriesUI.ouvrir(groupes(), 0, options);
  d.querySelector('.st-media img').dispatchEvent(new w.Event('error'));
  assert.equal(d.querySelector('.st-legende').textContent, 'Arrivage a2');
});

test('rouvrir une boutique reprend à la première story non vue', () => {
  const { w, d, options } = monter();
  options.dureePhoto = 100000;
  w.StoriesCore.noterVue(w.localStorage, 'a1');
  w.StoriesUI.ouvrir(groupes(), 0, options);
  assert.equal(d.querySelector('.st-legende').textContent, 'Arrivage a2');
});

test('revue : en 4G, la photo ne compte son temps qu’une fois arrivée', async () => {
  const { w, d, options } = monter();
  options.dureePhoto = 30;
  options.attenteMax = 100000;
  w.StoriesUI.ouvrir(groupes(), 0, options);
  await attendre(60);
  assert.equal(d.querySelector('.st-legende').textContent, 'Arrivage a1');
  d.querySelector('.st-media img').dispatchEvent(new w.Event('load'));
  await attendre(60);
  assert.equal(d.querySelector('.st-legende').textContent, 'Arrivage a2');
});

test('revue : une photo qui n’arrive jamais est passée après le délai de secours', async () => {
  const { w, d, options } = monter();
  options.dureePhoto = 100000;
  options.attenteMax = 40;
  w.StoriesUI.ouvrir(groupes(), 0, options);
  await attendre(80);
  assert.equal(d.querySelector('.st-legende').textContent, 'Arrivage a2');
});
