// La page publique de la garantie : ce qu'elle promet doit être ce que le
// serveur applique (M-07), et on doit pouvoir la trouver.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const racine = path.resolve(__dirname, '../..');
const lire = f => fs.readFileSync(path.join(racine, f), 'utf8');
const page = lire('marche-senegal-garantie.html');
const texte = page.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('les règles M-07 sont dites en clair', () => {
  for (const attendu of ['48 h', 'changement d’avis', 'mauvaise taille', 'à la charge du vendeur', 'Tout est conforme', 'Signaler un problème']) {
    assert.ok(texte.includes(attendu), 'manque : ' + attendu);
  }
});

test('adresse officielle, pas d’emoji, pas de délai de remboursement inventé', () => {
  assert.match(page, /<link rel="canonical" href="https:\/\/marchesenegal\.sn\/marche-senegal-garantie"\/>/);
  assert.doesNotMatch(page, /\p{Extended_Pictographic}/u);
  assert.doesNotMatch(texte, /sous \d+ jours?|en \d+ heures? ouvr/);
});

test('la page est liée depuis l’accueil, la fiche produit et le panier', () => {
  for (const f of ['marche-senegal-accueil.html', 'marche-senegal-produit.html', 'marche-senegal-panier.html']) {
    assert.match(lire(f), /href="marche-senegal-garantie.html"/, f);
  }
});

test('la page est dans le plan du site', () => {
  assert.match(lire('api/sitemap.js'), /'\/marche-senegal-garantie'/);
});

test('relecture : la fiche produit ne promet le séquestre qu’au paiement en ligne', () => {
  const ligne = lire('marche-senegal-produit.html').split(/\r?\n/).find(l => l.includes('class="garantie-ligne"'));
  assert.match(ligne, /paiement en ligne/);
});
