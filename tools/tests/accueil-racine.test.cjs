// L'adresse courte https://marchesenegal.sn/ sert l'accueil elle-même, sans
// page de redirection : c'est l'adresse que Google doit retenir.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const racine = path.resolve(__dirname, '../..');
const lire = f => fs.readFileSync(path.join(racine, f), 'utf8');

test('aucun index.html : Vercel le servirait avant la réécriture', () => {
  assert.equal(fs.existsSync(path.join(racine, 'index.html')), false);
});

test('vercel.json : / sert l’accueil, /index.html renvoie vers /', () => {
  const config = JSON.parse(lire('vercel.json'));
  assert.ok(config.rewrites.some(r => r.source === '/' && r.destination === '/marche-senegal-accueil.html'));
  assert.ok(config.redirects.some(r => r.source === '/index.html' && r.destination === '/' && r.permanent));
});

test('l’accueil désigne / comme adresse officielle', () => {
  const html = lire('marche-senegal-accueil.html');
  assert.match(html, /<link rel="canonical" href="https:\/\/marchesenegal\.sn\/"\/>/);
  assert.doesNotMatch(html, /"url": "https:\/\/marchesenegal\.sn\/marche-senegal-accueil\.html"/);
  assert.match(html, /google-site-verification/);
});

test('llms.txt pointe l’accueil sur /', () => {
  assert.match(lire('llms.txt'), /\[Accueil\]\(https:\/\/marchesenegal\.sn\/\)/);
});
