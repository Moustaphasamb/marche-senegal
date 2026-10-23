// /marches sans marché précisé : la page montre la liste des marchés au lieu
// d'ouvrir le premier renvoyé par le serveur (souvent un marché sans boutique).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('../../../marche-senegal-mobile/node_modules/jsdom');

const racine = path.resolve(__dirname, '../..');
const lire = f => fs.readFileSync(path.join(racine, f), 'utf8');
const tick = () => new Promise(r => setTimeout(r, 30));

const MARCHES = [
  { id: 'm1', slug: 'diaobe-louma', name: 'Louma de Diaobé', city: 'Diaobé-Kabendou', region: 'Kolda', imageUrl: null, _count: { shops: 0 } },
  { id: 'm2', slug: 'sandaga', name: 'Marché Sandaga', city: 'Dakar', region: 'Dakar', imageUrl: null, _count: { shops: 2 } },
  { id: 'm3', slug: 'tilene', name: 'Marché Tilène', city: 'Dakar', region: 'Dakar', imageUrl: null, _count: { shops: 1 } },
  { id: 'm4', slug: 'thies-central', name: 'Marché Central de Thiès', city: 'Thiès', region: 'Thiès', imageUrl: null, _count: { shops: 0 } }
];

async function chargerListe({ marches = MARCHES, url = 'http://localhost:5500/marche' } = {}) {
  const dom = new JSDOM(lire('marche-senegal-marche.html'),
    { url, runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.eval(lire('api.js') + ';window.nomCourtMarche = nomCourtMarche;');
  w.fetch = async () => { throw new Error('réseau interdit dans ce test'); };
  const appels = [];
  w.getMarkets = async () => { appels.push(['getMarkets']); return marches ? { success: true, data: marches } : { success: false, message: 'hors ligne' }; };
  w.getMarket = async id => { appels.push(['getMarket', id]); return { success: false }; };
  w.getShops = async o => { appels.push(['getShops', o.marketId]); return { success: true, data: [] }; };
  w.getProducts = async o => { appels.push(['getProducts', o.marketId]); return { success: true, data: [] }; };
  w.getMarketCategories = async () => ({ success: true, data: [] });
  w.getFavorites = async () => ({ success: true, data: [] });
  w.isLoggedIn = () => false;
  w.applyBanner = () => {};
  w.eval(lire('guide-marche.js'));
  w.eval(lire('faq-marche.js'));
  for (const s of w.document.querySelectorAll('script:not([src])')) w.eval(s.textContent);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await tick(); await tick();
  return { w, d: w.document, appels };
}

const noms = d => [...d.querySelectorAll('.lm-nom')].map(n => n.textContent);

test('sans marché demandé : la liste s\'affiche et aucun marché n\'est ouvert à la place', async () => {
  const { d, appels } = await chargerListe();
  assert.equal(d.getElementById('liste-marches').hidden, false);
  assert.ok(d.body.classList.contains('mode-liste-marches'));
  assert.equal(d.querySelector('h1').textContent, 'Les marchés du Sénégal');
  assert.ok(!appels.some(a => a[0] === 'getShops' || a[0] === 'getProducts'), JSON.stringify(appels));
  assert.match(d.title, /Les marchés du Sénégal/);
});

test('les marchés qui ont des boutiques passent devant, puis ordre alphabétique', async () => {
  const { d } = await chargerListe();
  assert.deepEqual(noms(d), ['Marché Sandaga', 'Marché Tilène', 'Louma de Diaobé', 'Marché Central de Thiès']);
  const etats = [...d.querySelectorAll('.lm-etat')].map(e => e.textContent);
  assert.deepEqual(etats, ['2 boutiques en ligne', '1 boutique en ligne', 'Boutiques bientôt en ligne', 'Boutiques bientôt en ligne']);
});

test('chaque carte est un vrai lien vers l\'adresse propre du marché', async () => {
  const { d } = await chargerListe();
  const liens = [...d.querySelectorAll('a.lm-carte')].map(a => a.getAttribute('href'));
  assert.deepEqual(liens, ['/marches/sandaga', '/marches/tilene', '/marches/diaobe-louma', '/marches/thies-central']);
});

test('recherche sans accents et filtre par région', async () => {
  const { w, d } = await chargerListe();
  const champ = d.getElementById('lm-recherche');
  champ.value = 'thies';
  champ.dispatchEvent(new w.Event('input'));
  assert.deepEqual(noms(d), ['Marché Central de Thiès']);

  champ.value = '';
  champ.dispatchEvent(new w.Event('input'));
  d.querySelector('.lm-region[data-region="Dakar"]').click();
  assert.deepEqual(noms(d), ['Marché Sandaga', 'Marché Tilène']);
  assert.equal(d.querySelector('.lm-region[data-region="Dakar"]').getAttribute('aria-pressed'), 'true');
  assert.match(d.getElementById('lm-compte').textContent, /2 marchés dans la région de Dakar/);
});

test('aucun résultat : message et bouton pour tout revoir', async () => {
  const { w, d } = await chargerListe();
  const champ = d.getElementById('lm-recherche');
  champ.value = 'introuvable';
  champ.dispatchEvent(new w.Event('input'));
  assert.equal(d.getElementById('lm-vide').hidden, false);
  d.getElementById('lm-effacer').click();
  assert.equal(noms(d).length, 4);
  assert.equal(d.getElementById('lm-vide').hidden, true);
});

test('serveur injoignable : message clair, pas de liste vide muette', async () => {
  const { d } = await chargerListe({ marches: null });
  assert.equal(d.querySelectorAll('.lm-carte').length, 0);
  assert.match(d.getElementById('lm-compte').textContent, /n'a pas pu être chargée/);
});

test('le nom d\'un marché est échappé', async () => {
  const { d } = await chargerListe({ marches: [{ id: 'x', slug: 'x', name: '<img src=x onerror=alert(1)>', city: 'Dakar', region: 'Dakar', _count: { shops: 0 } }] });
  assert.equal(d.querySelector('.lm-nom img'), null);
  assert.equal(d.querySelector('.lm-nom').textContent, '<img src=x onerror=alert(1)>');
});
