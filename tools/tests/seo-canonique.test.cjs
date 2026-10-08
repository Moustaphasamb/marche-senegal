// Adresses officielles des pages fixes données à Google.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const racine = path.resolve(__dirname, '../..');
const lire = f => fs.readFileSync(path.join(racine, f), 'utf8');

test('la recherche désigne son adresse sans paramètre comme officielle', () => {
  assert.match(lire('marche-senegal-recherche.html'),
    /<link rel="canonical" href="https:\/\/marchesenegal\.sn\/marche-senegal-recherche\.html"\/>/);
});

test('la page marché, modèle de /marches/:slug, n’a pas de canonical fixe', () => {
  // api/page.js ajoute la sienne ; une seconde en dur ferait de tous les marchés une seule page.
  assert.doesNotMatch(lire('marche-senegal-marche.html'), /rel="canonical"/);
});
