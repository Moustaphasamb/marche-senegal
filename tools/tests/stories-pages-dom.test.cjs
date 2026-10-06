// Stories sur l'accueil et la page boutique, avec une API doublée.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('../../../marche-senegal-mobile/node_modules/jsdom');
const racine = path.resolve(__dirname, '../..');
const lire = f => fs.readFileSync(path.join(racine, f), 'utf8');
const tick = () => new Promise(r => setTimeout(r, 40));
// Fermer les fenêtres : leurs minuteries garderaient Node en vie.
const fenetres = [];
after(() => fenetres.forEach(w => w.close()));

const groupe = { shop: { id: 'b1', name: 'Awa Beauté', avatarUrl: null, plan: 'PRO' }, stories: [{ id: 's1', mediaType: 'PHOTO', mediaUrl: 'https://res.cloudinary.com/d/image/upload/v1/marche-senegal/stories/b1/a.jpg', caption: null, createdAt: new Date().toISOString(), product: null }] };

test('accueil : la section existe, juste avant le panier marché', () => {
  const html = lire('marche-senegal-accueil.html');
  assert.ok(html.indexOf('id="stories-rangee"') > 0);
  assert.ok(html.indexOf('id="stories-rangee"') < html.indexOf('class="market-basket"'));
  assert.match(html, /<script src="stories\.js"><\/script>\s*<script src="stories-ui\.js"><\/script>/);
  assert.match(html, /href="stories\.css"/);
});

// Seule chargerStories est évaluée : le reste de l'accueil a son propre test.
async function accueil(reponse) {
  const html = lire('marche-senegal-accueil.html');
  const dom = new JSDOM(html, { url: 'https://marchesenegal.sn/marche-senegal-accueil.html', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  fenetres.push(w);
  w.eval(lire('api.js'));
  w.eval(lire('stories.js'));
  w.eval(lire('stories-ui.js'));
  w.getStories = async () => { if (reponse instanceof Error) throw reponse; return reponse; };
  const source = html.match(/async function chargerStories\(\) \{[\s\S]*?\n\}/)[0];
  const chargerStories = w.eval('(' + source + ')');
  await chargerStories();
  await tick();
  return w.document;
}

test('accueil : rangée remplie, cachée si vide ou en erreur', async () => {
  let d = await accueil({ success: true, data: [groupe] });
  assert.equal(d.getElementById('stories-rangee').hidden, false);
  assert.equal(d.querySelectorAll('#stories-rangee .st-rond').length, 1);
  d = await accueil({ success: true, data: [] });
  assert.equal(d.getElementById('stories-rangee').hidden, true);
  d = await accueil(new Error('réseau'));
  assert.equal(d.getElementById('stories-rangee').hidden, true);
});

async function boutique(groupeDeLaBoutique) {
  const dom = new JSDOM(lire('marche-senegal-boutique.html'), { url: 'http://localhost:5500/marche-senegal-boutique.html?id=b1', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  fenetres.push(w);
  w.eval(lire('api.js'));
  w.fetch = async () => { throw new Error('réseau interdit'); };
  w.getShop = async () => ({ success: true, data: { id: 'b1', name: 'Awa Beauté', status: 'ACTIVE', market: { name: 'Sandaga' }, reviews: [], _count: { products: 0, reviews: 0 }, products: [] } });
  w.getShopPromotions = async () => ({ success: true, data: [] });
  w.getShopReviews = async () => ({ success: true, data: [] });
  w.getShopStories = async () => ({ success: true, data: groupeDeLaBoutique });
  w.isLoggedIn = () => false;
  w.getCurrentUser = () => null;
  w.apiCall = async () => ({ success: true, data: [] });
  w.applyBanner = () => {};
  for (const f of ['boutique-visite.js', 'boutique-visite-ui.js', 'stories.js', 'stories-ui.js']) w.eval(lire(f));
  for (const s of w.document.querySelectorAll('script:not([src])')) w.eval(s.textContent);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await tick();
  return w;
}

test('boutique : anneau sur le logo et ouverture du lecteur', async () => {
  const w = await boutique(groupe);
  const logo = w.document.querySelector('.sh-avatar');
  assert.ok(logo.classList.contains('st-logo-actif'));
  assert.equal(logo.getAttribute('role'), 'button');
  logo.click();
  assert.ok(w.document.querySelector('.st-lecteur'));
});

test('boutique sans story : pas d’anneau', async () => {
  const w = await boutique(null);
  assert.equal(w.document.querySelector('.sh-avatar').classList.contains('st-logo-actif'), false);
});
