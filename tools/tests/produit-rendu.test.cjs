// Ce que la fiche produit affiche vraiment, une fois les scripts exécutés.
//
// Le test voisin, contenu-honnete, lit le HTML servi : il garantit qu'aucune
// donnée inventée ne part du serveur. Il ne dit rien de ce qui s'affiche
// ensuite. Or vider un gabarit sans le remplir correctement laisse une fiche
// muette — le remède serait pire que le mal.
//
// Celui-ci vérifie donc les deux fonctions écrites pour remplacer le contenu
// d'exemple : renderSpecs(), qui reconstruit l'onglet « Caractéristiques » à
// partir du seul produit chargé, et brancherContactVendeur(), qui remplace un
// bouton affichant « Question envoyée ! » sans rien envoyer.

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

// Un produit tel que l'API en renvoie, avec les seuls champs que le modèle
// Prisma connaît réellement. Aucune donnée de production.
const PRODUIT = {
  id: 'prod-test-1',
  name: 'Sac tressé',
  description: 'Fait main.',
  price: 12000,
  stock: 7,
  sku: 'REF-TEST-01',
  weight: 350,
  sizes: ['M', 'L'],
  colors: ['Bleu'],
  preparationLabel: '2 jours',
  images: [],
  rating: 0,
  totalReviews: 0,
  totalSales: 0,
  category: { id: 'c1', name: 'Artisanat' },
  shop: { id: 'shop-test-9', name: 'Atelier Test', market: { id: 'm1', name: 'Marché Test' } }
};

async function pageProduit() {
  const html = lire('marche-senegal-produit.html');
  const dom = new JSDOM(html, {
    url: 'http://localhost:5500/marche-senegal-produit.html?id=prod-test-1',
    runScripts: 'outside-only'
  });
  const w = dom.window;

  w.scrollTo = () => {};
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.fetch = () => new Promise(() => {});

  w.eval(lire('api.js'));
  w.eval(scriptsInternes(html));

  return { dom, w, doc: w.document };
}

test('les caracteristiques affichent le produit charge, pas un exemple', async () => {
  const { dom, w, doc } = await pageProduit();

  w.renderSpecs(PRODUIT);

  const lignes = [...doc.querySelectorAll('#spec-rows tr')].map((tr) =>
    [...tr.querySelectorAll('td')].map((td) => td.textContent.trim())
  );
  const table = Object.fromEntries(lignes.filter((l) => l.length === 2));

  assert.equal(table['Catégorie'], 'Artisanat');
  assert.equal(table['Vendeur'], 'Atelier Test');
  assert.equal(table['Marché'], 'Marché Test');
  assert.equal(table['Tailles disponibles'], 'M · L');
  assert.equal(table['Poids'], '350 g');
  assert.equal(table['Référence'], 'REF-TEST-01');

  // Ce qui s'affichait avant sur toutes les fiches ne doit plus apparaître.
  const texte = doc.querySelector('.spec-table').textContent;
  assert.ok(!texte.includes('Garantie'), 'la garantie d\'exemple est revenue');
  assert.ok(!texte.includes('coton'), 'la matière d\'exemple est revenue');

  dom.window.close();
});

test('une caracteristique absente ne s invente pas', async () => {
  const { dom, w, doc } = await pageProduit();

  // Un vendeur qui n'a rempli ni poids, ni référence, ni tailles.
  w.renderSpecs({ ...PRODUIT, weight: null, sku: null, sizes: [], colors: [], preparationLabel: null });

  const intitules = [...doc.querySelectorAll('#spec-rows tr td:first-child')]
    .map((td) => td.textContent.trim());

  assert.ok(!intitules.includes('Poids'), 'un poids vide a produit une ligne');
  assert.ok(!intitules.includes('Référence'), 'une référence vide a produit une ligne');
  assert.ok(intitules.includes('Vendeur'), 'les lignes réellement renseignées ont disparu');

  dom.window.close();
});

test('un produit sans aucune caracteristique le dit au lieu de rester vide', async () => {
  const { dom, w, doc } = await pageProduit();

  w.renderSpecs({ id: 'x', name: 'Nu', sizes: [], colors: [] });

  const texte = doc.querySelector('#spec-rows').textContent;
  assert.match(texte, /n'a pas renseigné/, 'un tableau vide sans explication a été laissé');

  dom.window.close();
});

test('le bouton de contact ouvre la messagerie de la bonne boutique', async () => {
  const { dom, w, doc } = await pageProduit();

  w.brancherContactVendeur(PRODUIT);

  const bouton = doc.getElementById('qa-chat-btn');
  assert.notEqual(bouton, null, 'le bouton de contact a disparu de la page');
  assert.equal(bouton.disabled, false);

  // On intercepte la navigation plutôt que de la laisser se produire.
  let destination = null;
  delete w.location;
  w.location = { set href(v) { destination = v; }, get href() { return destination; } };

  bouton.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

  assert.equal(destination, 'marche-senegal-chat.html?shopId=shop-test-9',
    'le bouton n\'ouvre pas la conversation avec le vendeur du produit');

  dom.window.close();
});

test('sans boutique identifiee le bouton ne pretend pas fonctionner', async () => {
  const { dom, w, doc } = await pageProduit();

  // C'est exactement le défaut d'avant : un bouton qui a l'air de marcher et
  // ne mène nulle part. Mieux vaut qu'il se déclare indisponible.
  w.brancherContactVendeur({ id: 'x', name: 'Nu' });

  const bouton = doc.getElementById('qa-chat-btn');
  assert.equal(bouton.disabled, true, 'le bouton reste actif alors qu\'il ne peut rien ouvrir');

  dom.window.close();
});
