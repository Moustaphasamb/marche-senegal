// Le panier fantôme de l'accueil.
//
// L'accueil affiche huit cartes produits écrites en dur, le temps que l'API
// réponde. Leur bouton « + » appelait addCartFromBtn, qui lisait le nom et le
// prix dans le HTML et fabriquait un identifiant « static-… ». Si l'API
// tardait ou échouait, l'acheteur remplissait donc un panier de produits
// inexistants, à des prix inventés, et ne l'apprenait qu'au paiement — quand
// le serveur refusait l'identifiant.
//
// Le contenu de démonstration attendait en plus la fin du chargement des
// marchés avant de céder la place : sur une connexion lente, cela faisait
// plusieurs secondes de faux produits cliquables.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('../../../marche-senegal-mobile/node_modules/jsdom');

const racine = path.resolve(__dirname, '../..');
const lire = (f) => fs.readFileSync(path.join(racine, f), 'utf8');

function scriptsInternes(html) {
  const morceaux = [];
  const motif = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let trouve;
  while ((trouve = motif.exec(html)) !== null) morceaux.push(trouve[1]);
  return morceaux.join('\n');
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

// L'API est LENTE, pas en panne. C'est la distinction qui compte : une API
// qui échoue tout de suite laisse le code vider la grille aussitôt, et le
// défaut ne se voit pas. C'est l'attente — le temps réel d'une connexion
// mobile sénégalaise — qui laissait les fausses cartes à l'écran, cliquables.
// Un premier jet de ce test bouchonnait un échec immédiat : il passait sur la
// version defectueuse, donc il ne mesurait rien.
async function accueilSansApi() {
  const html = lire('marche-senegal-accueil.html');
  const dom = new JSDOM(html, {
    url: 'http://localhost:5500/marche-senegal-accueil.html',
    runScripts: 'outside-only'
  });
  const w = dom.window;

  w.scrollTo = () => {};
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.fetch = () => new Promise(() => {});  // ne se résout jamais

  w.eval(lire('api.js'));
  w.eval(scriptsInternes(html));

  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await tick();

  return { dom, w, doc: w.document };
}

test('les cartes de demonstration cedent la place sans attendre le reseau', async () => {
  const { dom, doc } = await accueilSansApi();

  const grille = doc.getElementById('products-grid');
  assert.notEqual(grille, null);
  assert.equal(grille.querySelectorAll('.prod-card').length, 0,
    'des cartes ecrites en dur sont restees affichees');

  dom.window.close();
});

test('aucun bouton de la page ne peut plus fabriquer un article statique', async () => {
  const { dom, w, doc } = await accueilSansApi();

  assert.equal(typeof w.addCartFromBtn, 'undefined',
    'la fonction qui inventait un identifiant static- existe encore');
  assert.equal(doc.querySelectorAll('[onclick*="addCartFromBtn"]').length, 0);

  dom.window.close();
});

test('l attente est dite, la grille ne devient pas un trou blanc', async () => {
  // Retirer les fausses cartes ne suffit pas : si la place restait vide, on
  // aurait troqué un mensonge contre une page cassée. L'acheteur doit voir
  // qu'on charge.
  const { dom, doc } = await accueilSansApi();

  const grille = doc.getElementById('products-grid');
  assert.match(grille.textContent, /[Cc]hargement/,
    'rien n indique que les produits sont en cours de chargement');

  dom.window.close();
});

// Garde-fou : la source elle-même ne doit plus contenir de fabrication d'id.
test('plus aucune page ne fabrique d identifiant a partir du HTML', () => {
  for (const page of fs.readdirSync(racine).filter(f => f.endsWith('.html'))) {
    const source = lire(page);
    assert.equal(/'static-'\s*\+|"static-"\s*\+/.test(source), false,
      page + ' fabrique encore un identifiant static-');
  }
});
