// L'ancien studio ShopVision est remplacé par l'assistant « Ma vitrine » : plus aucun reste.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const lire = f => fs.readFileSync(path.join(__dirname, '../..', f), 'utf8');

test('plus de styles de l ancien studio', () => {
  for (const f of ['design-marche.css', 'identite-vendeur.css']) assert.doesNotMatch(lire(f), /\.sv-/, f);
});

test('la page Ma boutique parle de « Ma vitrine », plus du studio', () => {
  const page = lire('marche-senegal-ma-boutique.html');
  assert.doesNotMatch(page, /studio ShopVision|Ouvrir le studio/);
  assert.match(page, /Ma vitrine/);
});
