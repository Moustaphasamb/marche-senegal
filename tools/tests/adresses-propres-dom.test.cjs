// Les pages ouvertes par une adresse propre (/marches/<slug>, /boutiques/<id>,
// /produits/<id>) et ce qu'elles montrent à un lecteur sans JavaScript.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('../../../marche-senegal-mobile/node_modules/jsdom');

const racine = path.resolve(__dirname, '../..');
const lire = f => fs.readFileSync(path.join(racine, f), 'utf8');
const tick = () => new Promise(r => setTimeout(r, 30));
const UUID = '8a78d7af-08c6-46fd-9d89-c4406a716813';

// Le corps que lit un robot : ni scripts, ni styles, ni commentaires. L'en-tête est
// remplacé par la fonction serveur (titre, description), d'où son exclusion.
const balisage = f => lire(f).replace(/^[\s\S]*?<body/i, '<body').replace(/<script[\s\S]*?<\/script>/gi, '')
  .replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<!--[\s\S]*?-->/g, '');

async function chargerMarche(page, { marcheConnu = true } = {}) {
  const dom = new JSDOM(lire('marche-senegal-marche.html'),
    { url: 'http://localhost:5500/marches/sandaga', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.__MS_PAGE__ = page;
  // Une const déclarée dans un eval reste locale à cet eval : on expose celle dont la page a besoin.
  w.eval(lire('api.js') + ';window.nomCourtMarche = nomCourtMarche;');
  w.fetch = async () => { throw new Error('réseau interdit dans ce test'); };
  const appels = [];
  w.getMarket = async id => {
    appels.push(['getMarket', id]);
    return marcheConnu ? { success: true, data: { id: UUID, slug: 'sandaga', name: 'Marché Sandaga', city: 'Dakar', shops: [] } }
      : { success: false, message: 'Marché introuvable' };
  };
  w.getMarkets = async () => ({ success: true, data: [{ id: 'autre-lieu', name: 'Autre lieu', city: 'Hors marché' }] });
  w.getShops = async o => { appels.push(['getShops', o.marketId]); return { success: true, data: [] }; };
  w.getProducts = async o => { appels.push(['getProducts', o.marketId]); return { success: true, data: [] }; };
  w.getMarketCategories = async () => ({ success: true, data: [] });
  w.getFavorites = async () => ({ success: true, data: [] });
  w.isLoggedIn = () => false;
  w.applyBanner = () => {};
  w.eval(lire('guide-marche.js'));
  for (const s of w.document.querySelectorAll('script:not([src])')) w.eval(s.textContent);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await tick(); await tick();
  return appels;
}

test('marché servi sans données (API lente) : le slug est traduit en identifiant avant les listes', async () => {
  const appels = await chargerMarche({ type: 'marche', id: 'sandaga' });
  const listes = appels.filter(a => a[0] !== 'getMarket');
  assert.ok(listes.some(a => a[0] === 'getShops') && listes.some(a => a[0] === 'getProducts'));
  assert.ok(listes.every(a => a[1] === UUID), JSON.stringify(listes));
});

test('marché servi avec son identifiant : boutiques et produits de ce marché', async () => {
  const appels = await chargerMarche({ type: 'marche', id: UUID });
  assert.ok(appels.some(a => a[0] === 'getShops' && a[1] === UUID));
  assert.ok(!appels.some(a => a[1] === 'autre-lieu'));
});

test('marché introuvable : jamais un autre marché à la place', async () => {
  const appels = await chargerMarche({ type: 'marche', id: 'nexistepas' }, { marcheConnu: false });
  assert.ok(!appels.some(a => a[1] === 'autre-lieu'), JSON.stringify(appels));
});

test('« Aller au contenu » reste sur la page sous /marches/<slug>', () => {
  const dom = new JSDOM('<!DOCTYPE html><html><head><base href="/"></head><body><main>x</main></body></html>',
    { url: 'http://localhost:5500/marches/sandaga?x=1', runScripts: 'outside-only' });
  dom.window.eval(lire('design-marche.js'));
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
  const lien = dom.window.document.querySelector('.ms-skip');
  assert.equal(lien.href, 'http://localhost:5500/marches/sandaga?x=1#ms-main');
});

test('les modèles ne portent plus de marché, boutique ou prix d exemple', () => {
  for (const f of ['marche-senegal-marche.html', 'marche-senegal-boutique.html', 'marche-senegal-produit.html']) {
    const b = balisage(f);
    for (const exemple of ['Sandaga', 'Mode Fatou Ndoye', 'Boubou wax', '15 300', 'Mohamed V']) {
      assert.ok(!b.includes(exemple), `${f} contient encore « ${exemple} »`);
    }
  }
});
